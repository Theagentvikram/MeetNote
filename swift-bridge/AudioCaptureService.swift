//
//  AudioCaptureService.swift
//  MeetNote
//
//  Created by AMMUAARU on 01/03/26.
//  Stabilised: thread-safe capture, proper mixing, reliable teardown.
//

import Foundation
import ScreenCaptureKit
import AVFoundation
import Observation

/// Core audio capture engine — thread-safe, dual-track, reliable.
///
/// Architecture:
/// - **Mic**: AVAudioEngine inputNode tap → writes to mic .m4a
/// - **System**: ScreenCaptureKit audio stream → writes to sys .m4a
/// - **Merge**: AVMutableComposition mixes BOTH into a single mixed-down .m4a
///
/// All file writes go through `fileQueue` (serial). Converters are created
/// per-session and protected by the queue.
@Observable
final class AudioCaptureService: NSObject {

    // MARK: - Public State

    var isRecording = false
    var isPaused = false
    var elapsedTime: TimeInterval = 0

    // UI level meters
    var micLevel: Float = 0
    var systemLevel: Float = 0

    var errorMessage: String?
    var currentRecordingURL: URL?

    // MARK: - Private

    private var audioEngine: AVAudioEngine?
    private var micFile: AVAudioFile?
    private var sysFile: AVAudioFile?

    private var micURL: URL?
    private var sysURL: URL?

    private var displayTimer: Timer?
    private var startTime: Date?

    /// Serial queue for ALL file writes — prevents concurrent AVAudioFile access.
    private let fileQueue = DispatchQueue(label: "com.meetnote.audio.file", qos: .userInitiated)

    /// Queue for ScreenCaptureKit audio sample delivery.
    private let audioQueue = DispatchQueue(label: "com.meetnote.audio.capture", qos: .userInteractive)

    private var scStream: SCStream?

    /// Reusable system-audio converter, created once per recording session on fileQueue.
    private var sysConverter: AVAudioConverter?
    private var sysSourceFormat: AVAudioFormat?
    private var sysTargetFormat: AVAudioFormat?

    /// Observer for AVAudioEngine configuration change (SCK can disrupt the IO unit)
    private var configObserver: NSObjectProtocol?

    // Cached values needed for engine restart
    private var cachedMicConverter: AVAudioConverter?
    private var cachedTargetFormat: AVAudioFormat?

    // Settings
    private let sampleRate: Double = 48000
    private let channelCount: AVAudioChannelCount = 2

    /// Atomic flag — set synchronously before engine starts, cleared before teardown.
    /// Tap callbacks check this to avoid writing after files are closed.
    private var _isCapturing = false

    // MARK: - Permission State (observable by UI)

    var micPermission: PermissionState = .unknown
    var screenPermission: PermissionState = .unknown
    var needsRestart = false  // True when Screen Recording was just granted and app must restart

    enum PermissionState: String {
        case unknown, granted, denied, needsPrompt
    }

    // MARK: - Permission Checks

    /// Refresh permission state without triggering prompts. Call on app launch & before recording.
    func refreshPermissionState() async {
        // Mic
        let micStatus = AVCaptureDevice.authorizationStatus(for: .audio)
        await MainActor.run {
            switch micStatus {
            case .authorized:    self.micPermission = .granted
            case .denied, .restricted: self.micPermission = .denied
            case .notDetermined: self.micPermission = .needsPrompt
            @unknown default:    self.micPermission = .unknown
            }
        }

        // Screen Recording
        if AppSettings.shared.captureSystemAudio {
            let granted = await Self.checkScreenRecordingPermission()
            await MainActor.run {
                self.screenPermission = granted ? .granted : .denied
            }
        } else {
            await MainActor.run { self.screenPermission = .granted } // not needed
        }
    }

    /// Check if Screen Recording permission is granted.
    static func checkScreenRecordingPermission() async -> Bool {
        do {
            _ = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
            return true
        } catch {
            return false
        }
    }

    /// Called on app launch — only prompt Screen Recording (system audio).
    /// Mic will be prompted later when user clicks Record, so a Screen Recording
    /// restart won't invalidate a freshly-granted mic.
    func warmUpScreenRecordingPermission() async {
        if AppSettings.shared.captureSystemAudio {
            let granted = await Self.checkScreenRecordingPermission()
            await MainActor.run {
                self.screenPermission = granted ? .granted : .denied
            }
        } else {
            await MainActor.run { self.screenPermission = .granted }
        }

        // Also refresh mic state (no prompt — just read current status)
        let micStatus = AVCaptureDevice.authorizationStatus(for: .audio)
        await MainActor.run {
            switch micStatus {
            case .authorized:    self.micPermission = .granted
            case .denied, .restricted: self.micPermission = .denied
            case .notDetermined: self.micPermission = .needsPrompt
            @unknown default:    self.micPermission = .unknown
            }
        }
    }

    /// Pre-flight before recording.
    /// 1. Screen Recording must already be granted (prompted on launch).
    /// 2. Mic is prompted HERE — only when user clicks Record — so a
    ///    Screen Recording restart can't invalidate it.
    private func preflight() async throws {
        // 1. Screen Recording — must already be granted (no prompt here)
        if AppSettings.shared.captureSystemAudio {
            let screenOK = await Self.checkScreenRecordingPermission()
            await MainActor.run { self.screenPermission = screenOK ? .granted : .denied }
            if !screenOK {
                throw CaptureError.screenRecordingDenied
            }
        }

        // 2. Mic — prompt now if needed (this is the first time we ask)
        let micStatus = AVCaptureDevice.authorizationStatus(for: .audio)
        switch micStatus {
        case .notDetermined:
            let granted = await AVCaptureDevice.requestAccess(for: .audio)
            await MainActor.run { self.micPermission = granted ? .granted : .denied }
            if !granted { throw CaptureError.microphoneDenied }
            // Give macOS time to activate the device after first grant
            try? await Task.sleep(for: .milliseconds(500))
        case .denied, .restricted:
            await MainActor.run { self.micPermission = .denied }
            throw CaptureError.microphoneDenied
        case .authorized:
            await MainActor.run { self.micPermission = .granted }
        @unknown default:
            break
        }
    }

    // MARK: - Start Recording

    func startRecording() async throws {
        guard !isRecording else { return }

        errorMessage = nil

        // 0. Pre-flight — check ALL permissions BEFORE touching any audio hardware
        try await preflight()

        // 1. Temp files for mic + system
        let tempDir = FileManager.default.temporaryDirectory
        let sessionID = UUID().uuidString
        let mURL = tempDir.appendingPathComponent("mic_\(sessionID).m4a")
        let sURL = tempDir.appendingPathComponent("sys_\(sessionID).m4a")

        self.micURL = mURL
        self.sysURL = sURL

        try? FileManager.default.removeItem(at: mURL)
        try? FileManager.default.removeItem(at: sURL)

        // 2. Final merged output path
        let settings = AppSettings.shared
        let fileName = "MeetNote_\(ISO8601DateFormatter().string(from: Date())).m4a"
            .replacingOccurrences(of: ":", with: "-")
        self.currentRecordingURL = settings.recordingsDirectory.appendingPathComponent(fileName)

        // 3. Set capturing flag BEFORE starting engines so tap callbacks
        //    can write from the very first buffer.
        self._isCapturing = true

        // 4. Start audio engines (permissions already confirmed)
        do {
            try await startAudioCapture(micURL: mURL, sysURL: sURL)
        } catch {
            self._isCapturing = false
            throw error
        }

        // 5. Set UI state on main thread
        await MainActor.run {
            self.isRecording = true
            self.startTime = Date()
            self.displayTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
                guard let self = self, let start = self.startTime else { return }
                self.elapsedTime = Date().timeIntervalSince(start)
            }
        }
    }

    // MARK: - Stop Recording

    /// Returns (mergedURL, micURL, sysURL).
    func stopRecording() async -> (merged: URL?, mic: URL?, sys: URL?) {
        guard isRecording else { return (nil, nil, nil) }

        // 1. Flag FIRST — stops tap callbacks from writing
        _isCapturing = false

        // 2. Stop timer + UI on main thread
        await MainActor.run {
            self.displayTimer?.invalidate()
            self.displayTimer = nil
            self.micLevel = 0
            self.systemLevel = 0
            self.isRecording = false
            self.isPaused = false
        }

        // 3. Tear down audio engine (removes taps)
        if let obs = configObserver {
            NotificationCenter.default.removeObserver(obs)
            configObserver = nil
        }
        audioEngine?.inputNode.removeTap(onBus: 0)
        audioEngine?.stop()
        audioEngine = nil

        // 4. Stop ScreenCaptureKit stream
        if let stream = scStream {
            try? await stream.stopCapture()
            scStream = nil
        }

        // 5. Flush file queue — wait for ALL pending writes to complete
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            fileQueue.async {
                continuation.resume()
            }
        }

        // 6. Close files AFTER queue is drained
        micFile = nil
        sysFile = nil
        sysConverter = nil
        sysSourceFormat = nil
        sysTargetFormat = nil
        cachedMicConverter = nil
        cachedTargetFormat = nil

        // 7. Merge into single mixed-down file
        guard let outputURL = self.currentRecordingURL else { return (nil, micURL, sysURL) }

        let hasMicFile = micURL.map { FileManager.default.fileExists(atPath: $0.path) } ?? false
        let hasSysFile = sysURL.map { FileManager.default.fileExists(atPath: $0.path) } ?? false

        // Check file sizes — a file can exist but be empty/corrupt
        let micSize = hasMicFile ? ((try? FileManager.default.attributesOfItem(atPath: micURL!.path)[.size] as? Int) ?? 0) : 0
        let sysSize = hasSysFile ? ((try? FileManager.default.attributesOfItem(atPath: sysURL!.path)[.size] as? Int) ?? 0) : 0

        NSLog("[MeetNote] Raw files — Mic: %dKB, System: %dKB", micSize/1024, sysSize/1024)

        let micUsable = micSize > 1024   // > 1KB = has actual audio data
        let sysUsable = sysSize > 1024

        if micUsable && sysUsable {
            do {
                try await mergeAudioFiles(micURL: micURL!, sysURL: sysURL!, outputURL: outputURL)
                let mergedSize = (try? FileManager.default.attributesOfItem(atPath: outputURL.path)[.size] as? Int) ?? 0
                NSLog("[MeetNote] Merged mic + system -> %@ (%dKB)", outputURL.lastPathComponent, mergedSize/1024)
            } catch {
                NSLog("[MeetNote] Merge failed: %@ — falling back to mic-only", error.localizedDescription)
                try? FileManager.default.copyItem(at: micURL!, to: outputURL)
            }
        } else if micUsable {
            try? FileManager.default.copyItem(at: micURL!, to: outputURL)
            NSLog("[MeetNote] Mic-only output (system audio was empty)")
        } else if sysUsable {
            try? FileManager.default.copyItem(at: sysURL!, to: outputURL)
            NSLog("[MeetNote] System-only output (mic was empty)")
        } else {
            NSLog("[MeetNote] No usable audio files captured!")
            return (nil, nil, nil)
        }

        let finalSize = (try? FileManager.default.attributesOfItem(atPath: outputURL.path)[.size] as? Int) ?? 0
        NSLog("[MeetNote] Final output: %dKB", finalSize/1024)

        return (currentRecordingURL, micUsable ? micURL : nil, sysUsable ? sysURL : nil)
    }

    // MARK: - Audio Engine Setup

    private func startAudioCapture(micURL: URL, sysURL: URL) async throws {
        // Permissions already verified by preflight()

        // Output format for AAC files
        let outputSettings: [String: Any] = [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: sampleRate,
            AVNumberOfChannelsKey: channelCount,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
            AVEncoderBitRateKey: 128000
        ]

        // PCM target for internal processing
        guard let targetFormat = AVAudioFormat(
            commonFormat: .pcmFormatFloat32,
            sampleRate: sampleRate,
            channels: channelCount,
            interleaved: false
        ) else { throw CaptureError.formatCreationFailed }

        // Store target format for system audio converter
        self.sysTargetFormat = targetFormat
        self.cachedTargetFormat = targetFormat

        // Create file writers
        micFile = try AVAudioFile(forWriting: micURL, settings: outputSettings)
        sysFile = try AVAudioFile(forWriting: sysURL, settings: outputSettings)

        // ─── STEP 1: Start ScreenCaptureKit FIRST ───────────────────────
        // SCK reconfigures the audio IO unit when it starts, which would kill
        // an already-running AVAudioEngine. So we start SCK first and let it
        // settle before starting the mic engine.
        if AppSettings.shared.captureSystemAudio {
            do {
                try await startScreenCaptureKitAudio()
                print("✅ ScreenCaptureKit system audio active")
                // Wait for IO unit reconfiguration to settle
                try? await Task.sleep(for: .milliseconds(800))
                print("🔊 Waited 800ms for SCK IO stabilization")
            } catch {
                print("⚠️ System audio failed despite permission: \(error.localizedDescription)")
                await MainActor.run {
                    self.errorMessage = "System audio failed — recording mic only."
                }
            }
        } else {
            print("ℹ️ System audio disabled by user setting.")
        }

        // ─── STEP 2: Start Microphone AFTER SCK is stable ──────────────
        try await startMicEngine(targetFormat: targetFormat)
    }

    /// Start (or restart) the AVAudioEngine for mic capture.
    /// Can be called when the engine is first set up or after a config change.
    private func startMicEngine(targetFormat: AVAudioFormat) async throws {
        // Tear down any existing engine first
        if let existingEngine = audioEngine {
            existingEngine.inputNode.removeTap(onBus: 0)
            existingEngine.stop()
            audioEngine = nil
        }

        // Remove old observer
        if let obs = configObserver {
            NotificationCenter.default.removeObserver(obs)
            configObserver = nil
        }

        // Create engine, retrying up to 5 times if the input device isn't ready
        var engine = AVAudioEngine()
        var inputFormat = engine.inputNode.outputFormat(forBus: 0)

        for attempt in 1...5 {
            if inputFormat.sampleRate > 0 && inputFormat.channelCount > 0 {
                print("🎤 Mic format ready on attempt \(attempt): \(inputFormat.sampleRate)Hz, \(inputFormat.channelCount)ch")
                break
            }
            print("🎤 Mic format not ready (attempt \(attempt)/5), waiting...")
            try? await Task.sleep(for: .milliseconds(500))
            engine = AVAudioEngine()
            inputFormat = engine.inputNode.outputFormat(forBus: 0)
        }

        guard inputFormat.sampleRate > 0, inputFormat.channelCount > 0 else {
            print("❌ Mic format invalid after all retries: \(inputFormat)")
            throw CaptureError.microphoneDenied
        }

        let inputNode = engine.inputNode
        inputFormat = inputNode.outputFormat(forBus: 0)
        print("🎤 Final mic format: \(inputFormat.sampleRate)Hz, \(inputFormat.channelCount)ch")

        // Create converter for mic
        let needsConversion = inputFormat.sampleRate != sampleRate || inputFormat.channelCount != channelCount
        var micConverter: AVAudioConverter?

        if needsConversion {
            micConverter = AVAudioConverter(from: inputFormat, to: targetFormat)
            guard micConverter != nil else { throw CaptureError.formatCreationFailed }
            print("🎤 Mic converter: \(inputFormat.sampleRate)Hz/\(inputFormat.channelCount)ch → \(sampleRate)Hz/\(channelCount)ch")
        } else {
            print("🎤 Mic format matches target — no conversion needed")
        }

        self.cachedMicConverter = micConverter

        // Install mic tap
        inputNode.installTap(onBus: 0, bufferSize: 4096, format: inputFormat) { [weak self] buffer, _ in
            guard let self = self, self._isCapturing else { return }

            let rms = self.calculateRMS(buffer: buffer)
            DispatchQueue.main.async { self.micLevel = rms }

            let writeBuffer: AVAudioPCMBuffer
            if let converter = micConverter {
                let ratio = self.sampleRate / inputFormat.sampleRate
                let frameCapacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio)
                guard frameCapacity > 0,
                      let converted = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: frameCapacity)
                else { return }

                var error: NSError?
                var consumed = false
                converter.convert(to: converted, error: &error) { _, outStatus in
                    if consumed { outStatus.pointee = .noDataNow; return nil }
                    consumed = true; outStatus.pointee = .haveData; return buffer
                }
                guard error == nil, converted.frameLength > 0 else { return }
                writeBuffer = converted
            } else {
                writeBuffer = buffer
            }

            self.fileQueue.async { [weak self] in
                guard let self = self, self._isCapturing, let file = self.micFile else { return }
                do { try file.write(from: writeBuffer) }
                catch { print("🎤 mic write error: \(error)") }
            }
        }

        try engine.start()
        self.audioEngine = engine
        NSLog("[MeetNote] AVAudioEngine started (mic capture active) - %.0fHz/%dch", inputFormat.sampleRate, inputFormat.channelCount)

        // ─── STEP 3: Auto-restart on config change ──────────────────────
        // ScreenCaptureKit or Bluetooth device changes can stop the engine.
        configObserver = NotificationCenter.default.addObserver(
            forName: .AVAudioEngineConfigurationChange,
            object: engine,
            queue: nil
        ) { [weak self] _ in
            guard let self = self, self._isCapturing else { return }
            print("⚠️ AVAudioEngine config changed — restarting mic engine...")
            Task {
                do {
                    guard let fmt = self.cachedTargetFormat else { return }
                    try await self.startMicEngine(targetFormat: fmt)
                    print("✅ Mic engine restarted after config change")
                } catch {
                    print("❌ Failed to restart mic engine: \(error)")
                    await MainActor.run {
                        self.errorMessage = "Mic disconnected during recording."
                    }
                }
            }
        }
    }

    // MARK: - ScreenCaptureKit

    private func startScreenCaptureKitAudio() async throws {
        let availableContent = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)

        guard let display = availableContent.displays.first else {
            throw CaptureError.noDisplayFound
        }

        print("🖥 Display: \(display.displayID) (\(display.width)×\(display.height))")

        let config = SCStreamConfiguration()
        config.capturesAudio = true
        config.excludesCurrentProcessAudio = true
        config.channelCount = Int(channelCount)
        config.sampleRate = Int(sampleRate)

        // Minimal video — we only want audio
        config.width = 1
        config.height = 1
        config.minimumFrameInterval = CMTime(value: 1, timescale: 1)
        config.showsCursor = false

        let filter = SCContentFilter(display: display, excludingApplications: [], exceptingWindows: [])

        let stream = SCStream(filter: filter, configuration: config, delegate: self)
        try stream.addStreamOutput(self, type: .audio, sampleHandlerQueue: audioQueue)
        try await stream.startCapture()
        self.scStream = stream
        NSLog("\u{1f50a} SCStream started - capturesAudio=%d, excludesSelf=%d, %dx%d",
              config.capturesAudio ? 1 : 0,
              config.excludesCurrentProcessAudio ? 1 : 0,
              config.channelCount, Int(config.sampleRate))
    }

    // MARK: - System Audio Buffer Processing

    private func enqueueSystemBuffer(sampleBuffer: CMSampleBuffer) {
        guard _isCapturing else { return }

        // Extract format from the sample buffer
        guard let formatDescription = CMSampleBufferGetFormatDescription(sampleBuffer),
              let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(formatDescription),
              let pcmFormat = AVAudioFormat(streamDescription: asbd)
        else { return }

        // Create PCM buffer from CMSampleBuffer
        let frameCount = AVAudioFrameCount(sampleBuffer.numSamples)
        guard frameCount > 0,
              let pcmBuffer = AVAudioPCMBuffer(pcmFormat: pcmFormat, frameCapacity: frameCount)
        else { return }

        pcmBuffer.frameLength = frameCount
        let status = CMSampleBufferCopyPCMDataIntoAudioBufferList(
            sampleBuffer, at: 0, frameCount: Int32(frameCount), into: pcmBuffer.mutableAudioBufferList
        )
        guard status == noErr else { return }

        // Write to file on serial queue — level meter is updated AFTER conversion
        // to guarantee Float32 format for RMS calculation
        fileQueue.async { [weak self] in
            guard let self = self, self._isCapturing, let sysFile = self.sysFile, let targetFormat = self.sysTargetFormat else { return }

            do {
                // Create converter once per session (lazy, on fileQueue for thread safety)
                if self.sysConverter == nil || self.sysSourceFormat != pcmFormat {
                    guard let converter = AVAudioConverter(from: pcmFormat, to: targetFormat) else { return }
                    self.sysConverter = converter
                    self.sysSourceFormat = pcmFormat
                    NSLog("[MeetNote] System audio converter created: %.0fHz/%dch %@ -> %.0fHz/%dch",
                          pcmFormat.sampleRate, pcmFormat.channelCount,
                          pcmFormat.commonFormat == .pcmFormatFloat32 ? "Float32" : "other",
                          targetFormat.sampleRate, targetFormat.channelCount)
                }

                guard let converter = self.sysConverter else { return }

                let ratio = targetFormat.sampleRate / pcmFormat.sampleRate
                let outFrames = AVAudioFrameCount(Double(frameCount) * ratio)
                guard outFrames > 0,
                      let convertedBuffer = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: outFrames)
                else { return }

                var error: NSError?
                var consumed = false
                converter.convert(to: convertedBuffer, error: &error) { _, outStatus in
                    if consumed { outStatus.pointee = .noDataNow; return nil }
                    consumed = true; outStatus.pointee = .haveData; return pcmBuffer
                }

                if error == nil, convertedBuffer.frameLength > 0 {
                    try sysFile.write(from: convertedBuffer)

                    // Level meter — calculated on converted Float32 buffer (guaranteed format)
                    let rms = self.calculateRMS(buffer: convertedBuffer)
                    DispatchQueue.main.async { self.systemLevel = rms }
                }
            } catch {
                NSLog("[MeetNote] sys write error: %@", error.localizedDescription)
            }
        }
    }

    // MARK: - Merge (real mix-down into single output)

    private func mergeAudioFiles(micURL: URL, sysURL: URL, outputURL: URL) async throws {
        let composition = AVMutableComposition()
        let audioMix = AVMutableAudioMix()
        var inputParams: [AVMutableAudioMixInputParameters] = []

        let micAsset = AVURLAsset(url: micURL)
        let sysAsset = AVURLAsset(url: sysURL)

        // Load tracks — use try/catch so errors aren't silently swallowed
        let micTracks: [AVAssetTrack]
        let sysTracks: [AVAssetTrack]
        do {
            micTracks = try await micAsset.loadTracks(withMediaType: .audio)
        } catch {
            NSLog("[MeetNote] Failed to load mic tracks: %@", error.localizedDescription)
            micTracks = []
        }
        do {
            sysTracks = try await sysAsset.loadTracks(withMediaType: .audio)
        } catch {
            NSLog("[MeetNote] Failed to load sys tracks: %@", error.localizedDescription)
            sysTracks = []
        }

        NSLog("[MeetNote] Merge: mic tracks=%d, sys tracks=%d", micTracks.count, sysTracks.count)

        guard !micTracks.isEmpty || !sysTracks.isEmpty else {
            throw CaptureError.exportFailed
        }

        // Add mic as track 1
        if let micTrack = micTracks.first {
            let compTrack = composition.addMutableTrack(
                withMediaType: .audio,
                preferredTrackID: kCMPersistentTrackID_Invalid
            )
            let timeRange = try await micTrack.load(.timeRange)
            try compTrack?.insertTimeRange(timeRange, of: micTrack, at: .zero)
            NSLog("[MeetNote] Mic track added: duration=%.1fs", timeRange.duration.seconds)

            // Set mic volume
            if let trackID = compTrack?.trackID {
                let params = AVMutableAudioMixInputParameters(track: compTrack)
                params.trackID = trackID
                params.setVolume(1.0, at: .zero)
                inputParams.append(params)
            }
        }

        // Add system as track 2 — with explicit volume so it doesn't get dropped
        if let sysTrack = sysTracks.first {
            let compTrack = composition.addMutableTrack(
                withMediaType: .audio,
                preferredTrackID: kCMPersistentTrackID_Invalid
            )
            let timeRange = try await sysTrack.load(.timeRange)
            try compTrack?.insertTimeRange(timeRange, of: sysTrack, at: .zero)
            NSLog("[MeetNote] Sys track added: duration=%.1fs", timeRange.duration.seconds)

            // Set system audio volume
            if let trackID = compTrack?.trackID {
                let params = AVMutableAudioMixInputParameters(track: compTrack)
                params.trackID = trackID
                params.setVolume(1.0, at: .zero)
                inputParams.append(params)
            }
        }

        audioMix.inputParameters = inputParams
        NSLog("[MeetNote] Audio mix params: %d tracks", inputParams.count)

        // Export — AVAssetExportPresetAppleM4A mixes all audio tracks into single output
        guard let exportSession = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetAppleM4A) else {
            NSLog("[MeetNote] Failed to create AVAssetExportSession")
            throw CaptureError.exportFailed
        }

        exportSession.outputURL = outputURL
        exportSession.outputFileType = .m4a
        exportSession.audioMix = audioMix  // CRITICAL: ensures both tracks are mixed

        await exportSession.export()

        guard exportSession.status == .completed else {
            NSLog("[MeetNote] Export failed: status=%d, error=%@",
                  exportSession.status.rawValue,
                  exportSession.error?.localizedDescription ?? "unknown")
            throw exportSession.error ?? CaptureError.exportFailed
        }
        NSLog("[MeetNote] Export completed successfully")
    }

    // MARK: - Utilities

    private func calculateRMS(buffer: AVAudioPCMBuffer) -> Float {
        guard let channelData = buffer.floatChannelData else { return 0 }
        let channelDataValue = channelData.pointee
        let frames = Int(buffer.frameLength)
        guard frames > 0 else { return 0 }

        var sum: Float = 0
        for i in 0..<frames {
            let sample = channelDataValue[i]
            sum += sample * sample
        }
        return sqrt(sum / Float(frames))
    }
}

// MARK: - SCStreamDelegate

extension AudioCaptureService: SCStreamDelegate {
    func stream(_ stream: SCStream, didStopWithError error: Error) {
        NSLog("[MeetNote] SCStream stopped with error: %@", error.localizedDescription)
        DispatchQueue.main.async {
            self.errorMessage = "System audio stopped: \(error.localizedDescription)"
        }
    }
}

// MARK: - SCStreamOutput

extension AudioCaptureService: SCStreamOutput {
    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        if type == .audio {
            enqueueSystemBuffer(sampleBuffer: sampleBuffer)
        }
        // Silently ignore video frames — we don't need them
    }
}

// MARK: - Errors

enum CaptureError: LocalizedError {
    case formatCreationFailed
    case noDisplayFound
    case screenRecordingDenied
    case microphoneDenied
    case engineStartFailed
    case exportFailed

    var errorDescription: String? {
        switch self {
        case .formatCreationFailed: return "Failed to create audio format"
        case .noDisplayFound: return "No display found for screen capture"
        case .screenRecordingDenied: return "Screen Recording permission required for System Audio. (Restart App if just granted)"
        case .microphoneDenied: return "Microphone permission required. (Restart App if just granted)"
        case .engineStartFailed: return "Failed to start audio engine"
        case .exportFailed: return "Failed to merge audio files"
        }
    }
}

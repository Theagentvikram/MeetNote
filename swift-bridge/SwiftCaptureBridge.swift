import Foundation

struct BridgeCommand: Decodable {
    let command: String
    let title: String?
}

struct BridgeResponse: Encodable {
    let ok: Bool
    let command: String
    let message: String?
    let merged: String?
    let mic: String?
    let sys: String?
    let duration: Int?
    let error: String?
}

struct BridgeLevelUpdate: Encodable {
    let type: String  // always "levels"
    let mic: Float
    let sys: Float
}

@MainActor
final class BridgeController {
    private let captureService = AudioCaptureService()
    private var startedAt: Date?
    private var levelTask: Task<Void, Never>?

    private let encoder = JSONEncoder()

    func startLevelStreaming() {
        stopLevelStreaming()
        levelTask = Task {
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 150_000_000) // 150ms
                if Task.isCancelled { break }
                
                guard self.captureService.isRecording else { continue }
                
                let update = BridgeLevelUpdate(
                    type: "levels",
                    mic: self.captureService.micLevel,
                    sys: self.captureService.systemLevel
                )
                
                if let data = try? self.encoder.encode(update) {
                    FileHandle.standardOutput.write(data)
                    FileHandle.standardOutput.write(Data([0x0A]))
                }
            }
        }
    }

    func stopLevelStreaming() {
        levelTask?.cancel()
        levelTask = nil
    }

    func handle(_ command: BridgeCommand) async -> BridgeResponse {
        switch command.command {
        case "start":
            if captureService.isRecording {
                return BridgeResponse(
                    ok: true,
                    command: "start",
                    message: "already_recording",
                    merged: nil,
                    mic: nil,
                    sys: nil, 
                    duration: nil,
                    error: nil
                )
            }

            do {
                try await captureService.startRecording()
                startedAt = Date()
                startLevelStreaming()
                return BridgeResponse(
                    ok: true,
                    command: "start",
                    message: "recording_started",
                    merged: nil,
                    mic: nil,
                    sys: nil,
                    duration: nil,
                    error: nil
                )
            } catch {
                return BridgeResponse(
                    ok: false,
                    command: "start",
                    message: nil,
                    merged: nil,
                    mic: nil,
                    sys: nil,
                    duration: nil,
                    error: error.localizedDescription
                )
            }

        case "stop":
            stopLevelStreaming()
            let result = await captureService.stopRecording()
            let duration = startedAt.map { Int(Date().timeIntervalSince($0)) } ?? Int(captureService.elapsedTime)
            startedAt = nil

            guard let mergedURL = result.merged else {
                return BridgeResponse(
                    ok: false,
                    command: "stop",
                    message: nil,
                    merged: nil,
                    mic: nil,
                    sys: nil,
                    duration: duration,
                    error: "No merged output was produced by Swift recorder"
                )
            }

            return BridgeResponse(
                ok: true,
                command: "stop",
                message: "recording_stopped",
                merged: mergedURL.path,
                mic: result.mic?.path,
                sys: result.sys?.path,
                duration: duration,
                error: nil
            )

        case "status":
            return BridgeResponse(
                ok: true,
                command: "status",
                message: captureService.isRecording ? "recording" : "idle",
                merged: nil,
                mic: nil,
                sys: nil,
                duration: nil,
                error: nil
            )

        case "abort":
            stopLevelStreaming()
            if captureService.isRecording {
                _ = await captureService.stopRecording()
            }
            startedAt = nil
            return BridgeResponse(
                ok: true,
                command: "abort",
                message: "aborted",
                merged: nil,
                mic: nil,
                sys: nil,
                duration: nil,
                error: nil
            )

        default:
            return BridgeResponse(
                ok: false,
                command: command.command,
                message: nil,
                merged: nil,
                mic: nil,
                sys: nil,
                duration: nil,
                error: "Unknown command: \(command.command)"
            )
        }
    }
}

@main
struct SwiftCaptureBridgeMain {
    static func emit(_ response: BridgeResponse, encoder: JSONEncoder) {
        guard let data = try? encoder.encode(response) else {
            return
        }
        FileHandle.standardOutput.write(data)
        FileHandle.standardOutput.write(Data([0x0A]))
    }

    static func main() async {
        let decoder = JSONDecoder()
        let encoder = JSONEncoder()

        let controller = await MainActor.run { BridgeController() }

        while let line = readLine(strippingNewline: true) {
            let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.isEmpty { continue }

            guard let data = trimmed.data(using: .utf8) else {
                emit(
                    BridgeResponse(
                        ok: false,
                        command: "decode",
                        message: nil,
                        merged: nil,
                        mic: nil,
                        sys: nil,
                        duration: nil,
                        error: "Invalid UTF-8 input"
                    ),
                    encoder: encoder
                )
                continue
            }

            let command: BridgeCommand
            do {
                command = try decoder.decode(BridgeCommand.self, from: data)
            } catch {
                emit(
                    BridgeResponse(
                        ok: false,
                        command: "decode",
                        message: nil,
                        merged: nil,
                        mic: nil,
                        sys: nil,
                        duration: nil,
                        error: "Command decode failed: \(error.localizedDescription)"
                    ),
                    encoder: encoder
                )
                continue
            }

            let response = await controller.handle(command)
            emit(response, encoder: encoder)
        }
    }
}

//
//  AppSettings.swift
//  MeetNote
//
//  Created by AMMUAARU on 01/03/26.
//

import Foundation
import Combine

/// Centralized app settings backed by UserDefaults.
final class AppSettings: ObservableObject {
    static let shared = AppSettings()

    private static let backendDefaultsKey = "backendURL"
    private static let backendEnvKeys = ["MEETNOTE_BACKEND_URL", "BACKEND_URL"]
    private static let backendInfoPlistKey = "MEETNOTE_BACKEND_URL"
    private static let fallbackBackendURL = "https://meetnote-backend.onrender.com"

    @Published var backendURL: String {
        didSet { UserDefaults.standard.set(backendURL, forKey: Self.backendDefaultsKey) }
    }
    @Published var transcriptionLanguage: String {
        didSet { UserDefaults.standard.set(transcriptionLanguage, forKey: "transcriptionLanguage") }
    }
    @Published var autoUpload: Bool {
        didSet { UserDefaults.standard.set(autoUpload, forKey: "autoUpload") }
    }
    @Published var selectedMicrophoneID: String {
        didSet { UserDefaults.standard.set(selectedMicrophoneID, forKey: "selectedMicrophoneID") }
    }
    @Published var showMenuBarIcon: Bool {
        didSet { UserDefaults.standard.set(showMenuBarIcon, forKey: "showMenuBarIcon") }
    }
    @Published var launchAtLogin: Bool {
        didSet { UserDefaults.standard.set(launchAtLogin, forKey: "launchAtLogin") }
    }
    @Published var recordingQuality: Int {
        didSet { UserDefaults.standard.set(recordingQuality, forKey: "recordingQuality") }
    }
    @Published var captureSystemAudio: Bool {
        didSet { UserDefaults.standard.set(captureSystemAudio, forKey: "captureSystemAudio") }
    }

    private init() {
        let defaults = UserDefaults.standard
        self.backendURL = Self.resolveBackendURL(defaults: defaults)
        self.transcriptionLanguage = defaults.string(forKey: "transcriptionLanguage") ?? "en"
        self.autoUpload = defaults.object(forKey: "autoUpload") as? Bool ?? true
        self.selectedMicrophoneID = defaults.string(forKey: "selectedMicrophoneID") ?? ""
        self.showMenuBarIcon = defaults.object(forKey: "showMenuBarIcon") as? Bool ?? true
        self.launchAtLogin = defaults.object(forKey: "launchAtLogin") as? Bool ?? false
        self.recordingQuality = defaults.object(forKey: "recordingQuality") as? Int ?? 48000
        self.captureSystemAudio = defaults.object(forKey: "captureSystemAudio") as? Bool ?? true
    }

    private static func resolveBackendURL(defaults: UserDefaults) -> String {
        if let fromEnvironment = firstValidURL(from: environmentValues()) {
            defaults.set(fromEnvironment, forKey: backendDefaultsKey)
            return fromEnvironment
        }

        if let fromInfoPlist = firstValidURL(from: [Bundle.main.object(forInfoDictionaryKey: backendInfoPlistKey) as? String]) {
            defaults.set(fromInfoPlist, forKey: backendDefaultsKey)
            return fromInfoPlist
        }

        if let fromDefaults = firstValidURL(from: [defaults.string(forKey: backendDefaultsKey)]) {
            return fromDefaults
        }

        return fallbackBackendURL
    }

    private static func environmentValues() -> [String?] {
        let env = ProcessInfo.processInfo.environment
        return backendEnvKeys.map { env[$0] }
    }

    private static func firstValidURL(from candidates: [String?]) -> String? {
        for candidate in candidates {
            guard let trimmed = candidate?.trimmingCharacters(in: .whitespacesAndNewlines),
                  !trimmed.isEmpty,
                  let url = URL(string: trimmed),
                  let scheme = url.scheme,
                  ["http", "https"].contains(scheme.lowercased())
            else {
                continue
            }
            return trimmed
        }
        return nil
    }

    /// Local recordings directory
    var recordingsDirectory: URL {
        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let dir = appSupport.appendingPathComponent("MeetNote/Recordings", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }
}

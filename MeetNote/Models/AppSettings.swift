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

    @Published var backendURL: String {
        didSet { UserDefaults.standard.set(backendURL, forKey: "backendURL") }
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
        self.backendURL = defaults.string(forKey: "backendURL") ?? "https://meetnote-backend.onrender.com"
        self.transcriptionLanguage = defaults.string(forKey: "transcriptionLanguage") ?? "en"
        self.autoUpload = defaults.object(forKey: "autoUpload") as? Bool ?? true
        self.selectedMicrophoneID = defaults.string(forKey: "selectedMicrophoneID") ?? ""
        self.showMenuBarIcon = defaults.object(forKey: "showMenuBarIcon") as? Bool ?? true
        self.launchAtLogin = defaults.object(forKey: "launchAtLogin") as? Bool ?? false
        self.recordingQuality = defaults.object(forKey: "recordingQuality") as? Int ?? 48000
        self.captureSystemAudio = defaults.object(forKey: "captureSystemAudio") as? Bool ?? true
    }

    /// Local recordings directory
    var recordingsDirectory: URL {
        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let dir = appSupport.appendingPathComponent("MeetNote/Recordings", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }
}

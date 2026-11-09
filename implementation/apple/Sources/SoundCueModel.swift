import Foundation

// Sounds for events, as data: a manifest names the sound files (cues) and says which cues an event
// plays and when. The sound files and the event names belong to the application; nothing here
// knows what the events mean. Pure, no audio framework; matches web/cue-model.ts.
struct CueStep: Equatable {
    let cue: String
    let delayMs: Double
}

struct SoundManifest: Equatable {
    let cues: [String: String]
    let events: [String: [CueStep]]
    // Cue names in the order the manifest lists them (JSON objects are unordered, so they are sorted by name).
    var cueNames: [String] { cues.keys.sorted() }
}

enum SoundCueError: Error, Equatable {
    case invalid([String])
    case notJSON(String)
}

enum SoundCueModel {
    static let audioExtensions = ["wav", "mp3", "ogg", "m4a", "aac", "caf"]
    static let manifestFile = "manifest.json"
    static let defaultManifest = "sounds"

    private static func matches(_ pattern: String, _ s: String) -> Bool { s.range(of: pattern, options: .regularExpression) != nil }

    // The setting is the folder name (letters, digits and hyphens; an aepm string setting cannot hold
    // a slash or a dot); the manifest is that folder's manifest.json.
    static func manifestPath(_ soundManifest: String) throws -> String {
        guard matches("^[a-z][a-z0-9-]{0,63}$", soundManifest) else { throw SoundCueError.invalid(["soundManifest must be a folder name of lower-case letters, digits and hyphens: \(soundManifest)"]) }
        return "\(soundManifest)/\(manifestFile)"
    }

    static func isSafeFile(_ file: String) -> Bool {
        guard matches("^[A-Za-z0-9][A-Za-z0-9._/-]*$", file), !file.contains(".."), !file.contains("//"), let dot = file.lastIndex(of: ".") else { return false }
        return audioExtensions.contains(file[file.index(after: dot)...].lowercased())
    }

    private static let name = "^[a-z][a-z0-9_-]{0,47}$"

    // Parses and checks a manifest; throws with the list of problems.
    static func parseManifest(_ data: Data) throws -> SoundManifest {
        guard let any = try? JSONSerialization.jsonObject(with: data) else { throw SoundCueError.notJSON("manifest is not JSON") }
        guard let root = any as? [String: Any] else { throw SoundCueError.invalid(["manifest must be an object"]) }
        var problems: [String] = []
        if (root["format"] as? Int) != 1 { problems.append("format must be 1") }
        guard let cues = root["cues"] as? [String: Any], !cues.isEmpty else { throw SoundCueError.invalid(problems + ["cues must name at least one sound"]) }
        var files: [String: String] = [:]
        for (cue, value) in cues {
            if !matches(name, cue) { problems.append("cue name \(cue) must be lower-case letters, digits, hyphens and underscores") }
            if let file = value as? String, isSafeFile(file) { files[cue] = file } else { problems.append("cue \(cue): file must be a relative path ending in \(audioExtensions.joined(separator: ", "))") }
        }
        if Set(files.values.map { $0.lowercased() }).count != files.count { problems.append("two cues share a file") }
        var events: [String: [CueStep]] = [:]
        for (event, value) in (root["events"] as? [String: Any]) ?? [:] {
            if !matches(name, event) { problems.append("event name \(event) must be lower-case letters, digits, hyphens and underscores") }
            guard let steps = value as? [Any], !steps.isEmpty else { problems.append("event \(event) must list at least one cue"); continue }
            var out: [CueStep] = []
            for step in steps {
                var cue = "", delay = 0.0
                if let s = step as? String { cue = s }
                else if let d = step as? [String: Any], let c = d["cue"] as? String { cue = c; delay = (d["delayMs"] as? NSNumber)?.doubleValue ?? 0 }
                if cues[cue] == nil { problems.append("event \(event): unknown cue \(cue)") }
                if !(delay >= 0 && delay <= 60000) { problems.append("event \(event): delayMs must be 0 to 60000") }
                out.append(CueStep(cue: cue, delayMs: delay))
            }
            events[event] = out
        }
        if !problems.isEmpty { throw SoundCueError.invalid(problems) }
        return SoundManifest(cues: files, events: events)
    }

    // What an event plays, with delays filled in. An event that is itself a cue name and has no entry
    // of its own plays that cue at once; any other unknown name plays nothing.
    static func eventPlan(_ manifest: SoundManifest, _ event: String) -> [CueStep] {
        if let steps = manifest.events[event] { return steps }
        return manifest.cues[event] != nil ? [CueStep(cue: event, delayMs: 0)] : []
    }

    // Android raw resource name for a file: its base name, lower case, other characters as
    // underscores, with a prefix. (Kept here so both platforms agree on file naming.)
    static func rawResourceName(_ file: String, prefix: String = "snd_") -> String {
        var base = String(file.split(separator: "/").last ?? "")
        if let dot = base.lastIndex(of: ".") { base = String(base[..<dot]) }
        let mapped = base.lowercased().map { $0.isASCII && ($0.isLetter || $0.isNumber) ? String($0) : "_" }.joined()
        let collapsed = mapped.replacingOccurrences(of: "_+", with: "_", options: .regularExpression)
        return prefix + collapsed.trimmingCharacters(in: CharacterSet(charactersIn: "_"))
    }

    // The device's sound preference is "on"; muted is its opposite. With no recorded preference the
    // default decides.
    static func isMuted(sound: Bool?, defaultMuted: Bool) -> Bool { sound.map { !$0 } ?? defaultMuted }

    // The value to hand the preferences component as its default for `sound`.
    static func soundPreferenceDefault(defaultMuted: Bool) -> Bool { !defaultMuted }
}

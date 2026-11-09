import Foundation

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data("FAIL: \(message)\n".utf8))
    exit(1)
}
func check(_ condition: Bool, _ message: @autoclosure () -> String) { if !condition { fail(message()) } }
func read(_ path: String) -> Data {
    guard let data = FileManager.default.contents(atPath: path) else { fail("cannot read \(path)") }
    return data
}

let manifest = try! SoundCueModel.parseManifest(read("tests/fixtures/sounds.json"))
let fixtures = try! JSONSerialization.jsonObject(with: read("tests/fixtures/cues.json")) as! [String: Any]

// Plans equal the TypeScript's.
var plans = 0
for item in fixtures["plans"] as! [[String: Any]] {
    let event = item["event"] as! String
    let expected = (item["steps"] as! [[String: Any]]).map { CueStep(cue: $0["cue"] as! String, delayMs: ($0["delayMs"] as! NSNumber).doubleValue) }
    check(SoundCueModel.eventPlan(manifest, event) == expected, "plan for \(event)")
    plans += 1
}
check(SoundCueModel.eventPlan(manifest, "nothing").isEmpty, "unknown names play nothing")
check(manifest.cueNames.count == 8 && manifest.cues["fail"] == "fail.mp3", "cues")

// Resource names and the mute rule.
for item in fixtures["resources"] as! [[String: Any]] { check(SoundCueModel.rawResourceName(item["file"] as! String) == item["name"] as! String, "resource \(item["file"]!)") }
for item in fixtures["muted"] as! [[String: Any]] {
    let sound = item["sound"] as? Bool
    check(SoundCueModel.isMuted(sound: sound, defaultMuted: item["defaultMuted"] as! Bool) == item["muted"] as! Bool, "muted \(String(describing: sound))")
}
check(SoundCueModel.soundPreferenceDefault(defaultMuted: true) == false && SoundCueModel.soundPreferenceDefault(defaultMuted: false) == true, "preference default")

// Settings and files.
check((try? SoundCueModel.manifestPath("sounds")) == "sounds/manifest.json" && (try? SoundCueModel.manifestPath("game-sounds2")) == "game-sounds2/manifest.json", "manifest path")
for bad in ["", "Sounds", "a/b", "../x", "a.b", "2sounds"] { check((try? SoundCueModel.manifestPath(bad)) == nil, "bad folder \(bad)") }
check(SoundCueModel.isSafeFile("a/b-c_d.OGG") && !SoundCueModel.isSafeFile("a//b.wav") && !SoundCueModel.isSafeFile("") && !SoundCueModel.isSafeFile(".wav") && !SoundCueModel.isSafeFile("../x.wav") && !SoundCueModel.isSafeFile("t.exe"), "safe files")

// Faults are refused with their reasons.
func problems(_ json: String) -> [String] {
    do { _ = try SoundCueModel.parseManifest(Data(json.utf8)); return [] } catch SoundCueError.invalid(let p) { return p } catch { return ["other"] }
}
check(problems("{\"format\":2,\"cues\":{\"a\":\"a.wav\"}}").contains("format must be 1"), "format")
check(problems("{\"format\":1,\"cues\":{}}").first?.contains("at least one sound") == true, "no cues")
check(problems("{\"format\":1,\"cues\":{\"a\":\"../a.wav\"}}").first?.contains("cue a: file") == true, "unsafe file")
check(problems("{\"format\":1,\"cues\":{\"a\":\"a.wav\",\"b\":\"a.wav\"}}").contains("two cues share a file"), "shared file")
check(problems("{\"format\":1,\"cues\":{\"a\":\"a.wav\"},\"events\":{\"e\":[\"nope\"]}}").first?.contains("unknown cue nope") == true, "unknown cue")
check(problems("{\"format\":1,\"cues\":{\"a\":\"a.wav\"},\"events\":{\"e\":[]}}").first?.contains("at least one cue") == true, "empty event")
check(problems("{\"format\":1,\"cues\":{\"a\":\"a.wav\"},\"events\":{\"e\":[{\"cue\":\"a\",\"delayMs\":-1}]}}").first?.contains("delayMs") == true, "negative delay")
check(problems("{\"format\":1,\"cues\":{\"a\":\"a.wav\"}}").isEmpty, "events are optional")
check((try? SoundCueModel.parseManifest(Data("{".utf8))) == nil, "not JSON")

// The player: with no files it must stay silent and not crash; muting and forbidding are honoured.
@MainActor func playerChecks() {
    var muted = false, allowed = true, looked: [String] = []
    let player = SoundCuePlayer(manifest: manifest, locate: { looked.append($0); return nil }, isMuted: { muted }, allowed: { allowed })
    player.emit("button")
    check(looked == ["tap.wav"], "an unmuted cue looks for its file")
    muted = true
    player.emit("button")
    check(looked.count == 1, "a muted cue does not look")
    muted = false; allowed = false
    player.emit("button")
    check(looked.count == 1, "a forbidden cue does not look")
    allowed = true
    player.play("no-such-cue")
    check(looked.count == 1, "an unknown cue is ignored")
    player.stopAll()
}
MainActor.assumeIsolated { playerChecks() }

print("\(plans) plans matched the TypeScript model")

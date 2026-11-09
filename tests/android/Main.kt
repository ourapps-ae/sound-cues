import ae.sound.*

// Mirrors tests/apple/main.swift: plans and resource names are compared with rows the TypeScript produced (Expected.kt).
fun check(condition: Boolean, message: String) { if (!condition) { System.err.println("FAIL: $message"); System.exit(1) } }

fun main() {
    // The sample manifest of tests/fixtures/sounds.json, written out.
    val manifest = SoundManifest(
        cues = linkedMapOf("tap" to "tap.wav", "enter" to "enter.wav", "exit" to "exit.wav", "deal" to "deal.wav", "flip" to "flip.wav", "success" to "success.wav", "fail" to "fail.mp3", "alert" to "alert.ogg"),
        events = mapOf(
            "button" to listOf(CueStep("tap", 0.0)), "joined" to listOf(CueStep("enter", 0.0)), "left" to listOf(CueStep("exit", 0.0)), "dealt" to listOf(CueStep("deal", 0.0)),
            "reveal" to listOf(CueStep("deal", 0.0), CueStep("flip", 300.0)), "won" to listOf(CueStep("success", 500.0)), "problem" to listOf(CueStep("fail", 0.0), CueStep("alert", 120.0)),
        ),
    )
    check(CueModel.validate(manifest).isEmpty(), "the sample manifest is valid")
    for (row in EXPECTED_PLANS) {
        val event = row[0]
        val got = CueModel.eventPlan(manifest, event).joinToString(" ") { "${it.cue}:${it.delayMs.let { d -> if (d == Math.floor(d)) d.toLong().toString() else d.toString() }}" }
        check(got == row[1], "plan for $event: $got vs ${row[1]}")
    }
    check(CueModel.eventPlan(manifest, "nothing").isEmpty(), "unknown names play nothing")
    for (row in EXPECTED_RESOURCES) check(CueModel.rawResourceName(row[0]) == row[1], "resource ${row[0]}: ${CueModel.rawResourceName(row[0])}")
    check(CueModel.isMuted(true, true) == false && CueModel.isMuted(false, false) && CueModel.isMuted(null, true) && !CueModel.isMuted(null, false), "mute rule")
    check(!CueModel.soundPreferenceDefault(true) && CueModel.soundPreferenceDefault(false), "preference default")
    check(CueModel.manifestPath("sounds") == "sounds/manifest.json", "manifest path")
    for (bad in listOf("", "Sounds", "a/b", "../x", "a.b", "2sounds")) check(runCatching { CueModel.manifestPath(bad) }.isFailure, "bad folder $bad")
    check(CueModel.isSafeFile("a/b-c_d.OGG") && !CueModel.isSafeFile("a//b.wav") && !CueModel.isSafeFile("") && !CueModel.isSafeFile(".wav") && !CueModel.isSafeFile("../x.wav") && !CueModel.isSafeFile("t.exe"), "safe files")
    check(CueModel.validate(SoundManifest(mapOf("a" to "../a.wav"))).isNotEmpty(), "unsafe file")
    check(CueModel.validate(SoundManifest(mapOf("a" to "a.wav", "b" to "a.wav"))).contains("two cues share a file"), "shared file")
    check(CueModel.validate(SoundManifest(mapOf("a" to "a.wav"), mapOf("e" to listOf(CueStep("nope", 0.0))))).first().contains("unknown cue nope"), "unknown cue")
    check(CueModel.validate(SoundManifest(mapOf("a" to "a.wav"), mapOf("e" to listOf(CueStep("a", -1.0))))).first().contains("delayMs"), "negative delay")
    check(CueModel.validate(SoundManifest(emptyMap())) == listOf("cues must name at least one sound"), "no cues")
    println("android sound checks passed (${EXPECTED_PLANS.size} plans)")
}

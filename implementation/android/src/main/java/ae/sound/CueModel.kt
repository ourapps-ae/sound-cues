package ae.sound

// Sounds for events, as data: a manifest names the sound files (cues) and says which cues an event
// plays and when. The sound files and the event names belong to the application; nothing here
// knows what the events mean. Pure, no Android classes; matches web/cue-model.ts.
data class CueStep(val cue: String, val delayMs: Double)

data class SoundManifest(val cues: Map<String, String>, val events: Map<String, List<CueStep>> = emptyMap())

object CueModel {
    val AUDIO_EXTENSIONS = listOf("wav", "mp3", "ogg", "m4a", "aac", "caf")
    const val MANIFEST_FILE = "manifest.json"
    const val DEFAULT_MANIFEST = "sounds"
    private val NAME = Regex("^[a-z][a-z0-9_-]{0,47}$")

    // The setting is the folder name (letters, digits and hyphens; an aepm string setting cannot hold
    // a slash or a dot); the manifest is that folder's manifest.json.
    fun manifestPath(soundManifest: String): String {
        require(Regex("^[a-z][a-z0-9-]{0,63}$").matches(soundManifest)) { "soundManifest must be a folder name of lower-case letters, digits and hyphens: $soundManifest" }
        return "$soundManifest/$MANIFEST_FILE"
    }

    fun isSafeFile(file: String): Boolean =
        Regex("^[A-Za-z0-9][A-Za-z0-9._/-]*$").matches(file) && ".." !in file && "//" !in file && file.contains('.') &&
            file.substringAfterLast('.').lowercase() in AUDIO_EXTENSIONS

    // The list of problems; empty means the manifest is usable.
    fun validate(manifest: SoundManifest): List<String> {
        val problems = mutableListOf<String>()
        if (manifest.cues.isEmpty()) return listOf("cues must name at least one sound")
        for ((name, file) in manifest.cues) {
            if (!NAME.matches(name)) problems += "cue name $name must be lower-case letters, digits, hyphens and underscores"
            if (!isSafeFile(file)) problems += "cue $name: file must be a relative path ending in ${AUDIO_EXTENSIONS.joinToString(", ")}"
        }
        if (manifest.cues.values.map { it.lowercase() }.toSet().size != manifest.cues.size) problems += "two cues share a file"
        for ((event, steps) in manifest.events) {
            if (!NAME.matches(event)) problems += "event name $event must be lower-case letters, digits, hyphens and underscores"
            if (steps.isEmpty()) problems += "event $event must list at least one cue"
            for (s in steps) {
                if (s.cue !in manifest.cues) problems += "event $event: unknown cue ${s.cue}"
                if (!(s.delayMs in 0.0..60000.0)) problems += "event $event: delayMs must be 0 to 60000"
            }
        }
        return problems
    }

    // What an event plays, with delays filled in. An event that is itself a cue name and has no entry
    // of its own plays that cue at once; any other unknown name plays nothing.
    fun eventPlan(manifest: SoundManifest, event: String): List<CueStep> =
        manifest.events[event] ?: if (event in manifest.cues) listOf(CueStep(event, 0.0)) else emptyList()

    // Android raw resource name for a file: its base name, lower case, other characters as
    // underscores, with a prefix (resource names cannot start with a digit or hold dashes or dots).
    fun rawResourceName(file: String, prefix: String = "snd_"): String {
        val base = file.substringAfterLast('/').substringBeforeLast('.', file.substringAfterLast('/'))
        return prefix + base.lowercase().replace(Regex("[^a-z0-9]+"), "_").trim('_')
    }

    // The device's sound preference is "on"; muted is its opposite. With no recorded preference the
    // default decides.
    fun isMuted(sound: Boolean?, defaultMuted: Boolean): Boolean = sound?.let { !it } ?: defaultMuted

    // The value to hand the preferences component as its default for `sound`.
    fun soundPreferenceDefault(defaultMuted: Boolean): Boolean = !defaultMuted
}

package ae.sound

import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

// Reads a manifest.json (see tests/fixtures/sounds.json) with Android's JSON classes. Throws
// IllegalArgumentException with the problems when the manifest is unusable.
object ManifestJson {
    fun parse(text: String): SoundManifest {
        val root = try { JSONObject(text) } catch (e: JSONException) { throw IllegalArgumentException("manifest is not JSON: ${e.message}") }
        val problems = mutableListOf<String>()
        if (root.optInt("format", 0) != 1) problems += "format must be 1"
        val cuesJson = root.optJSONObject("cues") ?: throw IllegalArgumentException((problems + "cues must name at least one sound").joinToString("; "))
        val cues = cuesJson.keys().asSequence().associateWith { cuesJson.optString(it, "") }
        val events = mutableMapOf<String, List<CueStep>>()
        root.optJSONObject("events")?.let { e ->
            for (name in e.keys()) {
                val steps = e.optJSONArray(name) ?: JSONArray()
                events[name] = (0 until steps.length()).map { i ->
                    when (val s = steps.get(i)) {
                        is String -> CueStep(s, 0.0)
                        is JSONObject -> CueStep(s.optString("cue", ""), s.optDouble("delayMs", 0.0))
                        else -> CueStep("", 0.0)
                    }
                }
            }
        }
        val manifest = SoundManifest(cues, events)
        val all = problems + CueModel.validate(manifest)
        require(all.isEmpty()) { all.joinToString("; ") }
        return manifest
    }
}

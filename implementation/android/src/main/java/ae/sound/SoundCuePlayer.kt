package ae.sound

import android.content.Context
import android.media.AudioAttributes
import android.media.SoundPool
import android.os.Handler
import android.os.Looper

// Plays the cues of a manifest through a SoundPool. `isMuted` reads the device's sound preference
// (see CueModel.isMuted); `allowed` can forbid sound for now (a shared display). Muting stops
// everything, including cues waiting for their delay. Sound files are raw resources named by
// CueModel.rawResourceName (for example tap.wav is R.raw.snd_tap).
class SoundCuePlayer(
    private val manifest: SoundManifest,
    private val isMuted: () -> Boolean,
    private val allowed: () -> Boolean = { true },
    private val maxStreams: Int = 4,
) {
    private var pool: SoundPool? = null
    private val ids = mutableMapOf<String, Int>()
    private val main = Handler(Looper.getMainLooper())
    private var generation = 0

    // `resolveRaw(name)` returns the resource id for a raw resource name, or 0 when the file is not packaged,
    // such as { name -> context.resources.getIdentifier(name, "raw", context.packageName) }.
    fun init(context: Context, resolveRaw: (String) -> Int = { name -> context.resources.getIdentifier(name, "raw", context.packageName) }) {
        if (pool != null) return
        val p = SoundPool.Builder().setMaxStreams(maxStreams)
            .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_GAME).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
            .build()
        for ((cue, file) in manifest.cues) {
            val res = resolveRaw(CueModel.rawResourceName(file))
            if (res != 0) ids[cue] = p.load(context, res, 1)
        }
        pool = p
    }

    // Stops everything playing or waiting; call when sound is turned off.
    fun stopAll() {
        generation++
        main.removeCallbacksAndMessages(null)
        pool?.autoPause()
    }

    // Plays one cue, after `delayMs`.
    fun play(cue: String, delayMs: Long = 0) {
        if (isMuted() || !allowed()) return
        val p = pool ?: return
        val id = ids[cue] ?: return
        if (delayMs > 0) {
            val expected = generation
            main.postDelayed({ if (expected == generation && !isMuted() && allowed()) p.play(id, 1f, 1f, 1, 0, 1f) }, delayMs)
        } else p.play(id, 1f, 1f, 1, 0, 1f)
    }

    // Plays what the manifest says this event plays.
    fun emit(event: String) {
        for (step in CueModel.eventPlan(manifest, event)) play(step.cue, step.delayMs.toLong())
    }

    fun release() {
        stopAll()
        pool?.release()
        pool = null
        ids.clear()
    }
}

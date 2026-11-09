import AVFoundation

// Plays the cues of a manifest. A cue already playing is not cut off: another player takes the sound,
// up to `maxPerCue`. Sounds mix with anything else playing (a video call, music). Muting stops
// everything, including cues waiting for their delay.
@MainActor
final class SoundCuePlayer {
    let manifest: SoundManifest
    private let locate: (String) -> URL?
    private let isMuted: () -> Bool
    private let allowed: () -> Bool
    private let maxPerCue: Int
    private var pools: [String: [AVAudioPlayer]] = [:]
    private var prepared = false
    private var generation = 0

    // `locate` finds a manifest file in the application's bundle, such as
    // { Bundle.main.url(forResource: ..., withExtension: ..., subdirectory: "Sounds") }.
    // `isMuted` reads the device's sound preference (see SoundCueModel.isMuted); `allowed` can forbid
    // sound for now (a shared display).
    init(manifest: SoundManifest, locate: @escaping (String) -> URL?, isMuted: @escaping () -> Bool, allowed: @escaping () -> Bool = { true }, maxPerCue: Int = 3) {
        self.manifest = manifest
        self.locate = locate
        self.isMuted = isMuted
        self.allowed = allowed
        self.maxPerCue = maxPerCue
    }

    // Stops everything playing or waiting; call when sound is turned off.
    func stopAll() {
        generation += 1
        for pool in pools.values { for player in pool { player.stop() } }
    }

    // Sounds mix with anything else playing; a call that sets its own session is left alone.
    private func prepare() {
        if prepared { return }
        prepared = true
        #if os(iOS) || os(tvOS)
        let session = AVAudioSession.sharedInstance()
        if session.category != .playAndRecord { try? session.setCategory(.ambient, options: [.mixWithOthers]) }
        #endif
    }

    // Plays one cue, after `delayMs`.
    func play(_ cue: String, delayMs: Double = 0) {
        guard !isMuted(), allowed(), let file = manifest.cues[cue] else { return }
        prepare()
        if delayMs > 0 {
            let expected = generation
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: UInt64(delayMs * 1_000_000))
                guard expected == generation else { return }
                play(cue)
            }
            return
        }
        var pool = pools[cue] ?? []
        if let idle = pool.first(where: { !$0.isPlaying }) {
            idle.currentTime = 0
            idle.play()
            return
        }
        guard pool.count < maxPerCue, let url = locate(file), let player = try? AVAudioPlayer(contentsOf: url) else { return }
        player.play()
        pool.append(player)
        pools[cue] = pool
    }

    // Plays what the manifest says this event plays.
    func emit(_ event: String) {
        for step in SoundCueModel.eventPlan(manifest, event) { play(step.cue, delayMs: step.delayMs) }
    }
}

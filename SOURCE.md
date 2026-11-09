# Source mapping

Reference revision: `19905b75dbea89fbfd424d67fe26c81aaed0e018`. Extracted from `OurPoker/recipe/` (read-only); line ranges are of the files there.

## Web

- `implementation/web/cue-model.ts` <- the data parts of `web/src/sound.ts:1-62` and the event-to-sound mapping in `web/src/store.ts:9-14` (`ACTION_SOUND`) and `web/src/table.ts:87-112` (`eventSounds`: deal, burn then flip after 300 ms, per-action sounds, win after 500 ms, turn). Generalised: the fixed `SoundName` list, the `sounds/<name>.wav` pattern and the poker events became a manifest (`cues`: name to file; `events`: name to steps with `delayMs`), so the event-to-sound map is data the recipe supplies; the recipe's own manifest would hold `deal`, `reveal` (burn then flip at 300 ms), `win` at 500 ms, and the action map. `validateManifest`, `parseManifest`, `eventPlan`, `fileUrl`, `manifestPath`, `rawResourceName`, `isMuted`, `soundPreferenceDefault` and the `soundManifest` and `defaultMuted` settings are new (`generated-platform`). The sample `tests/fixtures/sounds.json` uses neutral names (tap, enter, exit, deal, flip, success, fail, alert), not the recipe's.
- `implementation/web/cues.ts` <- `web/src/sound.ts:8-62`. Kept: the lazily created audio context unlocked by the first tap (`43-47`), buffers cached as promises (`9, 31-41`), a generation counter that drops loads finishing after a stop (`11, 14-18, 53-55`), sources tracked so sound can be stopped (`10, 59`), start time `currentTime + delay` (`60`). Generalised: `localStorage` "sound" became the preferences component's `sound` (or in-memory mute from `defaultMuted`); the board-mode test (`sessionMode() === "board"`, `19, 44, 50, 54`) became the `allowed` callback; `window` and `AudioContext` and `fetch` became injectable (`createContext`, `fetchFile`) so the engine is tested without a browser. Left behind: `modeEvent` listener (`19`), the session mode import, and `setSound` also muting the video call speaker (`web/src/screens.ts:176-178`; the recipe connects `onMutedChange` to the video component).

## Apple

- `implementation/apple/Sources/SoundCueModel.swift` <- new (`generated-platform`) over the `SoundName` enum of `ios/OurPoker/Sources/Sound.swift:6-9` and the mute default of `SoundSetting` (`11-29`): the manifest parse and checks, event plan, resource name and mute rule, matching the web model.
- `implementation/apple/Sources/SoundCuePlayer.swift` <- `Sound.swift:31-75` (`Sound`: ambient mix-with-others session, a pool of up to three players per cue, delayed play cancelled by a generation counter, `stopAll`). Generalised: `SoundName` cases became manifest cues, `Bundle.main.url(... subdirectory: "Sounds")` became a `locate` closure, `SoundSetting.shared.on` became an `isMuted` closure. Left behind: `SoundSetting` (`Sound.swift:11-29`, the preferences component keeps this value).

## Android

- `implementation/android/src/main/java/ae/sound/CueModel.kt` <- new (`generated-platform`), matching the web and Apple models, over `android/app/src/main/java/app/ourapps/ourpoker/Sound.kt:13-18` (`SoundName` and its `R.raw.snd_*` names).
- `implementation/android/src/main/java/ae/sound/ManifestJson.kt` <- new, reads the manifest with `org.json`.
- `implementation/android/src/main/java/ae/sound/SoundCuePlayer.kt` <- `Sound.kt:20-42` (`Sound`: SoundPool with four streams, game usage attributes, delayed play on the main handler). Generalised: `SoundName(res)` enum became manifest cues resolved through `rawResourceName`; `enabled` became an `isMuted` callback; `stopAll` also cancels delayed cues (the recipe's did not). Left behind: `SoundSetting` (`Sound.kt:44-53`, kept by the preferences component).

## Tests

`tests/web.test.ts`, `tests/make-fixtures.ts`, `tests/fixtures/sounds.json`, `tests/fixtures/cues.json`, `tests/apple/main.swift`, `tests/android/Main.kt`, `tests/android/Expected.kt`, `tests/native.py`, `examples/consumer.ts` are new. `cues.json` and `Expected.kt` are generated from the TypeScript; the web test fails if they drift. The recipe's `web/public/sounds/*.wav` files are not copied: sound files stay in the recipe.

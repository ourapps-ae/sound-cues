# Sound cues component

## Purpose and facilities
`sound-cues` plays short sounds for what happens in an application. A manifest lists the sound files (cues) and which cues each event plays, in order and with delays, so an event such as "cards revealed" can play a deal sound then, 300 ms later, a flip sound. The application sends events by name and never touches audio; the files and the event names stay with the application (the recipe ships its own manifest and files). Sound is on or off by the device's `sound` preference from the `preferences` component, turning it off stops everything playing or waiting; a host can also forbid sound for now (a shared display). Browsers allow sound only after a tap, so nothing plays until the first one unlocks it. The component knows nothing about poker or any other game.

Facilities: `sound-cues` (Sound cues for events, a manifest of sounds, mute by the device's sound preference).

## User inputs
`soundManifest`: the folder name that holds `manifest.json` and the sound files (lower-case letters, digits and hyphens; an aepm string setting cannot hold a slash or a dot, so it is a name not a path), default `sounds`. `defaultMuted`: whether sound starts muted when the device has no recorded preference, default false; give the preferences component `soundPreferenceDefault(defaultMuted)` as its default for `sound` so both agree. The manifest is `{ "format": 1, "cues": { "tap": "tap.wav" }, "events": { "button": ["tap"], "reveal": [{ "cue": "deal" }, { "cue": "flip", "delayMs": 300 }] } }`; files end in wav, mp3, ogg, m4a, aac or caf and are relative paths with no `..`.

- `soundManifest` (string, slug; optional; default `sounds`)
- `defaultMuted` (boolean; optional; default `False`)

## Artefacts and dependencies
`component.json` maps every `implementation/` source into `components/sound-cues/`:

- `implementation/android/src/main/java/ae/sound/CueModel.kt` -> `components/sound-cues/android/src/main/java/ae/sound/CueModel.kt`
- `implementation/android/src/main/java/ae/sound/ManifestJson.kt` -> `components/sound-cues/android/src/main/java/ae/sound/ManifestJson.kt`
- `implementation/android/src/main/java/ae/sound/SoundCuePlayer.kt` -> `components/sound-cues/android/src/main/java/ae/sound/SoundCuePlayer.kt`
- `implementation/apple/Sources/SoundCueModel.swift` -> `components/sound-cues/apple/Sources/SoundCueModel.swift`
- `implementation/apple/Sources/SoundCuePlayer.swift` -> `components/sound-cues/apple/Sources/SoundCuePlayer.swift`
- `implementation/web/cue-model.ts` -> `components/sound-cues/web/cue-model.ts`
- `implementation/web/cues.ts` -> `components/sound-cues/web/cues.ts`

Dependencies: none.
`tools.lock.json` pins verification tools: node 26.5.0, python3 3.12.8, swiftc 6.4.2, kotlinc 2.2.0, java 26.0.1. Licence wording remains deferred.

## Provided interfaces
- `interfaces/sound-cues.json` defines `sound-cues` (ae/sound-cues) version 1.0.0.

## Required interfaces
- `preferences` (ae/preferences) version 1.0.0, supplied by the recipe or application. Operations used: `interfaces/required/preferences.json`.

## Integration
Web: `createCues({ manifest, baseUrl: "./sounds", preferences, allowed })`, then `cues.unlockOn(document)` so the first tap unlocks sound, and `cues.emit("event")` wherever something happens; wire a sound toggle to `cues.setMuted`. `preferences` is the preferences component's store (only `get`, `set` and `subscribe` of `sound` are used); without it mute is kept in memory. Apple: parse the manifest with `SoundCueModel.parseManifest`, make a `SoundCuePlayer(manifest:locate:isMuted:allowed:)` where `locate` finds files in the bundle and `isMuted` reads `SoundCueModel.isMuted(sound:defaultMuted:)`; call `stopAll()` when sound is turned off. Android: `ManifestJson.parse` the manifest, package the files as raw resources named by `CueModel.rawResourceName` (tap.wav becomes `snd_tap`), make a `SoundCuePlayer(manifest, isMuted, allowed)` and call `init(context)`, `emit(event)`, and `stopAll()` when sound is turned off. Which events exist, the sounds themselves, call audio and the other players' voices stay with the recipe.

## Visual definition and connected examples
`visual/definition.json` maps its ports to the provided and required interfaces. `visual/examples/connected.json` connects the component to an illustrative application consumer. Both image formats and a text description are retained under `visual/output/`.

## Infrastructure
None. Local audio only; no accounts, network (beyond fetching the application's own sound files on the web) or deployment.

## Verification
Node tests check manifest validation (every kind of fault), event plans, settings, file and resource names and the mute rule, and run the engine against a fake audio context: nothing plays before unlock, a cue loads once and may overlap, events play their cues at the planned delays, muting stops playing and still-loading sounds and unmuting plays again, `defaultMuted` and a stored preference decide the state (a stored value wins), turning sound off in the preferences stops it, a host can forbid sound, and a missing file is silent. The Apple check compiles and runs `tests/apple/main.swift` for macOS, comparing plans, resource names and the mute rule with the TypeScript output, refusing faulty manifests and exercising the player with no files, then type-checks the Swift for the iOS simulator. The Android check compares the same plans (`tests/android/Expected.kt`); kotlinc was not available where this was written, so it has not been run, and `SoundCuePlayer.kt` and `ManifestJson.kt` need the Android SDK and are compiled by the application's Gradle build. No audio output is heard by any check.

- `node --test tests/web.test.ts` (web, required-local; tools: node 26.5.0)
- `python3 tests/native.py apple` (apple, platform; tools: python3 3.12.8, swiftc 6.4.2)
- `python3 tests/native.py android` (android, platform; tools: python3 3.12.8, kotlinc 2.2.0, java 26.0.1)

## Scenarios and presentation
A button press emits `button` and a click plays; revealing cards emits `reveal` and a deal sound is followed 300 ms later by a flip; the player taps the sound toggle, everything stops and later events stay silent; on a shared display the host forbids sound; a recipe with its own sounds and event names supplies its own manifest folder.

## Updates and removal
Patch updates replace files only. The component keeps no data of its own (the sound preference is kept by the preferences component); removal deletes its files and the application's imports of them.

// A consumer that needs no game: a manifest of neutral sounds, an in-memory mute, and a button that clicks.
import { readFileSync } from "node:fs";
import { createCues } from "../implementation/web/cues.ts";
import type { ContextLike } from "../implementation/web/cues.ts";
import { parseManifest } from "../implementation/web/cue-model.ts";

export function buttonClicker(context: () => ContextLike, fetchFile: (url: string) => Promise<ArrayBuffer>) {
  const manifest = parseManifest(readFileSync(new URL("../tests/fixtures/sounds.json", import.meta.url), "utf8"));
  const cues = createCues({ manifest, baseUrl: "./sounds", settings: { defaultMuted: false }, createContext: context, fetchFile });
  cues.unlock();
  return { click: () => cues.emit("button"), cues };
}

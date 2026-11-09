// Sounds for events, as data: a manifest names the sound files (cues) and says which cues an event
// plays and when. The sound files and the event names belong to the application; nothing here
// knows what the events mean. Everything here is pure and shared by every platform.
export type CueStep = { cue: string; delayMs: number };
export type ManifestStep = string | { cue: string; delayMs?: number };
export type Manifest = {
  format: 1;
  /** cue name -> file path, relative to the folder the manifest sits in */
  cues: Record<string, string>;
  /** event name -> the cues it plays, in order */
  events?: Record<string, ManifestStep[]>;
};
export type SoundSettings = { soundManifest: string; defaultMuted: boolean };

export const DEFAULT_SETTINGS: SoundSettings = { soundManifest: "sounds", defaultMuted: false };
export const NAME = /^[a-z][a-z0-9_-]{0,47}$/;
export const AUDIO_EXTENSIONS = ["wav", "mp3", "ogg", "m4a", "aac", "caf"];
export const MANIFEST_FILE = "manifest.json";

// The setting is the folder name (letters, digits and hyphens; an aepm string setting cannot hold a
// slash or a dot); the manifest is that folder's manifest.json.
export function manifestPath(soundManifest: string): string {
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(soundManifest)) throw new Error(`soundManifest must be a folder name of lower-case letters, digits and hyphens: ${soundManifest}`);
  return `${soundManifest}/${MANIFEST_FILE}`;
}

export function normaliseSettings(input: Partial<SoundSettings> = {}): SoundSettings {
  const out = { ...DEFAULT_SETTINGS, ...input };
  manifestPath(out.soundManifest);
  if (typeof out.defaultMuted !== "boolean") throw new Error("defaultMuted must be true or false");
  return out;
}

export function isSafeFile(file: unknown): file is string {
  return typeof file === "string" && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(file) && !file.includes("..") && !file.includes("//")
    && AUDIO_EXTENSIONS.includes(file.slice(file.lastIndexOf(".") + 1).toLowerCase());
}

// Returns the list of problems; empty means the manifest is usable.
export function validateManifest(manifest: unknown): string[] {
  const problems: string[] = [];
  const m = manifest as Manifest;
  if (typeof m !== "object" || m === null || Array.isArray(m)) return ["manifest must be an object"];
  if (m.format !== 1) problems.push("format must be 1");
  if (typeof m.cues !== "object" || m.cues === null || Array.isArray(m.cues) || !Object.keys(m.cues).length) return [...problems, "cues must name at least one sound"];
  for (const [name, file] of Object.entries(m.cues)) {
    if (!NAME.test(name)) problems.push(`cue name ${name} must be lower-case letters, digits, hyphens and underscores`);
    if (!isSafeFile(file)) problems.push(`cue ${name}: file must be a relative path ending in ${AUDIO_EXTENSIONS.join(", ")}`);
  }
  const files = Object.values(m.cues);
  if (new Set(files.map((f) => String(f).toLowerCase())).size !== files.length) problems.push("two cues share a file");
  for (const [event, steps] of Object.entries(m.events ?? {})) {
    if (!NAME.test(event)) problems.push(`event name ${event} must be lower-case letters, digits, hyphens and underscores`);
    if (!Array.isArray(steps) || !steps.length) { problems.push(`event ${event} must list at least one cue`); continue; }
    for (const step of steps) {
      const cue = typeof step === "string" ? step : step?.cue;
      const delay = typeof step === "string" ? 0 : step?.delayMs ?? 0;
      if (typeof cue !== "string" || !(cue in m.cues)) problems.push(`event ${event}: unknown cue ${String(cue)}`);
      if (!(typeof delay === "number" && delay >= 0 && delay <= 60000)) problems.push(`event ${event}: delayMs must be 0 to 60000`);
    }
  }
  return problems;
}

export function parseManifest(text: string): Manifest {
  let value: unknown;
  try { value = JSON.parse(text); } catch (e) { throw new Error(`manifest is not JSON: ${(e as Error).message}`); }
  const problems = validateManifest(value);
  if (problems.length) throw new Error(problems.join("; "));
  return value as Manifest;
}

// What an event plays, with delays filled in. An event that is itself a cue name and has no entry
// of its own plays that cue at once; any other unknown name plays nothing.
export function eventPlan(manifest: Manifest, event: string): CueStep[] {
  const steps = manifest.events?.[event];
  if (!steps) return event in manifest.cues ? [{ cue: event, delayMs: 0 }] : [];
  return steps.map((s) => (typeof s === "string" ? { cue: s, delayMs: 0 } : { cue: s.cue, delayMs: s.delayMs ?? 0 }));
}

// Every file the manifest uses, in cue order, so they can be loaded ahead of time.
export const cueFiles = (manifest: Manifest): string[] => Object.values(manifest.cues);

export function fileUrl(baseUrl: string, file: string): string {
  if (!isSafeFile(file)) throw new Error(`unsafe sound file: ${file}`);
  return `${baseUrl.replace(/\/+$/, "")}/${file}`;
}

// Android resource name for a file: its base name, lower case, other characters as underscores, with
// a prefix (resource names cannot start with a digit or hold dashes or dots).
export function rawResourceName(file: string, prefix = "snd_"): string {
  const base = file.slice(file.lastIndexOf("/") + 1).replace(/\.[^.]*$/, "");
  return prefix + base.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

// The device's sound preference is "on"; muted is its opposite. With no recorded preference the
// default decides.
export function isMuted(sound: boolean | null | undefined, defaultMuted: boolean): boolean {
  return typeof sound === "boolean" ? !sound : defaultMuted;
}

// The value to hand the preferences component as its default for `sound`.
export const soundPreferenceDefault = (defaultMuted: boolean): boolean => !defaultMuted;

// Plays the cues of a manifest. Browsers allow sound only after a tap, so nothing plays before
// `unlock()` has run once (bind it to the first pointer event with `unlockOn`). Sounds are loaded
// when first needed, may overlap, and are all stopped when sound is turned off or `stopAll` runs.
import { cueFiles, eventPlan, fileUrl, isMuted, normaliseSettings, soundPreferenceDefault } from "./cue-model.ts";
import type { Manifest, SoundSettings } from "./cue-model.ts";

// The parts of the browser's audio the engine uses, so tests (and other hosts) can supply their own.
export type SourceLike = { buffer: unknown; connect(destination: unknown): void; start(when?: number): void; stop(): void; onended: (() => void) | null };
export type ContextLike = {
  state: string;
  currentTime: number;
  destination: unknown;
  resume(): Promise<void>;
  decodeAudioData(data: ArrayBuffer): Promise<unknown>;
  createBufferSource(): SourceLike;
};
// The preferences component's store, as far as sound goes.
export type PreferencesLike = {
  get(name: "sound"): boolean;
  set(name: "sound", value: boolean): void;
  subscribe(listener: (name: string, value: unknown) => void): () => void;
};

export type CueOptions = {
  manifest: Manifest;
  /** where the manifest's files are served from, such as "./sounds" */
  baseUrl: string;
  settings?: Partial<SoundSettings>;
  /** the device's preferences; without them mute is kept in memory, starting at `defaultMuted` */
  preferences?: PreferencesLike;
  /** false stops all sound for now, such as on a shared display where nobody should hear it */
  allowed?: () => boolean;
  createContext?: () => ContextLike;
  fetchFile?: (url: string) => Promise<ArrayBuffer>;
};

export type Cues = {
  unlock(): void;
  unlockOn(target: { addEventListener(type: string, fn: () => void, options?: unknown): void }, type?: string): void;
  /** plays one cue, after `delayMs` */
  play(cue: string, delayMs?: number): void;
  /** plays what the manifest says this event plays */
  emit(event: string): void;
  preload(): Promise<void>;
  stopAll(): void;
  muted(): boolean;
  setMuted(muted: boolean): void;
  onMutedChange(listener: (muted: boolean) => void): () => void;
  /** cues playing or waiting right now */
  active(): number;
};

export function createCues(o: CueOptions): Cues {
  const settings = normaliseSettings(o.settings);
  const createContext = o.createContext ?? (() => new (globalThis as any).AudioContext() as ContextLike);
  const fetchFile = o.fetchFile ?? (async (url: string) => (await fetch(url)).arrayBuffer());
  let ctx: ContextLike | null = null;
  const buffers = new Map<string, Promise<unknown | null>>();
  const sources = new Set<SourceLike>();
  const listeners = new Set<(muted: boolean) => void>();
  let generation = 0;
  let memoryMuted = settings.defaultMuted;
  let lastMuted: boolean | null = null;

  const muted = () => (o.preferences ? isMuted(o.preferences.get("sound"), settings.defaultMuted) : memoryMuted);
  const allowed = () => (o.allowed ? o.allowed() : true);

  const stopAll = () => {
    generation++;
    for (const s of sources) { try { s.stop(); } catch { /* already finished */ } }
    sources.clear();
  };
  const changed = () => {
    const now = muted();
    if (now === lastMuted) return;
    lastMuted = now;
    if (now) stopAll();
    for (const l of listeners) l(now);
  };
  lastMuted = muted();
  o.preferences?.subscribe((name) => { if (name === "sound") changed(); });

  const load = (cue: string): Promise<unknown | null> => {
    let b = buffers.get(cue);
    if (!b) {
      const file = o.manifest.cues[cue];
      b = file === undefined || !ctx ? Promise.resolve(null)
        : fetchFile(fileUrl(o.baseUrl, file)).then((data) => ctx!.decodeAudioData(data)).catch(() => null);
      if (file !== undefined && ctx) buffers.set(cue, b);
    }
    return b;
  };

  const unlock = () => {
    if (!ctx) ctx = createContext();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
  };
  const play = (cue: string, delayMs = 0) => {
    if (!ctx || muted() || !allowed() || !(cue in o.manifest.cues)) return;
    const started = generation;
    const c = ctx;
    void load(cue).then((buffer) => {
      if (!buffer || started !== generation || muted() || !allowed()) return;
      const source = c.createBufferSource();
      source.buffer = buffer;
      source.connect(c.destination);
      sources.add(source);
      source.onended = () => sources.delete(source);
      source.start(c.currentTime + delayMs / 1000);
    });
  };

  return {
    unlock,
    unlockOn(target, type = "pointerdown") {
      target.addEventListener(type, () => { if (allowed()) unlock(); }, { capture: true });
    },
    play,
    emit(event) {
      for (const step of eventPlan(o.manifest, event)) play(step.cue, step.delayMs);
    },
    async preload() {
      if (!ctx) return;
      await Promise.all(Object.keys(o.manifest.cues).map(load));
    },
    stopAll,
    muted,
    setMuted(value) {
      if (o.preferences) o.preferences.set("sound", !value);
      else memoryMuted = value;
      changed();
    },
    onMutedChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    active: () => sources.size,
  };
}

export { cueFiles, soundPreferenceDefault };

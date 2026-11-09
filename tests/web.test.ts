import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  DEFAULT_SETTINGS, cueFiles, eventPlan, fileUrl, isMuted, isSafeFile, manifestPath, normaliseSettings, parseManifest, rawResourceName, soundPreferenceDefault, validateManifest,
} from "../implementation/web/cue-model.ts";
import type { Manifest } from "../implementation/web/cue-model.ts";
import { createCues } from "../implementation/web/cues.ts";
import type { ContextLike, PreferencesLike, SourceLike } from "../implementation/web/cues.ts";
import { build as buildFixtures, buildKotlin } from "./make-fixtures.ts";
import { buttonClicker } from "../examples/consumer.ts";

const text = readFileSync(new URL("fixtures/sounds.json", import.meta.url), "utf8");
const manifest = parseManifest(text);

class FakeSource implements SourceLike {
  buffer: unknown = null; connected = false; startedAt: number | null = null; stopped = false; onended: (() => void) | null = null;
  connect() { this.connected = true; }
  start(when = 0) { this.startedAt = when; }
  stop() { this.stopped = true; }
}
class FakeContext implements ContextLike {
  state = "suspended"; currentTime = 10; destination = {}; resumed = 0; made: FakeSource[] = []; decoded: string[] = [];
  async resume() { this.state = "running"; this.resumed++; }
  async decodeAudioData(data: ArrayBuffer) { const name = new TextDecoder().decode(data); this.decoded.push(name); return { name }; }
  createBufferSource() { const s = new FakeSource(); this.made.push(s); return s; }
}
const fetched: string[] = [];
const fetchFile = async (url: string) => { fetched.push(url); if (url.endsWith("missing.wav")) throw new Error("404"); return new TextEncoder().encode(url).buffer as ArrayBuffer; };
const tick = () => new Promise((r) => setTimeout(r, 5));
function setup(extra: Partial<Parameters<typeof createCues>[0]> = {}) {
  const ctx = new FakeContext();
  fetched.length = 0;
  const cues = createCues({ manifest, baseUrl: "./sounds/", createContext: () => ctx, fetchFile, ...extra });
  return { ctx, cues };
}
class FakePreferences implements PreferencesLike {
  sound: boolean | undefined; listeners: ((n: string, v: unknown) => void)[] = [];
  constructor(sound?: boolean) { this.sound = sound; }
  get() { return this.sound as boolean; }
  set(_: "sound", v: boolean) { this.sound = v; for (const l of this.listeners) l("sound", v); }
  subscribe(l: (n: string, v: unknown) => void) { this.listeners.push(l); return () => { this.listeners = this.listeners.filter((x) => x !== l); }; }
}

test("the sample manifest is valid and its events plan their cues", () => {
  assert.deepEqual(validateManifest(JSON.parse(text)), []);
  assert.deepEqual(eventPlan(manifest, "button"), [{ cue: "tap", delayMs: 0 }]);
  assert.deepEqual(eventPlan(manifest, "reveal"), [{ cue: "deal", delayMs: 0 }, { cue: "flip", delayMs: 300 }]);
  assert.deepEqual(eventPlan(manifest, "problem"), [{ cue: "fail", delayMs: 0 }, { cue: "alert", delayMs: 120 }]);
  assert.deepEqual(eventPlan(manifest, "flip"), [{ cue: "flip", delayMs: 0 }], "a cue name with no event plays itself");
  assert.deepEqual(eventPlan(manifest, "nothing"), []);
  assert.deepEqual(cueFiles(manifest), ["tap.wav", "enter.wav", "exit.wav", "deal.wav", "flip.wav", "success.wav", "fail.mp3", "alert.ogg"]);
});

test("a manifest is refused for every kind of fault", () => {
  const bad = (change: (m: any) => void) => { const m = JSON.parse(text); change(m); return validateManifest(m); };
  assert.deepEqual(validateManifest(null), ["manifest must be an object"]);
  assert.deepEqual(validateManifest([]), ["manifest must be an object"]);
  assert.match(bad((m) => { m.format = 2; })[0], /format/);
  assert.match(bad((m) => { m.cues = {}; })[0], /at least one sound/);
  assert.match(bad((m) => { m.cues.Tap = "t.wav"; }).join(), /cue name Tap/);
  assert.match(bad((m) => { m.cues.tap = "../tap.wav"; }).join(), /cue tap: file/);
  assert.match(bad((m) => { m.cues.tap = "/tap.wav"; }).join(), /cue tap: file/);
  assert.match(bad((m) => { m.cues.tap = "tap.exe"; }).join(), /cue tap: file/);
  assert.match(bad((m) => { m.cues.tap = 5; }).join(), /cue tap: file/);
  assert.match(bad((m) => { m.cues.again = "tap.wav"; }).join(), /share a file/);
  assert.match(bad((m) => { m.events.button = ["nope"]; }).join(), /unknown cue nope/);
  assert.match(bad((m) => { m.events.button = []; }).join(), /at least one cue/);
  assert.match(bad((m) => { m.events.reveal[1].delayMs = -1; }).join(), /delayMs/);
  assert.match(bad((m) => { m.events.reveal[1].delayMs = 70000; }).join(), /delayMs/);
  assert.match(bad((m) => { m.events.Bad = ["tap"]; }).join(), /event name Bad/);
  assert.deepEqual(validateManifest({ format: 1, cues: { a: "a.wav" } }), [], "events are optional");
  assert.throws(() => parseManifest("{"), /not JSON/);
  assert.throws(() => parseManifest('{"format":1,"cues":{"a":"a.txt"}}'), /file must be/);
});

test("settings: the manifest folder and the default mute", () => {
  assert.deepEqual(normaliseSettings(), DEFAULT_SETTINGS);
  assert.equal(manifestPath("sounds"), "sounds/manifest.json");
  assert.equal(manifestPath("game-sounds2"), "game-sounds2/manifest.json");
  for (const bad of ["", "Sounds", "a/b", "../x", "a.b", "2sounds"]) assert.throws(() => normaliseSettings({ soundManifest: bad }), /soundManifest/, bad);
  assert.throws(() => normaliseSettings({ defaultMuted: "yes" as never }), /defaultMuted/);
  assert.equal(normaliseSettings({ defaultMuted: true }).defaultMuted, true);
});

test("files, urls, resource names and the mute rule", () => {
  assert.equal(fileUrl("./sounds/", "tap.wav"), "./sounds/tap.wav");
  assert.equal(fileUrl("https://x.example/s", "ui/tap.wav"), "https://x.example/s/ui/tap.wav");
  assert.throws(() => fileUrl("./s", "../x.wav"), /unsafe/);
  assert.ok(isSafeFile("a/b-c_d.OGG") && !isSafeFile("a//b.wav") && !isSafeFile("") && !isSafeFile(".wav"));
  assert.equal(rawResourceName("tap.wav"), "snd_tap");
  assert.equal(rawResourceName("ui/Bot-Add.wav"), "snd_bot_add");
  assert.equal(rawResourceName("deal 2.mp3", "x_"), "x_deal_2");
  assert.equal(isMuted(true, true), false);
  assert.equal(isMuted(false, false), true);
  assert.equal(isMuted(undefined, true), true);
  assert.equal(isMuted(null, false), false);
  assert.equal(soundPreferenceDefault(true), false);
  assert.equal(soundPreferenceDefault(false), true);
});

test("nothing plays before the first tap unlocks sound, then a cue loads once and plays", async () => {
  const { ctx, cues } = setup();
  cues.emit("button");
  await tick();
  assert.equal(ctx.made.length, 0, "locked");
  assert.equal(fetched.length, 0);
  cues.unlock();
  assert.equal(ctx.resumed, 1);
  cues.unlock();
  assert.equal(ctx.resumed, 1, "a running context is not resumed again");
  cues.emit("button");
  cues.emit("button");
  await tick();
  assert.equal(ctx.made.length, 2, "cues may overlap");
  assert.deepEqual(fetched, ["./sounds/tap.wav"], "the file is fetched once");
  assert.deepEqual(ctx.decoded, ["./sounds/tap.wav"]);
  assert.ok(ctx.made.every((s) => s.connected && s.startedAt === 10));
  assert.equal(cues.active(), 2);
  ctx.made[0].onended?.();
  assert.equal(cues.active(), 1);
});

test("events play their cues with delays, unknown names play nothing", async () => {
  const { ctx, cues } = setup();
  cues.unlock();
  cues.emit("reveal");
  cues.emit("nothing");
  cues.play("no-such-cue");
  await tick();
  assert.deepEqual(ctx.made.map((s) => s.startedAt), [10, 10.3]);
  assert.deepEqual(ctx.made.map((s) => (s.buffer as { name: string }).name), ["./sounds/deal.wav", "./sounds/flip.wav"]);
  cues.play("success", 500);
  await tick();
  assert.equal(ctx.made[2].startedAt, 10.5);
});

test("muting stops what is playing and what is still loading, and unmuting plays again", async () => {
  const { ctx, cues } = setup();
  cues.unlock();
  const changes: boolean[] = [];
  cues.onMutedChange((m) => changes.push(m));
  cues.emit("button");
  await tick();
  cues.emit("won");
  cues.setMuted(true);
  await tick();
  assert.equal(ctx.made.length, 1, "the load that finished after muting is dropped");
  assert.ok(ctx.made[0].stopped);
  assert.equal(cues.active(), 0);
  cues.emit("button");
  await tick();
  assert.equal(ctx.made.length, 1, "muted cues do not play");
  cues.setMuted(true);
  cues.setMuted(false);
  cues.emit("button");
  await tick();
  assert.equal(ctx.made.length, 2);
  assert.deepEqual(changes, [true, false], "listeners hear only real changes");
});

test("defaultMuted decides the first state without a stored preference", async () => {
  const quiet = setup({ settings: { defaultMuted: true } });
  quiet.cues.unlock();
  assert.equal(quiet.cues.muted(), true);
  quiet.cues.emit("button");
  await tick();
  assert.equal(quiet.ctx.made.length, 0);
  assert.equal(setup().cues.muted(), false);
});

test("sound follows the device preference: stored value wins, the default fills in, changes stop sound", async () => {
  const off = new FakePreferences(false);
  const a = setup({ preferences: off, settings: { defaultMuted: false } });
  assert.equal(a.cues.muted(), true, "the stored off wins over the default");
  const unset = new FakePreferences(undefined);
  assert.equal(setup({ preferences: unset, settings: { defaultMuted: true } }).cues.muted(), true);
  assert.equal(setup({ preferences: unset, settings: { defaultMuted: false } }).cues.muted(), false);
  const prefs = new FakePreferences(true);
  const b = setup({ preferences: prefs });
  b.cues.unlock();
  const changes: boolean[] = [];
  b.cues.onMutedChange((m) => changes.push(m));
  b.cues.emit("button");
  await tick();
  assert.equal(b.ctx.made.length, 1);
  prefs.set("sound", false);
  assert.ok(b.ctx.made[0].stopped, "turning sound off in the preferences stops it");
  assert.deepEqual(changes, [true]);
  b.cues.setMuted(false);
  assert.equal(prefs.sound, true, "setMuted writes the preference");
  assert.deepEqual(changes, [true, false]);
});

test("the host can forbid sound, and a missing file is silent", async () => {
  let allowed = false;
  const { ctx, cues } = setup({ allowed: () => allowed });
  const listeners: Record<string, () => void> = {};
  cues.unlockOn({ addEventListener: (type, fn) => { listeners[type] = fn; } });
  listeners.pointerdown();
  assert.equal(ctx.resumed, 0, "not unlocked while sound is not allowed");
  allowed = true;
  listeners.pointerdown();
  assert.equal(ctx.resumed, 1);
  const withMissing = setup({ manifest: { format: 1, cues: { ghost: "missing.wav", tap: "tap.wav" } } });
  withMissing.cues.unlock();
  withMissing.cues.play("ghost");
  withMissing.cues.play("tap");
  await tick();
  assert.equal(withMissing.ctx.made.length, 1, "the failed load plays nothing and does not stop others");
  await withMissing.cues.preload();
});

test("preload fetches every file once", async () => {
  const { cues } = setup();
  await cues.preload();
  assert.deepEqual(fetched, [], "nothing to load before unlock");
  cues.unlock();
  await cues.preload();
  await cues.preload();
  assert.equal(fetched.length, 8);
});

test("the native fixtures are the TypeScript model", () => {
  assert.equal(readFileSync(new URL("fixtures/cues.json", import.meta.url), "utf8"), buildFixtures());
  assert.equal(readFileSync(new URL("android/Expected.kt", import.meta.url), "utf8"), buildKotlin());
});

test("a consumer clicks a button without a game", async () => {
  const ctx = new FakeContext();
  const { click, cues } = buttonClicker(() => ctx, fetchFile);
  click();
  await tick();
  assert.equal(ctx.made.length, 1);
  assert.equal(cues.muted(), false);
});

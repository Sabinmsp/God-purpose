/**
 * Synthesized sound effects and background music (WebAudio, no asset files),
 * so the game stays lightweight and works offline.
 *
 * Everything runs through one master chain: a soft echo for sparkle, then a
 * compressor so stacked sounds never clip. Music has its own quiet bus.
 */
type Sfx = "click" | "complete" | "xp" | "levelup" | "coin" | "unlock" | "error" | "door" | "open" | "fanfare" | "start" | "win" | "whoosh";

let ctx: AudioContext | null = null;
let sfxBus: GainNode | null = null;
let echoSend: GainNode | null = null;
let musicBus: GainNode | null = null;
let muted = false;
let musicWanted = true;

export function setMuted(value: boolean) {
  muted = value;
  syncMusic();
}

/** The player's Music setting; music also stays off while all sound is muted. */
export function setMusicEnabled(value: boolean) {
  musicWanted = value;
  syncMusic();
}

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    comp.connect(ctx.destination);

    sfxBus = ctx.createGain();
    sfxBus.gain.value = 1;
    sfxBus.connect(comp);

    // A short feedback echo, sent a little of every effect, makes chimes ring.
    echoSend = ctx.createGain();
    echoSend.gain.value = 0.22;
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.16;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.32;
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 2600;
    echoSend.connect(delay).connect(tone).connect(feedback).connect(delay);
    tone.connect(comp);

    musicBus = ctx.createGain();
    musicBus.gain.value = 0;
    musicBus.connect(comp);
    musicBus.connect(echoSend);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function note(freq: number, start: number, dur: number, type: OscillatorType = "square", vol = 0.06, opts: { bus?: GainNode | null; echo?: boolean; glideTo?: number } = {}) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + start;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (opts.glideTo) osc.frequency.exponentialRampToValueAtTime(opts.glideTo, t + dur);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(vol, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(opts.bus ?? sfxBus!);
  if (opts.echo !== false) gain.connect(echoSend!);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

/** A short filtered noise burst: whooshes and sparkle. */
function noise(start: number, dur: number, vol: number, from: number, to: number) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + start;
  const len = Math.ceil(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const filter = a.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 1.2;
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(to, t + dur);
  const gain = a.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(vol, t + dur * 0.3);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(gain).connect(sfxBus!);
  src.start(t);
  src.stop(t + dur + 0.02);
}

/** Quiet high twinkles over a sound, for wins. */
function sparkle(start: number, count = 4) {
  const notes = [2093, 2637, 3136, 2349, 2794];
  for (let i = 0; i < count; i++) note(notes[i % notes.length], start + i * 0.05, 0.12, "sine", 0.018);
}

export function play(sfx: Sfx) {
  if (muted) return;
  if (!ac()) return;
  switch (sfx) {
    case "click":
      note(660, 0, 0.04, "square", 0.025, { echo: false });
      break;
    case "open":
      note(440, 0, 0.06, "triangle", 0.05);
      note(660, 0.05, 0.08, "triangle", 0.05);
      break;
    case "whoosh":
      noise(0, 0.28, 0.05, 400, 2400);
      break;
    case "door":
      note(196, 0, 0.08, "triangle", 0.06);
      note(147, 0.07, 0.12, "triangle", 0.05);
      break;
    case "complete":
      note(523, 0, 0.08);
      note(659, 0.07, 0.08);
      note(784, 0.14, 0.18);
      note(131, 0, 0.22, "triangle", 0.05, { echo: false });
      sparkle(0.2, 3);
      break;
    case "win":
      // A pillar won for the day: bright rising run, a thump and twinkles.
      note(98, 0, 0.3, "triangle", 0.08, { echo: false, glideTo: 65 });
      [523, 659, 784, 1047].forEach((f, i) => note(f, i * 0.06, 0.14, "square", 0.045));
      note(1319, 0.26, 0.4, "triangle", 0.05);
      sparkle(0.3, 5);
      break;
    case "xp":
      note(880, 0, 0.05, "triangle", 0.04);
      note(1175, 0.05, 0.08, "triangle", 0.04);
      break;
    case "coin":
      note(988, 0, 0.06, "square", 0.04);
      note(1319, 0.06, 0.2, "square", 0.04);
      sparkle(0.12, 2);
      break;
    case "unlock":
      [523, 659, 784, 1047].forEach((f, i) => note(f, i * 0.06, 0.12, "triangle", 0.05));
      sparkle(0.25, 3);
      break;
    case "levelup":
      noise(0, 0.5, 0.04, 300, 4000);
      [392, 523, 659, 784, 1047, 1319].forEach((f, i) => note(f, i * 0.08, 0.18, "square", 0.05));
      [523, 659, 784].forEach((f) => note(f, 0.5, 0.9, "triangle", 0.035));
      note(1568, 0.5, 0.6, "triangle", 0.05);
      note(65, 0.5, 0.6, "triangle", 0.07, { echo: false });
      sparkle(0.6, 5);
      break;
    case "fanfare":
      [523, 659, 784, 1047].forEach((f, i) => note(f, i * 0.12, 0.18, "square", 0.05));
      [784, 1047, 1319].forEach((f) => note(f, 0.55, 0.7, "triangle", 0.04));
      note(65, 0.55, 0.8, "triangle", 0.07, { echo: false });
      [1568, 1319, 1568, 2093].forEach((f, i) => note(f, 1.1 + i * 0.1, 0.14, "triangle", 0.035));
      sparkle(1.5, 5);
      break;
    case "start":
      // Title screen "Continue": a warm opening chord.
      noise(0, 0.35, 0.035, 300, 2000);
      [262, 330, 392, 523].forEach((f, i) => note(f, 0.05 + i * 0.07, 0.6, "triangle", 0.04));
      note(784, 0.35, 0.5, "sine", 0.04);
      break;
    case "error":
      note(220, 0, 0.1, "sawtooth", 0.04, { echo: false });
      note(165, 0.09, 0.14, "sawtooth", 0.04, { echo: false });
      break;
  }
}

// ── Background music ───────────────────────────────────────────────────────
// A calm 8-bar loop (I–vi–IV–V in C, with a pentatonic melody), scheduled a
// little ahead with a timer so it stays in time even when the tab is busy.

const BPM = 84;
const BEAT = 60 / BPM;
const STEP = BEAT / 2; // eighth notes
const CHORDS = [
  [131, 165, 196], // C
  [110, 131, 165], // Am
  [87, 110, 131], // F
  [98, 123, 147], // G
];
// Melody: one note (Hz) or 0 for a rest, per eighth note, 8 per bar, 8 bars.
const MELODY = [
  523, 0, 659, 0, 784, 0, 659, 0, 880, 0, 784, 0, 659, 0, 0, 0, 587, 0, 659, 0, 523, 0, 0, 0, 587, 0, 659, 587, 523, 0, 0, 0,
  784, 0, 880, 0, 1047, 0, 880, 0, 784, 0, 659, 0, 784, 0, 0, 0, 659, 0, 587, 0, 523, 0, 587, 0, 659, 0, 0, 0, 0, 0, 0, 0,
];
let musicTimer: ReturnType<typeof setInterval> | null = null;
let nextTime = 0;
let step = 0;
let started = false;

function scheduleMusic() {
  const a = ctx;
  if (!a || !musicBus) return;
  while (nextTime < a.currentTime + 0.4) {
    const bar = Math.floor(step / 8) % 8;
    const inBar = step % 8;
    const chord = CHORDS[bar % 4];
    const at = nextTime - a.currentTime;
    if (inBar === 0) {
      // Soft pad for the bar, plus a bass note.
      chord.forEach((f) => note(f * 2, at, STEP * 8, "triangle", 0.018, { bus: musicBus, echo: false }));
      note(chord[0] / 2, at, STEP * 3, "sine", 0.05, { bus: musicBus, echo: false });
    }
    if (inBar === 4) note(chord[0] / 2, at, STEP * 3, "sine", 0.04, { bus: musicBus, echo: false });
    // Gentle arpeggio on the off-beats.
    if (inBar % 2 === 1) note(chord[(inBar >> 1) % 3] * 4, at, STEP * 0.9, "sine", 0.012, { bus: musicBus, echo: false });
    const m = MELODY[step % MELODY.length];
    if (m) note(m, at, STEP * 1.8, "square", 0.012, { bus: musicBus });
    nextTime += STEP;
    step++;
  }
}

function syncMusic() {
  const should = started && musicWanted && !muted && (typeof document === "undefined" || document.visibilityState === "visible");
  if (should && !musicTimer) {
    const a = ac();
    if (!a || !musicBus) return;
    nextTime = a.currentTime + 0.1;
    musicBus.gain.cancelScheduledValues(a.currentTime);
    musicBus.gain.setValueAtTime(musicBus.gain.value, a.currentTime);
    musicBus.gain.linearRampToValueAtTime(0.9, a.currentTime + 2.5);
    scheduleMusic();
    musicTimer = setInterval(scheduleMusic, 100);
  } else if (!should && musicTimer) {
    clearInterval(musicTimer);
    musicTimer = null;
    if (ctx && musicBus) {
      musicBus.gain.cancelScheduledValues(ctx.currentTime);
      musicBus.gain.setValueAtTime(musicBus.gain.value, ctx.currentTime);
      musicBus.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
    }
  }
}

/**
 * Starts the music loop. Browsers only allow audio after the player taps or
 * clicks, so call this from a click handler (or the first tap anywhere).
 */
export function startMusic() {
  if (started) return;
  started = true;
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", syncMusic);
  syncMusic();
}

export function musicPlaying() {
  return musicTimer !== null;
}

/**
 * Tiny synthesized sound effects (WebAudio, no asset files). Every sound is
 * a few oscillator notes, so the game stays lightweight and works offline.
 */
type Sfx = "click" | "complete" | "xp" | "levelup" | "coin" | "unlock" | "error" | "door" | "open";

let ctx: AudioContext | null = null;
let muted = false;

export function setMuted(value: boolean) {
  muted = value;
}

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function note(freq: number, start: number, dur: number, type: OscillatorType = "square", vol = 0.06) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + start;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(vol, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export function play(sfx: Sfx) {
  if (muted) return;
  switch (sfx) {
    case "click":
      note(660, 0, 0.05, "square", 0.03);
      break;
    case "open":
      note(440, 0, 0.06, "triangle", 0.05);
      note(660, 0.05, 0.08, "triangle", 0.05);
      break;
    case "door":
      note(196, 0, 0.08, "triangle", 0.06);
      note(147, 0.07, 0.12, "triangle", 0.05);
      break;
    case "complete":
      note(523, 0, 0.08);
      note(659, 0.07, 0.08);
      note(784, 0.14, 0.14);
      break;
    case "xp":
      note(880, 0, 0.05, "triangle", 0.04);
      note(1175, 0.05, 0.08, "triangle", 0.04);
      break;
    case "coin":
      note(988, 0, 0.06, "square", 0.04);
      note(1319, 0.06, 0.16, "square", 0.04);
      break;
    case "unlock":
      [523, 659, 784, 1047].forEach((f, i) => note(f, i * 0.06, 0.1, "triangle", 0.05));
      break;
    case "levelup":
      [392, 523, 659, 784, 1047, 1319].forEach((f, i) => note(f, i * 0.08, 0.16, "square", 0.05));
      note(1568, 0.5, 0.4, "triangle", 0.05);
      break;
    case "error":
      note(220, 0, 0.1, "sawtooth", 0.04);
      note(165, 0.09, 0.14, "sawtooth", 0.04);
      break;
  }
}

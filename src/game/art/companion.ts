import { Pixels } from "./paint";

const OUT = "#1b1424";
const GEMS = ["#8f7cf0", "#e0794f", "#5fc4a4", "#f2c14e"];

/**
 * Four Wins AI: a small hovering helper robot with a screen face, a gem that
 * cycles through the four pillar colours and a four-pillar emblem.
 * Four idle frames: hover bob, a blink, gem colour cycle.
 */
export function aiBot(frame: number): Pixels {
  const p = new Pixels(24, 32);
  const bob = [0, -1, -2, -1][frame % 4];
  const y = 6 + bob;
  const shell = "#e4ebf7";
  const shade = "#aab5cc";

  // Antenna and pillar gem
  p.vline(11, y - 4, 4, shade);
  p.rect(10, y - 7, 3, 3, GEMS[frame % 4]);
  p.set(10, y - 7, "#ffffff");

  // Head with screen face
  p.rrect(4, y, 16, 10, shell);
  p.vline(18, y + 1, 8, shade);
  p.rect(6, y + 2, 12, 6, "#1d2650");
  if (frame % 4 === 2) {
    p.hline(8, y + 5, 2, "#5ff0e0");
    p.hline(14, y + 5, 2, "#5ff0e0");
  } else {
    p.rect(8, y + 4, 2, 2, "#5ff0e0");
    p.rect(14, y + 4, 2, 2, "#5ff0e0");
    p.set(8, y + 4, "#e6fffb");
    p.set(14, y + 4, "#e6fffb");
  }
  p.hline(11, y + 7, 2, "#5ff0e0");

  // Body with four-pillar emblem
  p.rrect(6, y + 10, 12, 9, shell);
  p.vline(16, y + 11, 7, shade);
  p.hline(7, y + 18, 10, shade);
  [["#8f7cf0", 10, 12], ["#e0794f", 12, 12], ["#5fc4a4", 10, 14], ["#f2c14e", 12, 14]].forEach(([c, x, yy]) =>
    p.rect(x as number, y + (yy as number), 2, 2, c as string),
  );

  // Floating hands (bob opposite to the body)
  const hand = y + 12 - bob * 2;
  p.ellipse(1, hand, 4, 4, shell);
  p.ellipse(19, hand, 4, 4, shell);
  p.outline(OUT);

  // Hover glow (drawn after the outline so it stays soft)
  for (let x = 6; x < 18; x++) p.set(x, 29, "#5ff0e055");
  for (let x = 8; x < 16; x++) p.set(x, 30, "#5ff0e033");
  return p;
}

/** Speech bubble shown above the AI robot so players know they can talk to it. */
export function chatBubble(): Pixels {
  const p = new Pixels(13, 11);
  p.rrect(0, 0, 13, 8, "#ffffff");
  p.rect(3, 8, 2, 1, "#ffffff");
  p.set(3, 9, "#ffffff");
  [3, 6, 9].forEach((x) => p.set(x, 4, "#1d2650"));
  p.outline(OUT);
  return p;
}

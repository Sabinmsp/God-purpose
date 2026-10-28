import * as Phaser from "phaser";
import { PILLAR_META, type Pillar } from "@/lib/shared/pillars";

const hex = (c: string) => Phaser.Display.Color.HexStringToColor(c).color;

export function pillarColor(p: Pillar | "overall"): number {
  return p === "overall" ? 0xf2c14e : hex(PILLAR_META[p].color);
}

/** Crisp pixel-font text that rises and fades. */
export function floatText(scene: Phaser.Scene, x: number, y: number, text: string, tint = 0xffffff, delay = 0) {
  const t = scene.add
    .bitmapText(x, y, "pixel", text.toUpperCase())
    .setOrigin(0.5, 1)
    .setLetterSpacing(-1)
    .setTint(tint)
    .setDepth(100000)
    .setAlpha(0);
  scene.tweens.add({ targets: t, alpha: 1, duration: 120, delay });
  scene.tweens.add({
    targets: t,
    y: y - 26,
    duration: 1500,
    delay,
    ease: "Cubic.easeOut",
    onComplete: () => scene.tweens.add({ targets: t, alpha: 0, duration: 300, onComplete: () => t.destroy() }),
  });
}

export function burst(scene: Phaser.Scene, x: number, y: number, tex: string, tint: number | number[], count = 14, reduced = false) {
  const e = scene.add.particles(x, y, tex, {
    speed: { min: 30, max: 90 },
    angle: { min: 0, max: 360 },
    lifespan: 700,
    scale: { start: 1, end: 0 },
    alpha: { start: 1, end: 0 },
    tint,
    gravityY: 60,
    blendMode: Phaser.BlendModes.ADD,
    emitting: false,
  });
  e.setDepth(100001);
  e.explode(reduced ? Math.ceil(count / 3) : count);
  scene.time.delayedCall(1000, () => e.destroy());
}

export function coinShower(scene: Phaser.Scene, x: number, y: number, reduced = false) {
  const e = scene.add.particles(x, y - 30, "fx-coin", {
    speedX: { min: -50, max: 50 },
    speedY: { min: -120, max: -60 },
    gravityY: 320,
    lifespan: 900,
    alpha: { start: 1, end: 0.2 },
    emitting: false,
  });
  e.setDepth(100001);
  e.explode(reduced ? 4 : 12);
  scene.time.delayedCall(1200, () => e.destroy());
}

const FIREWORK_COLORS = [0x8f7cf0, 0xe0794f, 0x5fc4a4, 0xf2c14e, 0xfff1b0];

/** Fireworks over the player for a complete Four Wins day. */
export function fireworks(scene: Phaser.Scene, x: number, y: number, title: string, subtitle: string, reduced = false) {
  const shots = reduced ? 3 : 12;
  for (let i = 0; i < shots; i++) {
    scene.time.delayedCall(i * 260, () => {
      const fx = x + Phaser.Math.Between(-110, 110);
      const fy = y - Phaser.Math.Between(70, 140);
      const color = FIREWORK_COLORS[i % FIREWORK_COLORS.length];
      const trail = scene.add.image(fx, y - 10, "fx-dot").setTint(color).setDepth(100003).setBlendMode(Phaser.BlendModes.ADD);
      scene.tweens.add({
        targets: trail,
        y: fy,
        duration: 380,
        ease: "Quad.easeOut",
        onComplete: () => {
          trail.destroy();
          const e = scene.add.particles(fx, fy, i % 2 ? "fx-spark" : "fx-dot", {
            speed: { min: 40, max: 120 },
            angle: { min: 0, max: 360 },
            lifespan: 1000,
            gravityY: 70,
            scale: { start: 1.2, end: 0 },
            alpha: { start: 1, end: 0 },
            tint: [color, 0xffffff],
            blendMode: Phaser.BlendModes.ADD,
            emitting: false,
          });
          e.setDepth(100004);
          e.explode(reduced ? 14 : 34);
          scene.time.delayedCall(1300, () => e.destroy());
        },
      });
    });
  }
  const banner = scene.add
    .bitmapText(x, y - 56, "pixel", title.toUpperCase())
    .setOrigin(0.5, 1)
    .setLetterSpacing(-1)
    .setTint(0xf2c14e)
    .setDepth(100005)
    .setScale(0.3);
  const sub = scene.add.bitmapText(x, y - 44, "pixel", subtitle.toUpperCase()).setOrigin(0.5, 1).setLetterSpacing(-1).setDepth(100005).setAlpha(0);
  scene.tweens.add({ targets: banner, scale: 1.4, duration: 500, ease: "Back.easeOut" });
  scene.tweens.add({ targets: sub, alpha: 1, delay: 400, duration: 300 });
  scene.tweens.add({ targets: [banner, sub], alpha: 0, delay: 3600, duration: 600, onComplete: () => (banner.destroy(), sub.destroy()) });
  if (!reduced) scene.cameras.main.flash(300, 255, 241, 176, false);
}

/** Column of light, sparks and a banner — reserved for real level-ups. */
export function levelUpFx(scene: Phaser.Scene, x: number, y: number, label: string, tint: number, reduced = false) {
  const beam = scene.add.image(x, y - 20, "glow-gold").setBlendMode(Phaser.BlendModes.ADD).setDepth(99990).setScale(0.4, 0.2).setTint(tint);
  scene.tweens.add({
    targets: beam,
    scaleX: 0.7,
    scaleY: 2.4,
    alpha: { from: 1, to: 0 },
    duration: 1600,
    ease: "Sine.easeOut",
    onComplete: () => beam.destroy(),
  });
  const ring = scene.add.image(x, y - 4, "glow-white").setBlendMode(Phaser.BlendModes.ADD).setDepth(99989).setScale(0.1).setTint(tint);
  scene.tweens.add({ targets: ring, scale: 1.2, alpha: { from: 0.9, to: 0 }, duration: 900, onComplete: () => ring.destroy() });
  burst(scene, x, y - 16, "fx-spark", [tint, 0xffffff], 22, reduced);
  const title = scene.add
    .bitmapText(x, y - 40, "pixel", label.toUpperCase())
    .setOrigin(0.5, 1)
    .setLetterSpacing(-1)
    .setTint(0xfff1b0)
    .setDepth(100002)
    .setScale(0.5);
  scene.tweens.add({ targets: title, scale: 1, y: y - 50, duration: 400, ease: "Back.easeOut" });
  scene.tweens.add({ targets: title, alpha: 0, delay: 2200, duration: 500, onComplete: () => title.destroy() });
  if (!reduced) scene.cameras.main.flash(250, 255, 236, 170, false);
}

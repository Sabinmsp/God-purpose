import type * as Phaser from "phaser";

/**
 * Loads PixelLab-generated character art that `npm run pixellab:sync`
 * downloaded into /public. If no manifest exists, the game keeps using the
 * procedural sprites.
 */
export const PIXELLAB_DIR = "/assets/pixellab/sabin";
export const PIXELLAB_KEY = "player-pl";
const MANIFEST = "pl-manifest";

export interface PixelLabManifest {
  name: string;
  rotations: Record<string, string>;
  animations: Record<string, Record<string, string[]>>;
}

export interface FrameMetrics {
  w: number;
  h: number;
  /** Lowest opaque row (the soles of the feet). */
  footY: number;
}

export const CLASSIC_METRICS: FrameMetrics = { w: 32, h: 32, footY: 29 };
let metrics: FrameMetrics | null = null;

export function pixelLabMetrics() {
  return metrics;
}

const DIRS: Record<string, string> = { down: "south", up: "north", right: "east", left: "west" };
const tex = (rel: string) => `pl:${rel}`;

/** Call from a scene's preload(): queues the manifest, then every frame it lists. */
export function queuePixelLab(scene: Phaser.Scene) {
  scene.load.on(`filecomplete-json-${MANIFEST}`, (_key: string, _type: string, data: PixelLabManifest) => {
    const files = new Set<string>([...Object.values(data.rotations), ...Object.values(data.animations).flatMap((d) => Object.values(d).flat())]);
    for (const rel of files) scene.load.image(tex(rel), `${PIXELLAB_DIR}/${rel}`);
  });
  scene.load.json(MANIFEST, `${PIXELLAB_DIR}/manifest.json`);
}

function measure(scene: Phaser.Scene, key: string): FrameMetrics | null {
  if (!scene.textures.exists(key)) return null;
  const img = scene.textures.get(key).getSourceImage() as HTMLImageElement;
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height).data;
  for (let y = c.height - 1; y >= 0; y--) {
    for (let x = 0; x < c.width; x++) if (data[(y * c.width + x) * 4 + 3] > 40) return { w: c.width, h: c.height, footY: y };
  }
  return { w: c.width, h: c.height, footY: c.height - 1 };
}

/** Builds `player-pl:<anim>-<dir>` animations. Returns false when no art is installed. */
export function registerPixelLab(scene: Phaser.Scene): boolean {
  const manifest = scene.cache.json.get(MANIFEST) as PixelLabManifest | undefined;
  if (!manifest?.rotations?.south) return false;

  const frameList = (anim: string, dir: string): string[] | null => {
    const files = manifest.animations[anim]?.[DIRS[dir]];
    if (files?.length && files.every((f) => scene.textures.exists(tex(f)))) return files.map(tex);
    const rot = manifest.rotations[DIRS[dir]];
    return rot && scene.textures.exists(tex(rot)) ? [tex(rot)] : null;
  };

  for (const dir of ["down", "up", "right", "left"]) {
    for (const [anim, rate] of [
      ["walk", 10],
      ["idle", 5],
    ] as const) {
      const frames = frameList(anim, dir);
      const key = `${PIXELLAB_KEY}:${anim}-${dir}`;
      if (scene.anims.exists(key)) scene.anims.remove(key);
      // West clips are optional: without animated west frames the east clip is mirrored.
      if (!frames || (dir === "left" && !manifest.animations[anim]?.west?.length)) continue;
      scene.anims.create({ key, frames: frames.map((k) => ({ key: k })), frameRate: rate, repeat: -1 });
    }
  }
  metrics = measure(scene, tex(manifest.animations.idle?.south?.[0] ?? manifest.rotations.south));
  return true;
}

export function hasPixelLab(scene: Phaser.Scene) {
  return scene.anims.exists(`${PIXELLAB_KEY}:idle-down`);
}

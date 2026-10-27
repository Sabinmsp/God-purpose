import "server-only";

/**
 * Asset generation adapter.
 *
 * The game ships with original procedural pixel art (src/game/art): every
 * sprite is drawn in code, so the world works with no external service.
 * PixelLab can replace those sprites once API access is configured. The key
 * is read on the server only — it is never bundled or sent to the browser.
 *
 * Integration point: implement `generate()` against PixelLab's documented
 * API (https://pixellab.ai) and export the results as sprite sheets into
 * `public/assets/pixellab/` following CHARACTER_SPEC below. Nothing here
 * calls an undocumented endpoint.
 */

export interface SpriteRequest {
  id: string;
  description: string;
  size: 32 | 48 | 64;
  directions: 4 | 8;
  view: "low top-down";
  animations: string[];
}

export interface GeneratedSprite {
  id: string;
  sheetPath: string;
  frameSize: number;
  animations: Record<string, { row: number; frames: number; fps: number }>;
}

export interface AssetGenerator {
  readonly name: string;
  available(): boolean;
  generate(request: SpriteRequest): Promise<GeneratedSprite>;
}

/** What to generate for the player so it drops into the existing animation set. */
export const CHARACTER_SPEC: SpriteRequest = {
  id: "sabin",
  description:
    "Young adult man named Sabin, dark short spiky hair, medium build, casual blue t-shirt, dark jeans, " +
    "brown backpack, white sneakers, friendly expressive face, original character, clean pixel art",
  size: 32,
  directions: 4,
  view: "low top-down",
  animations: ["idle", "walk", "run", "exercise", "read", "meditate", "work", "sleep", "celebrate", "levelup"],
};

export function pixelLabConfigured(): boolean {
  return Boolean(process.env.PIXELLAB_API_KEY);
}

/** Built-in generator: the procedural art that renders in the browser. */
export const proceduralGenerator: AssetGenerator = {
  name: "procedural",
  available: () => true,
  async generate(request) {
    return {
      id: request.id,
      sheetPath: "procedural://character",
      frameSize: 32,
      animations: {},
    };
  },
};

export const pixelLabGenerator: AssetGenerator = {
  name: "pixellab",
  available: pixelLabConfigured,
  async generate() {
    throw new Error(
      "PixelLab generation is not wired yet. Configure PIXELLAB_API_KEY and implement this adapter " +
        "against PixelLab's documented API; the game keeps using procedural sprites until then.",
    );
  },
};

export function assetGenerator(): AssetGenerator {
  return pixelLabGenerator.available() ? pixelLabGenerator : proceduralGenerator;
}

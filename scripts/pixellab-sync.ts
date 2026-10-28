/**
 * Downloads a PixelLab character (rotations + animations) into
 * public/assets/pixellab/<slug>/ and writes manifest.json for the game.
 *
 *   PIXELLAB_API_KEY=… npm run pixellab:sync -- <character-id> [slug]
 *
 * Runs locally only. The key is read from the environment and never written
 * to the project; the game itself only loads the downloaded static PNGs.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const MCP_URL = "https://api.pixellab.ai/mcp";
const DEFAULT_CHARACTER = "1a894f95-9bc3-478e-8691-7ee353f81d56";

const key = process.env.PIXELLAB_API_KEY;
if (!key) {
  console.error("PIXELLAB_API_KEY is not set.");
  process.exit(1);
}
const characterId = process.argv[2] ?? DEFAULT_CHARACTER;
const slug = process.argv[3] ?? "sabin";
const outDir = path.join(process.cwd(), "public", "assets", "pixellab", slug);

const baseHeaders = {
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
};

async function callTool(name: string, args: Record<string, unknown>): Promise<string> {
  const init = await fetch(MCP_URL, {
    method: "POST",
    headers: baseHeaders,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "four-wins-sync", version: "1" } },
    }),
  });
  if (!init.ok) throw new Error(`PixelLab initialize failed: HTTP ${init.status}`);
  const session = init.headers.get("mcp-session-id");
  const headers = session ? { ...baseHeaders, "Mcp-Session-Id": session } : baseHeaders;
  await init.text();
  await fetch(MCP_URL, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) });
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args } }),
  });
  const raw = await res.text();
  const line = raw.split("\n").find((l) => l.startsWith("data:")) ?? raw;
  const json = JSON.parse(line.replace(/^data:\s*/, ""));
  if (json.error) throw new Error(`PixelLab ${name}: ${JSON.stringify(json.error)}`);
  const text = (json.result.content as { type: string; text?: string }[]).filter((c) => c.type === "text").map((c) => c.text).join("\n");
  if (json.result.isError) throw new Error(`PixelLab ${name}: ${text}`);
  return text;
}

interface Parsed {
  name: string;
  rotations: Record<string, string>;
  animations: Record<string, Record<string, { url: string; frames: number }>>;
}

/** Parses the text report returned by get_character. */
function parse(report: string): Parsed {
  if (!/^status: completed/m.test(report)) throw new Error(`Character is not ready yet:\n${report.slice(0, 300)}`);
  const lines = report.split("\n");
  const out: Parsed = { name: report.match(/^name: (.+)$/m)?.[1]?.trim() ?? slug, rotations: {}, animations: {} };
  let section: "rotations" | "animations" | null = null;
  let anim: string | null = null;
  for (const line of lines) {
    if (/^rotations:/.test(line)) section = "rotations";
    else if (/^animations/.test(line)) section = "animations";
    else if (/^\S/.test(line)) section = null;
    else if (section === "rotations") {
      const m = line.match(/^\s+([a-z-]+): (https:\/\/\S+)/);
      if (m) out.rotations[m[1]] = m[2];
    } else if (section === "animations") {
      const header = line.match(/^ {2}(\S.*?) — \d+ dir/);
      if (header) {
        anim = header[1].trim().toLowerCase().replace(/\s+/g, "-");
        out.animations[anim] ??= {};
        continue;
      }
      const m = line.match(/^\s{4}([a-z-]+): (https:\/\/\S+) \(i=0\.\.(\d+)\)/);
      if (m && anim) out.animations[anim][m[1]] = { url: m[2], frames: Number(m[3]) + 1 };
    }
  }
  return out;
}

async function download(url: string, file: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
}

async function main() {
  const parsed = parse(await callTool("get_character", { character_id: characterId, include_preview: false }));
  const manifest = {
    source: "pixellab",
    characterId,
    name: parsed.name,
    syncedAt: new Date().toISOString(),
    rotations: {} as Record<string, string>,
    animations: {} as Record<string, Record<string, string[]>>,
  };
  for (const [dir, url] of Object.entries(parsed.rotations)) {
    const rel = `rotations/${dir}.png`;
    await download(url, path.join(outDir, rel));
    manifest.rotations[dir] = rel;
  }
  for (const [anim, dirs] of Object.entries(parsed.animations)) {
    manifest.animations[anim] = {};
    for (const [dir, { url, frames }] of Object.entries(dirs)) {
      manifest.animations[anim][dir] = [];
      for (let i = 0; i < frames; i++) {
        const rel = `${anim}/${dir}/${i}.png`;
        await download(url.replace("{i}", String(i)), path.join(outDir, rel));
        manifest.animations[anim][dir].push(rel);
      }
    }
  }
  await writeFile(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  const frameCount = Object.values(manifest.animations).flatMap((d) => Object.values(d)).flat().length;
  console.log(`✓ ${parsed.name}: ${Object.keys(manifest.rotations).length} rotations, ${Object.keys(manifest.animations).length} animations (${frameCount} frames) → ${path.relative(process.cwd(), outDir)}`);
}

main().catch((err) => {
  console.error(`✗ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});

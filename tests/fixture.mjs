import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, deflateSync } from "node:zlib";

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length);
  head.write(type, 4, "latin1");
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])));
  return Buffer.concat([head, data, sum]);
}

/** A gray PNG `side` pixels square whose data is one pixel, its scanline led by `filter`. */
export function png(filter, side = 1) {
  const header = Buffer.from([0, 0, 0, side, 0, 0, 0, side, 8, 0, 0, 0, 0]);
  const image = deflateSync(Buffer.from([filter, 1]));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", image), chunk("IEND", Buffer.alloc(0))]);
}
export const PNG = png(0);
export const broken = Buffer.from(PNG);
broken[broken.length - 20] ^= 0xff;

export const good = {
  id: "tally",
  name: "Tally",
  author: "Ada",
  description: "Counts things.",
  category: "work",
  platforms: ["macOS", "Linux"],
  website: null,
  source: "https://github.com/ada/tally",
  publishedAt: "2026-10-04T00:00:00Z",
  previews: ["preview0.png"],
};

/** A catalog in a temp folder: one app, its files, and featured.json. */
export function catalog({ app = good, folder = "tally", files = {}, featured = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), "showcase-"));
  const dir = join(root, "apps", folder);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(app));
  writeFileSync(join(dir, "preview0.png"), PNG);
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  writeFileSync(join(root, "featured.json"), JSON.stringify(featured));
  return root;
}

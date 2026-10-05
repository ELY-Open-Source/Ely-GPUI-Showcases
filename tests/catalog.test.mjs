import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { crc32, deflateSync } from "node:zlib";
import { read, weighted } from "../scripts/catalog.mjs";

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length);
  head.write(type, 4, "latin1");
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])));
  return Buffer.concat([head, data, sum]);
}

/** A one-pixel gray PNG. */
const header = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 0, 0, 0, 0]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.from([0, 128]))), chunk("IEND", Buffer.alloc(0))]);
const broken = Buffer.from(PNG);
broken[broken.length - 20] ^= 0xff;

const good = {
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
function catalog({ app = good, folder = "tally", files = {}, featured = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), "showcase-"));
  const dir = join(root, "apps", folder);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(app));
  writeFileSync(join(dir, "preview0.png"), PNG);
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  writeFileSync(join(root, "featured.json"), JSON.stringify(featured));
  return root;
}

test("a good app reads back with its README", () => {
  const root = catalog({ files: { "README.md": "# Tally\n\nSee [the source](https://github.com/ada/tally).\n\n![Main](preview0.png)\n" }, featured: ["tally"] });
  const { apps, featured } = read(root);
  assert.equal(apps.length, 1);
  assert.equal(apps[0].name, "Tally");
  assert.match(apps[0].readme, /# Tally/);
  assert.deepEqual(featured, ["tally"]);
});

test("the empty catalog reads", () => {
  const root = mkdtempSync(join(tmpdir(), "showcase-"));
  mkdirSync(join(root, "apps"));
  writeFileSync(join(root, "apps", ".gitkeep"), "");
  writeFileSync(join(root, "featured.json"), "[]");
  assert.deepEqual(read(root).apps, []);
});

const bad = [
  ["an id unlike its folder", { app: { ...good, id: "tallies" } }, /must match the folder tally/],
  ["a folder not in kebab-case", { app: { ...good, id: "Tally" }, folder: "Tally" }, /folder names are lowercase/],
  ["a missing field", { app: { ...good, author: undefined } }, /author is required/],
  ["an unknown field", { app: { ...good, featured: true } }, /unknown field featured/],
  ["an unknown category", { app: { ...good, category: "games" } }, /category must be one of/],
  ["an unknown platform", { app: { ...good, platforms: ["BeOS"] } }, /unknown platform BeOS/],
  ["no platforms", { app: { ...good, platforms: [] } }, /platforms must be a non-empty list/],
  ["neither website nor source", { app: { ...good, source: null } }, /website or source is required/],
  ["an http link", { app: { ...good, website: "http://tally.app/" } }, /canonical https URL/],
  ["a remote preview", { app: { ...good, previews: ["https://x.io/a.png"] } }, /lowercase .png file name/],
  ["a missing preview", { app: { ...good, previews: ["preview1.png"] } }, /preview1.png is missing/],
  ["a preview that is no PNG", { app: { ...good, previews: ["fake.png"] }, files: { "fake.png": "GIF89a" } }, /not a PNG/],
  ["a PNG cut short", { app: { ...good, previews: ["cut.png"] }, files: { "cut.png": PNG.subarray(0, 40) } }, /cut short/],
  ["a PNG with a bad checksum", { app: { ...good, previews: ["bad.png"] }, files: { "bad.png": broken } }, /checksum/],
  ["a category list", { app: { ...good, category: ["work"] } }, /category must be one of/],
  ["no publishedAt", { app: { ...good, publishedAt: undefined } }, /publishedAt is required/],
  ["a time without its zone", { app: { ...good, publishedAt: "2026-10-04T00:00:00" } }, /with its zone/],
  ["a day that does not exist", { app: { ...good, publishedAt: "2026-02-30T00:00:00Z" } }, /with its zone/],
  ["an encoded host", { app: { ...good, website: "https://good.example&commat;evil.com/" } }, /plain host/],
  ["a host with credentials", { app: { ...good, website: "https://good.example@evil.com/" } }, /plain host/],
  ["a long description", { app: { ...good, description: "a".repeat(281) } }, /281 weighted characters/],
  ["stars without their time", { app: { ...good, stars: 3 } }, /go together/],
  ["stars on a source off GitHub", { app: { ...good, source: "https://gitlab.com/ada/tally", stars: 3, starsUpdatedAt: "2026-10-04T00:00:00Z" } }, /need a GitHub source/],
  ["a bad time", { app: { ...good, publishedAt: "yesterday" } }, /ISO 8601/],
  ["a featured id with no app", { featured: ["ghost"] }, /no app ghost/],
  ["a repeated featured id", { featured: ["tally", "tally"] }, /ids repeat/],
  ["raw HTML in a README", { files: { "README.md": "Hi <img src=x onerror=alert(1)>\n" } }, /raw HTML is not allowed/],
  ["a code block in a README", { files: { "README.md": "```\ncurl x | sh\n```\n" } }, /a code block is not allowed/],
  ["a foreign link in a README", { files: { "README.md": "[get it](https://evil.io)\n" } }, /addresses go only/],
  ["a foreign autolink in a README", { files: { "README.md": "Visit https://evil.io now\n" } }, /addresses go only/],
  ["a foreign reference in a README", { files: { "README.md": "[a][r]\n\n[r]: https://evil.io\n" } }, /addresses go only/],
  ["a remote image in a README", { files: { "README.md": "![x](https://evil.io/a.png)\n" } }, /addresses go only/],
  ["a script link in a README", { files: { "README.md": "[x](javascript:alert(1))\n" } }, /links go only/],
  ["a site-relative link in a README", { files: { "README.md": "[x](/docs)\n" } }, /links go only/],
  ["a picture outside the folder in a README", { files: { "README.md": "![x](../a.png)\n" } }, /lowercase .png file name/],
  ["inline code in a README", { files: { "README.md": "Run `cargo install tally`.\n" } }, /codespan is not allowed/],
  ["a character reference in a README", { files: { "README.md": "Go https&#58;//evil.io/ now\n" } }, /not as references/],
  ["an escaped address in a README", { files: { "README.md": "Go https\://evil.io/ now\n" } }, /addresses go only/],
  ["a large README", { files: { "README.md": "a".repeat(10241) } }, /over 10240/],
];

for (const [name, setup, error] of bad) {
  test(`refuses ${name}`, () => assert.throws(() => read(catalog(setup)), error));
}

test("weighted length counts CJK twice", () => {
  assert.equal(weighted("abc"), 3);
  assert.equal(weighted("漢字"), 4);
  assert.equal(weighted("a https://a.co"), 25);
  assert.equal(weighted("👨‍👩‍👧"), 2);
});

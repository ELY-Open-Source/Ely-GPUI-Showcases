import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { read, weighted } from "../scripts/catalog.mjs";
import { broken, catalog, good, PNG, png } from "./fixture.mjs";

test("a good app reads back with its README", () => {
  const root = catalog({ files: { "README.md": "# Tally\n\nSee [the source](https://github.com/ada/tally).\n\n![Main](preview0.png)\n" }, featured: ["tally"] });
  const { apps, featured } = read(root);
  assert.equal(apps.length, 1);
  assert.equal(apps[0].name, "Tally");
  assert.match(apps[0].readme, /# Tally/);
  assert.deepEqual(featured, ["tally"]);
});

test("addresses in prose may end a sentence or hold parentheses", () => {
  const app = { ...good, website: "https://tally.app/foo(bar)" };
  const readme = "See https://github.com/ada/tally. Or [the site](https://tally.app/foo(bar)), (https://github.com/ada/tally).\n";
  assert.equal(read(catalog({ app, files: { "README.md": readme } })).apps.length, 1);
});

test("an address may end in punctuation of its own", () => {
  const app = { ...good, source: "https://github.com/ada/tally_", website: "https://tally.app/?" };
  const readme = "[Source](https://github.com/ada/tally_) and [site](https://tally.app/?).\n";
  assert.equal(read(catalog({ app, files: { "README.md": readme } })).apps.length, 1);
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
  ["a PNG cut short", { app: { ...good, previews: ["cut.png"] }, files: { "cut.png": PNG.subarray(0, 40) } }, /does not decode/],
  ["a PNG with a bad checksum", { app: { ...good, previews: ["bad.png"] }, files: { "bad.png": broken } }, /does not decode/],
  ["a PNG with too little data", { app: { ...good, previews: ["short.png"] }, files: { "short.png": png(0, 4) } }, /does not fill the image/],
  ["a PNG with an unknown filter", { app: { ...good, previews: ["odd.png"] }, files: { "odd.png": png(99) } }, /does not decode/],
  ["a category list", { app: { ...good, category: ["work"] } }, /category must be one of/],
  ["no publishedAt", { app: { ...good, publishedAt: undefined } }, /publishedAt is required/],
  ["a time without its zone", { app: { ...good, publishedAt: "2026-10-04T00:00:00" } }, /with its zone/],
  ["a zone past 23 hours", { app: { ...good, publishedAt: "2026-10-04T00:00:00+99:99" } }, /with its zone/],
  ["a zone past 59 minutes", { app: { ...good, publishedAt: "2026-10-04T00:00:00+01:60" } }, /with its zone/],
  ["a day that does not exist", { app: { ...good, publishedAt: "2026-02-30T00:00:00Z" } }, /with its zone/],
  ["an encoded host", { app: { ...good, website: "https://good.example&commat;evil.com/" } }, /plain host/],
  ["a GitHub source with a trailing slash", { app: { ...good, source: "https://github.com/ada/tally/" } }, /github.com\/owner\/repo/],
  ["a GitHub source with a query", { app: { ...good, source: "https://github.com/ada/tally?tab=readme-ov-file" } }, /github.com\/owner\/repo/],
  ["a GitHub source on www", { app: { ...good, source: "https://www.github.com/ada/tally" } }, /github.com\/owner\/repo/],
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
  ["an address that runs on past the website", { files: { "README.md": "See https://github.com/ada/tally.evil.io now\n" } }, /addresses go only/],
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

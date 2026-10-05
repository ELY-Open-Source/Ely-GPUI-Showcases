import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { refresh } from "../scripts/stars.mjs";
import { catalog, good } from "./fixture.mjs";

const manifest = (root) => JSON.parse(readFileSync(join(root, "apps", "tally", "manifest.json"), "utf8"));

test("a new count writes stars and the time", async () => {
  const root = catalog();
  const asked = [];
  const changed = await refresh(root, async (repo) => (asked.push(repo), 42), "2026-10-05T00:00:00.000Z");
  assert.deepEqual(asked, [{ owner: "ada", repo: "tally" }]);
  assert.deepEqual(changed, ["tally"]);
  assert.equal(manifest(root).stars, 42);
  assert.equal(manifest(root).starsUpdatedAt, "2026-10-05T00:00:00.000Z");
});

test("the same count keeps the time", async () => {
  const root = catalog({ app: { ...good, stars: 42, starsUpdatedAt: "2026-10-01T00:00:00Z" } });
  assert.deepEqual(await refresh(root, async () => 42, "2026-10-05T00:00:00.000Z"), []);
  assert.equal(manifest(root).starsUpdatedAt, "2026-10-01T00:00:00Z");
});

test("an app off GitHub is not asked", async () => {
  const root = catalog({ app: { ...good, source: null, website: "https://tally.app/" } });
  assert.deepEqual(await refresh(root, async () => assert.fail("asked"), "2026-10-05T00:00:00.000Z"), []);
});

test("a bad count fails", async () => {
  await assert.rejects(refresh(catalog(), async () => undefined, "2026-10-05T00:00:00.000Z"), /GitHub gave undefined stars/);
});

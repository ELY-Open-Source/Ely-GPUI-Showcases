import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { github, read } from "./catalog.mjs";

/** Sets each GitHub app's stars; the time moves only when the count does. Returns the ids changed. */
export async function refresh(root, get, now) {
  const changed = [];
  for (const app of read(root).apps) {
    const repo = github(app.source);
    if (!repo) continue;
    const stars = await get(repo);
    if (!Number.isInteger(stars) || stars < 0) throw new Error(`${app.id}: GitHub gave ${stars} stars`);
    if (app.stars === stars) continue;
    const path = join(root, "apps", app.id, "manifest.json");
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    writeFileSync(path, `${JSON.stringify({ ...manifest, stars, starsUpdatedAt: now }, null, 2)}\n`);
    console.log(`stars: ${app.id} ${app.stars ?? "none"} -> ${stars}`);
    changed.push(app.id);
  }
  return changed;
}

/** A repository's stars from GitHub's API, signed in when GITHUB_TOKEN holds a GitHub token. */
async function stargazers({ owner, repo }) {
  const token = process.env.GITHUB_TOKEN;
  const headers = { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
  if (!res.ok) throw new Error(`stars: ${owner}/${repo} answered ${res.status} ${await res.text()}`);
  return (await res.json()).stargazers_count;
}

if (import.meta.main) {
  const changed = await refresh(process.cwd(), stargazers, new Date().toISOString());
  console.log(`stars: ${changed.length} changed`);
}

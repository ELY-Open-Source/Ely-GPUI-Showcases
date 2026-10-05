import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { Lexer } from "marked";

export const CATEGORIES = {
  dev: "Developer Tools",
  terminal: "Terminal & Network",
  system: "System & Desktop",
  work: "Productivity & Media",
};
export const PLATFORMS = ["macOS", "Windows", "Linux", "Web"];
export const README_BYTES = 10240;

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const FILE = /^[a-z0-9][a-z0-9._-]*$/;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const REQUIRED = ["id", "name", "author", "description", "category", "platforms", "website", "source", "previews"];
const OPTIONAL = ["building", "publishedAt", "stars", "starsUpdatedAt"];
const TOKENS = new Set(["space", "heading", "paragraph", "text", "strong", "em", "del", "codespan", "br", "hr", "blockquote", "list", "list_item", "table", "escape", "checkbox", "def", "link", "image"]);

/** Twitter's weighted length: these ranges count 1, all else 2. */
export function weighted(text) {
  const light = [[0, 4351], [8192, 8205], [8208, 8223], [8242, 8247]];
  let n = 0;
  for (const ch of text.normalize("NFC")) {
    const c = ch.codePointAt(0);
    n += light.some(([a, b]) => c >= a && c <= b) ? 1 : 2;
  }
  return n;
}

function fail(where, what) {
  throw new Error(`${where}: ${what}`);
}

function text(where, value, field) {
  if (typeof value !== "string" || value.trim() !== value || !value) fail(where, `${field} must be a trimmed, non-empty string`);
}

function address(where, value, field) {
  if (value === null) return;
  text(where, value, field);
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(where, `${field} is not a URL: ${value}`);
  }
  if (url.protocol !== "https:" || url.href !== value) fail(where, `${field} must be a canonical https URL: ${value}`);
}

/** The owner and repo of a GitHub source, or null. */
export function github(source) {
  const m = source?.match(/^https:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/);
  return m ? { owner: m[1], repo: m[2] } : null;
}

function png(where, dir, name) {
  if (!FILE.test(name) || !name.endsWith(".png")) fail(where, `${name} must be a lowercase .png file name in the app folder`);
  const path = join(dir, name);
  if (!existsSync(path) || !statSync(path).isFile()) fail(where, `${name} is missing`);
  if (!readFileSync(path).subarray(0, 8).equals(PNG)) fail(where, `${name} is not a PNG`);
}

function manifest(dir, id) {
  const where = `apps/${id}/manifest.json`;
  const path = join(dir, "manifest.json");
  if (!existsSync(path)) fail(where, "missing");
  let app;
  try {
    app = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(where, `invalid JSON: ${error.message}`);
  }
  if (typeof app !== "object" || app === null || Array.isArray(app)) fail(where, "must be an object");
  for (const key of REQUIRED) if (!(key in app)) fail(where, `${key} is required`);
  for (const key of Object.keys(app)) if (!REQUIRED.includes(key) && !OPTIONAL.includes(key)) fail(where, `unknown field ${key}`);
  if (app.id !== id) fail(where, `id ${JSON.stringify(app.id)} must match the folder ${id}`);
  for (const key of ["name", "author", "description"]) text(where, app[key], key);
  if (weighted(app.description) > 280) fail(where, `description is ${weighted(app.description)} weighted characters, over 280`);
  if (!Object.hasOwn(CATEGORIES, app.category)) fail(where, `category must be one of ${Object.keys(CATEGORIES).join(", ")}`);
  if (!Array.isArray(app.platforms) || !app.platforms.length) fail(where, "platforms must be a non-empty list");
  for (const p of app.platforms) if (!PLATFORMS.includes(p)) fail(where, `unknown platform ${p}; use ${PLATFORMS.join(", ")}`);
  if (new Set(app.platforms).size !== app.platforms.length) fail(where, "platforms repeat");
  address(where, app.website, "website");
  address(where, app.source, "source");
  if (app.website === null && app.source === null) fail(where, "website or source is required");
  if (!Array.isArray(app.previews) || !app.previews.length) fail(where, "previews must be a non-empty list");
  if (new Set(app.previews).size !== app.previews.length) fail(where, "previews repeat");
  for (const name of app.previews) png(where, dir, name);
  if ("building" in app && typeof app.building !== "boolean") fail(where, "building must be true or false");
  for (const key of ["publishedAt", "starsUpdatedAt"]) {
    if (key in app && (typeof app[key] !== "string" || Number.isNaN(Date.parse(app[key])) || !/^\d{4}-\d\d-\d\dT/.test(app[key]))) fail(where, `${key} must be an ISO 8601 time`);
  }
  if ("stars" in app !== "starsUpdatedAt" in app) fail(where, "stars and starsUpdatedAt go together");
  if ("stars" in app && (!Number.isInteger(app.stars) || app.stars < 0)) fail(where, "stars must be a whole number");
  if ("stars" in app && !github(app.source)) fail(where, "stars need a GitHub source");
  return app;
}

/** Checks an app's README and returns its Markdown, or null. */
function readme(dir, app) {
  const where = `apps/${app.id}/README.md`;
  const path = join(dir, "README.md");
  if (!existsSync(path)) return null;
  const bytes = readFileSync(path);
  if (bytes.length > README_BYTES) fail(where, `${bytes.length} bytes, over ${README_BYTES}`);
  const markdown = bytes.toString("utf8");
  const links = [app.website, app.source].filter(Boolean);
  const walk = (tokens) => {
    for (const t of tokens) {
      if (!TOKENS.has(t.type)) fail(where, `${t.type === "html" ? "raw HTML" : t.type === "code" ? "a code block" : t.type} is not allowed: ${t.raw.trim().slice(0, 60)}`);
      if ((t.type === "link" || t.type === "def") && !links.includes(t.href)) fail(where, `links go only to the website or source: ${t.href}`);
      if (t.type === "image") png(where, dir, t.href);
      for (const key of ["tokens", "items"]) if (t[key]) walk(t[key]);
      if (t.type === "table") for (const cell of [...t.header, ...t.rows.flat()]) walk(cell.tokens);
    }
  };
  walk(Lexer.lex(markdown, { gfm: true }));
  return markdown;
}

/** Reads and checks the whole catalog; the first problem throws. */
export function read(root) {
  const appsDir = join(root, "apps");
  if (!existsSync(appsDir)) fail("apps", "missing");
  const apps = [];
  for (const entry of readdirSync(appsDir).sort()) {
    if (entry === ".gitkeep") continue;
    const dir = join(appsDir, entry);
    if (!statSync(dir).isDirectory()) fail(`apps/${entry}`, "only app folders belong in apps/");
    if (!ID.test(entry)) fail(`apps/${entry}`, "folder names are lowercase kebab-case");
    for (const file of readdirSync(dir)) {
      if (!["manifest.json", "README.md"].includes(file) && !FILE.test(file)) fail(`apps/${entry}/${file}`, "file names are lowercase");
    }
    const app = manifest(dir, entry);
    apps.push({ ...app, readme: readme(dir, app) });
  }
  const where = "featured.json";
  let featured;
  try {
    featured = JSON.parse(readFileSync(join(root, where), "utf8"));
  } catch (error) {
    fail(where, error.message);
  }
  if (!Array.isArray(featured)) fail(where, "must be a list of app ids");
  if (new Set(featured).size !== featured.length) fail(where, "ids repeat");
  for (const id of featured) if (!apps.some((a) => a.id === id)) fail(where, `no app ${id}`);
  return { apps, featured, categories: CATEGORIES };
}

import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { Lexer } from "marked";
import { PNG as Decoder } from "pngjs";
import twitter from "twitter-text";

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
const REQUIRED = ["id", "name", "author", "description", "category", "platforms", "website", "source", "publishedAt", "previews"];
const OPTIONAL = ["building", "stars", "starsUpdatedAt"];
const TIME = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(\.\d+)?(Z|[+-]\d\d:\d\d)$/;
const ENTITY = /&(#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/i;
const URLISH = /[a-z][a-z0-9+.-]*:\/\/[^\s<>\[\]"'`]*/gi;
const TOKENS = new Set(["space", "heading", "paragraph", "text", "strong", "em", "del", "br", "hr", "blockquote", "list", "list_item", "table", "escape", "checkbox", "def", "link", "image"]);

/** Twitter's weighted length. */
export const weighted = (text) => twitter.parseTweet(text).weightedLength;

/** An ISO 8601 time with its zone, on a real date. */
function time(value) {
  const m = typeof value === "string" && value.match(TIME);
  if (!m) return false;
  const [y, mo, d, h, mi, sec] = m.slice(1, 7).map(Number);
  const at = new Date(Date.UTC(y, mo - 1, d, h, mi, sec));
  const zone = m[8] === "Z" || (Number(m[8].slice(1, 3)) < 24 && Number(m[8].slice(4)) < 60);
  return zone && at.getUTCMonth() === mo - 1 && at.getUTCDate() === d && h < 24 && mi < 60 && sec < 60 && !Number.isNaN(Date.parse(value));
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
  if (url.protocol !== "https:" || url.href !== value || url.username || url.password || ENTITY.test(value) || !/^[a-z0-9.-]+$/.test(url.hostname)) {
    fail(where, `${field} must be a canonical https URL with a plain host: ${value}`);
  }
}

/** The owner and repo of a GitHub source, or null. */
export function github(source) {
  const m = source?.match(/^https:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/);
  return m ? { owner: m[1], repo: m[2] } : null;
}

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
const ADAM7 = [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]];

/** The bytes a PNG's image data must inflate to, from its header. */
function rasterBytes(bytes) {
  const [w, h, depth, color, interlace] = [bytes.readUInt32BE(16), bytes.readUInt32BE(20), bytes[24], bytes[25], bytes[28]];
  const row = (width) => 1 + Math.ceil((width * depth * CHANNELS[color]) / 8);
  if (!interlace) return h * row(w);
  return ADAM7.reduce((n, [x, y, dx, dy]) => {
    const [pw, ph] = [Math.ceil((w - x) / dx), Math.ceil((h - y) / dy)];
    return pw > 0 && ph > 0 ? n + ph * row(pw) : n;
  }, 0);
}

/** The PNG's image data, inflated. */
function raster(bytes) {
  const data = [];
  for (let at = 8; at + 8 <= bytes.length; ) {
    const length = bytes.readUInt32BE(at);
    if (bytes.toString("latin1", at + 4, at + 8) === "IDAT") data.push(bytes.subarray(at + 8, at + 8 + length));
    at += 12 + length;
  }
  return inflateSync(Buffer.concat(data));
}

function png(where, dir, name) {
  if (!FILE.test(name) || !name.endsWith(".png")) fail(where, `${name} must be a lowercase .png file name in the app folder`);
  const path = join(dir, name);
  if (!existsSync(path)) fail(where, `${name} is missing`);
  const bytes = readFileSync(path);
  if (!bytes.subarray(0, 8).equals(PNG)) fail(where, `${name} is not a PNG`);
  try {
    if (raster(bytes).length !== rasterBytes(bytes)) throw new Error("image data does not fill the image");
    Decoder.sync.read(bytes);
  } catch (error) {
    fail(where, `${name} does not decode: ${error.message}`);
  }
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
  if (typeof app.category !== "string" || !Object.hasOwn(CATEGORIES, app.category)) fail(where, `category must be one of ${Object.keys(CATEGORIES).join(", ")}`);
  if (!Array.isArray(app.platforms) || !app.platforms.length) fail(where, "platforms must be a non-empty list");
  for (const p of app.platforms) if (!PLATFORMS.includes(p)) fail(where, `unknown platform ${p}; use ${PLATFORMS.join(", ")}`);
  if (new Set(app.platforms).size !== app.platforms.length) fail(where, "platforms repeat");
  address(where, app.website, "website");
  address(where, app.source, "source");
  if (app.source && ["github.com", "www.github.com"].includes(new URL(app.source).hostname) && !github(app.source)) fail(where, `a GitHub source is https://github.com/owner/repo: ${app.source}`);
  if (app.website === null && app.source === null) fail(where, "website or source is required");
  if (!Array.isArray(app.previews) || !app.previews.length) fail(where, "previews must be a non-empty list");
  if (new Set(app.previews).size !== app.previews.length) fail(where, "previews repeat");
  for (const name of app.previews) png(where, dir, name);
  if ("building" in app && typeof app.building !== "boolean") fail(where, "building must be true or false");
  for (const key of ["publishedAt", "starsUpdatedAt"]) if (key in app && !time(app[key])) fail(where, `${key} must be an ISO 8601 time with its zone`);
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
  if (ENTITY.test(markdown)) fail(where, `write characters as they are, not as references: ${markdown.match(ENTITY)[0]}`);
  for (const url of markdown.replaceAll("\\", "").match(URLISH) ?? []) if (!links.some((l) => url.startsWith(l) && /^[.,;:!?*_~)]*$/.test(url.slice(l.length)))) fail(where, `addresses go only to the website or source: ${url}`);
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
    if (!lstatSync(dir).isDirectory()) fail(`apps/${entry}`, "only app folders belong in apps/, and no links");
    if (!ID.test(entry)) fail(`apps/${entry}`, "folder names are lowercase kebab-case");
    for (const file of readdirSync(dir)) {
      if (!["manifest.json", "README.md"].includes(file) && !FILE.test(file)) fail(`apps/${entry}/${file}`, "file names are lowercase");
      if (!lstatSync(join(dir, file)).isFile()) fail(`apps/${entry}/${file}`, "only plain files belong in an app folder");
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

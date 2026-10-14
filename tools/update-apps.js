/* Discover the owner's GitHub Pages apps and write apps.json for the launcher.
 *
 * Run by the scheduled workflow (tools + node 20), or locally:
 *   GITHUB_OWNER=<you> [GITHUB_TOKEN=<pat>] node tools/update-apps.js
 *
 * For every public, non-fork repo:
 *   - probe https://<owner>.github.io/<repo>/        (root repo variant too)
 *   - keep it if the site responds 200
 *   - scrape its <title>, description meta and a PWA icon
 * Result: sorted apps.json + summary on stdout.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const OWNER = (process.env.GITHUB_OWNER || process.argv[2] || "").trim();
const TOKEN = (process.env.GITHUB_TOKEN || "").trim();
const SELF_REPO = (process.env.GITHUB_REPOSITORY || "").split("/")[1] || "";
const INCLUDE_FORKS = process.env.INCLUDE_FORKS === "1";
const OUT = path.join(__dirname, "..", "apps.json");

const API = "https://api.github.com";
const MAX_PAGES = 3; // up to 300 repositories

function ghHeaders() {
  const h = {
    "User-Agent": "app-launcher-generator",
    Accept: "application/vnd.github+json",
  };
  if (TOKEN) h.Authorization = `Bearer ${TOKEN}`;
  return h;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: ghHeaders() });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${url} -> ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function fetchText(url, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "app-launcher-generator" },
    });
    if (!res.ok) return null;
    return { status: res.status, text: await res.text(), finalUrl: res.url };
  } catch {
    return null; // offline site, timeout, DNS miss — not an app
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Parsing helpers (exported for tests) ----------
function collapse(s) {
  return String(s)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pageTitle(html) {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m ? collapse(m[1]) : null;
}

// Site titles often read "Cayman theme | Cayman is a theme for …" —
// for the card, prefer the short part before the separator.
function displayName(rawTitle) {
  const raw = collapse(rawTitle || "");
  const parts = raw.split(/\s+[|\u00b7\u2022\u2013\u2014]\s+/);
  if (parts.length > 1) {
    const first = parts[0].trim();
    if (first.length >= 2) return first;
  }
  return raw;
}

function metaContent(html, key) {
  // Handles both attribute orders: content-first and name/property-first.
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`,
      "i"
    ),
  ];
  for (const re of patterns) {
    const m = re.exec(html);
    if (m && m[1] && collapse(m[1])) return collapse(m[1]);
  }
  return null;
}

function linkRelHrefs(html, relWanted) {
  const out = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
    const rel = /rel=["']([^"']*)["']/i.exec(tag);
    const href = /href=["']([^"']*)["']/i.exec(tag);
    if (!rel || !href) continue;
    if (rel[1].toLowerCase().split(/\s+/).includes(relWanted)) out.push(href[1]);
  }
  return out;
}

function absolute(base, ref) {
  try {
    return new URL(ref, base).href;
  } catch {
    return null;
  }
}

function iconHrefFromHtml(html, pageUrl) {
  const apple = linkRelHrefs(html, "apple-touch-icon");
  const icon = linkRelHrefs(html, "icon");
  const href = apple[0] || icon[0];
  return href ? absolute(pageUrl, href) : null;
}

async function iconFromManifest(html, pageUrl) {
  const manifestLink = linkRelHrefs(html, "manifest")[0];
  if (!manifestLink) return null;
  const manifestUrl = absolute(pageUrl, manifestLink);
  if (!manifestUrl) return null;
  const res = await fetchText(manifestUrl);
  if (!res) return null;
  let manifest;
  try {
    manifest = JSON.parse(res.text);
  } catch {
    return null;
  }
  const candidates = (manifest.icons || [])
    .map((i) => ({ src: i.src, size: parseInt((i.sizes || "").split(" ")[0], 10) || 0, purpose: i.purpose || "any" }))
    .filter((i) => i.src && i.size >= 192)
    .sort((a, b) => ((b.purpose.includes("any") ? 1000 : 0) + b.size) - ((a.purpose.includes("any") ? 1000 : 0) + a.size));
  return candidates.length ? absolute(manifestUrl, candidates[0].src) : null;
}

async function probeIcon(url) {
  // Verify the icon URL actually resolves and looks like an image.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, method: "HEAD" });
    return res.ok && /image\//.test(res.headers.get("content-type") || "") ? url : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  collapse,
  pageTitle,
  displayName,
  metaContent,
  linkRelHrefs,
  absolute,
  iconHrefFromHtml,
};

// ---------- Main ----------
async function listRepos(owner) {
  // /users/<x>/repos works for users and most orgs; fall back to /orgs/.
  const collect = async (base) => {
    const all = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const batch = await fetchJson(`${base}?per_page=100&page=${page}`);
      all.push(...batch);
      if (batch.length < 100) break;
    }
    return all;
  };
  try {
    return await collect(`${API}/users/${encodeURIComponent(owner)}/repos`);
  } catch (err) {
    if (String(err).includes("-> 404")) {
      return await collect(`${API}/orgs/${encodeURIComponent(owner)}/repos`);
    }
    throw err;
  }
}

async function main() {
  if (!OWNER) {
    console.error("GITHUB_OWNER is not set (or pass it as argv[2]).");
    process.exit(1);
  }

  const ownerLc = OWNER.toLowerCase();
  console.log(`Listing repositories for ${OWNER}…`);
  const repos = await listRepos(OWNER);

  const candidates = repos
    .filter((r) => r.owner && r.owner.login.toLowerCase() === ownerLc) // own repos only
    .filter((r) => INCLUDE_FORKS || !r.fork)
    .filter((r) => r.name.toLowerCase() !== ownerLc) // <owner>/<owner> profile-README repo: no site
    .filter((r) => !SELF_REPO || r.name !== SELF_REPO); // the launcher never lists itself

  console.log(`${repos.length} repo(s), ${candidates.length} candidate(s) — probing Pages URLs…`);

  const hostPrefix = `https://${ownerLc}.github.io/`;
  const apps = [];
  for (const r of candidates) {
    const pageUrl =
      r.name.toLowerCase() === `${ownerLc}.github.io`
        ? hostPrefix
        : `${hostPrefix}${r.name}/`;

    const probe = await fetchText(pageUrl);
    // Accept only sites that are still hosted on the owner's github.io —
    // some hosts redirect github.io subpaths to unrelated pages.
    if (!probe || !probe.finalUrl || !probe.finalUrl.startsWith(hostPrefix)) continue;
    const url = probe.finalUrl === pageUrl ? pageUrl : probe.finalUrl;

    const html = probe.text || "";
    const title = displayName(pageTitle(html) || r.name).slice(0, 60);
    const description = (
      metaContent(html, "og:description") ||
      metaContent(html, "description") ||
      r.description ||
      ""
    ).slice(0, 140);

    let icon = iconHrefFromHtml(html, pageUrl);
    if (icon) icon = await probeIcon(icon);
    if (!icon) icon = await iconFromManifest(html, pageUrl);
    if (icon) icon = await probeIcon(icon);
    icon = icon || "";

    apps.push({ name: r.name, title, description, url, icon });
    console.log(`  ✓ ${r.name} → ${title}`);
  }

  apps.sort((a, b) => a.title.localeCompare(b.title));
  const payload = { generatedAt: new Date().toISOString(), owner: OWNER, apps };
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2) + "\n");
  console.log(`Wrote apps.json with ${apps.length} app(s).`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

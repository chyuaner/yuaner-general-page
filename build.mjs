/**
 * build.mjs — Pure Node.js static site builder
 *
 * Pipeline per page (.md in src/pages/):
 *   1. Parse frontmatter + markdown body   (gray-matter + marked)
 *   2. Compile shared SCSS                 (sass)
 *   3. Merge per-page SCSS if exists       (src/pages/<slug>.scss)
 *   4. Inline favicon SVG as data URI      (from src/assets/favicon.svg)
 *   5. Apply layout template               (src/layouts/<layout>.html)
 *   6. Inline <img> tags → base64 / SVG   (regex + fs)
 *   7. Write dist/<slug>.html              (single self-contained file)
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { marked } from 'marked';
import * as sass from 'sass';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC       = path.join(__dirname, 'src');
const DIST      = path.join(__dirname, 'dist');
const PAGES_DIR = path.join(SRC, 'pages');
const LAYOUTS   = path.join(SRC, 'layouts');
const STYLES    = path.join(SRC, 'styles');
const PUBLIC    = path.join(__dirname, 'public');

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Compile a SCSS file to CSS string. Returns '' if file not found. */
async function compileScss(filePath) {
  try {
    const result = sass.compile(filePath, { style: 'compressed' });
    return result.css;
  } catch {
    return '';
  }
}

/** Read a file, return null if missing. */
async function tryRead(filePath, encoding = 'utf-8') {
  try { return await fs.readFile(filePath, encoding); }
  catch { return null; }
}

/** Convert a local file to base64 data URI. Returns null for SVG (inline instead). */
async function fileToDataUri(filePath) {
  const ext = path.extname(filePath).toLowerCase().slice(1);
  if (ext === 'svg') return null; // handled separately
  const mimeMap = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', ico: 'image/x-icon', avif: 'image/avif',
  };
  const mime = mimeMap[ext] || `image/${ext}`;
  try {
    const data = await fs.readFile(filePath);
    return `data:${mime};base64,${data.toString('base64')}`;
  } catch { return null; }
}

/**
 * Inline all <img src="..."> tags in HTML.
 * - SVG src  → entire <img> replaced with raw <svg> markup
 * - Other    → src replaced with base64 data URI
 *
 * src paths are resolved relative to `distDir` (after build, for public assets).
 * We resolve against PUBLIC dir here since images come from public/.
 */
async function inlineImages(html) {
  const imgRegex = /<img\b([^>]*?)>/gi;
  const srcRegex = /\bsrc=["']([^"']+)["']/i;

  const matches = [];
  let m;
  while ((m = imgRegex.exec(html)) !== null) {
    matches.push({ full: m[0], attrs: m[1], index: m.index });
  }

  const results = await Promise.all(matches.map(async ({ attrs }) => {
    const srcMatch = srcRegex.exec(attrs);
    if (!srcMatch) return { type: 'skip' };
    const src = srcMatch[1];
    if (src.startsWith('data:') || /^https?:\/\//.test(src)) return { type: 'skip' };

    const filePath = path.join(PUBLIC, src.replace(/^\//, ''));
    const ext = path.extname(src).toLowerCase().slice(1);

    if (ext === 'svg') {
      const svgContent = await tryRead(filePath);
      return { type: 'svg', src, svgContent };
    }
    const dataUri = await fileToDataUri(filePath);
    return { type: 'img', src, dataUri };
  }));

  let out = html;
  for (let i = matches.length - 1; i >= 0; i--) {
    const { full, index } = matches[i];
    const r = results[i];
    if (r.type === 'skip') continue;
    if (r.type === 'svg' && r.svgContent) {
      out = out.slice(0, index) + r.svgContent.trim() + out.slice(index + full.length);
    } else if (r.type === 'img' && r.dataUri) {
      const newTag = full.replace(srcRegex, `src="${r.dataUri}"`);
      out = out.slice(0, index) + newTag + out.slice(index + full.length);
    }
  }
  return out;
}

/** Build a favicon data URI from public/favicon.svg (inline SVG data URI). */
async function buildFaviconDataUri() {
  const svgPath = path.join(PUBLIC, 'favicon.svg');
  const svg = await tryRead(svgPath);
  if (!svg) return '';
  // Encode SVG as a data URI (URL-encoded is more compatible than base64 for SVG)
  const encoded = svg
    .replace(/\n/g, ' ')
    .replace(/"/g, "'")
    .replace(/#/g, '%23')
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E');
  return `data:image/svg+xml,${encoded}`;
}

// ─── Core Build ─────────────────────────────────────────────────────────────

async function buildPage(mdFile, sharedCss, faviconDataUri) {
  const slug = path.basename(mdFile, '.md');
  const raw  = await fs.readFile(mdFile, 'utf-8');

  // 1. Parse frontmatter + markdown
  const { data: fm, content: mdBody } = matter(raw);
  const bodyHtml = marked.parse(mdBody);

  // 2. Shared CSS + optional per-page SCSS
  const pageScssPath = path.join(PAGES_DIR, `${slug}.scss`);
  const pageScss     = await compileScss(pageScssPath); // '' if missing
  const allCss       = sharedCss + (pageScss ? '\n' + pageScss : '');

  // 3. Load layout template
  const layoutName = (fm.layout || 'default').replace(/\.html$/, '');
  const layoutFile = path.join(LAYOUTS, `${layoutName}.html`);
  let template     = await tryRead(layoutFile);
  if (!template) {
    console.error(`[build] Layout not found: ${layoutFile}`);
    process.exit(1);
  }

  // 4. Substitute placeholders
  let html = template
    .replace('{{title}}',   fm.title || slug)
    .replace('{{lang}}',    fm.lang  || 'zh-tw')
    .replace('{{favicon}}', faviconDataUri)
    .replace('{{styles}}',  allCss)
    .replace('{{content}}', bodyHtml);

  // 5. Inline <img> tags
  html = await inlineImages(html);

  // 6. Write output
  const outPath = path.join(DIST, `${slug}.html`);
  await fs.writeFile(outPath, html, 'utf-8');
  console.log(`[build] ✓ dist/${slug}.html`);
}

export async function buildAll() {
  await fs.mkdir(DIST, { recursive: true });

  // Pre-compile shared SCSS once
  const sharedScssPath = path.join(STYLES, 'shared.scss');
  const sharedCss      = await compileScss(sharedScssPath);

  // Pre-build favicon data URI once
  const faviconDataUri = await buildFaviconDataUri();

  // Find all .md pages
  const entries = await fs.readdir(PAGES_DIR);
  const mdFiles = entries
    .filter(f => f.endsWith('.md'))
    .map(f => path.join(PAGES_DIR, f));

  if (mdFiles.length === 0) {
    console.warn('[build] No .md files found in src/pages/');
    return;
  }

  await Promise.all(mdFiles.map(f => buildPage(f, sharedCss, faviconDataUri)));
  console.log(`[build] Done — ${mdFiles.length} page(s) built.`);
}

// Run directly: node build.mjs
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  buildAll().catch(err => { console.error(err); process.exit(1); });
}

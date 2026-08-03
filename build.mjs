/**
 * build.mjs — Pure Node.js static site builder with Eta Template Engine & Minifier
 *
 * Pipeline per page (.md in src/pages/):
 *   1. Parse frontmatter + markdown body   (gray-matter + marked)
 *   2. Compile shared SCSS                 (sass)
 *   3. Merge per-page SCSS if exists       (src/pages/<slug>.scss)
 *   4. Render layout via Eta template      (Eta with if/include support)
 *   5. Minify HTML (single-line output)    (html-minifier-terser)
 *   6. Write dist/<slug>.html              (single self-contained minified file)
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { marked } from 'marked';
import * as sass from 'sass';
import { Eta } from 'eta';
import { minify } from 'html-minifier-terser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC       = path.join(__dirname, 'src');
const DIST      = path.join(__dirname, 'dist');
const PAGES_DIR = path.join(SRC, 'pages');
const STYLES    = path.join(SRC, 'styles');

// Initialize Eta Engine targeting src directory for includes
const eta = new Eta({ views: SRC, cache: false });

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

// ─── Core Build ─────────────────────────────────────────────────────────────

async function buildPage(mdFile, sharedCss) {
  const slug = path.basename(mdFile, '.md');
  const raw  = await fs.readFile(mdFile, 'utf-8');

  // 1. Parse frontmatter + markdown
  const { data: fm, content: mdBody } = matter(raw);
  const bodyHtml = marked.parse(mdBody);

  // 2. Shared CSS + optional per-page SCSS
  const pageScssPath = path.join(PAGES_DIR, `${slug}.scss`);
  const pageScss     = await compileScss(pageScssPath);
  const allCss       = sharedCss + (pageScss ? '\n' + pageScss : '');

  // 3. Render Layout Template via Eta
  const layoutName = (fm.layout || 'default').replace(/\.html$/, '');
  const relativeLayoutPath = `layouts/${layoutName}.html`;

  const templateData = {
    ...fm,
    title: fm.title || slug,
    lang: fm.lang || 'zh-tw',
    styles: allCss,
    content: bodyHtml,
  };

  const html = await eta.renderAsync(relativeLayoutPath, templateData);

  // 4. Minify HTML to single line for direct Nginx config use
  const minifiedHtml = await minify(html, {
    collapseWhitespace: true,
    removeComments: true,
    minifyCSS: true,
    removeRedundantAttributes: true,
    removeEmptyAttributes: true,
  });

  // 5. Write output
  const outPath = path.join(DIST, `${slug}.html`);
  await fs.writeFile(outPath, minifiedHtml, 'utf-8');
  console.log(`[build] ✓ dist/${slug}.html (minified)`);
}

export async function buildAll() {
  await fs.mkdir(DIST, { recursive: true });

  const sharedScssPath = path.join(STYLES, 'shared.scss');
  const sharedCss      = await compileScss(sharedScssPath);

  const entries = await fs.readdir(PAGES_DIR);
  const mdFiles = entries
    .filter(f => f.endsWith('.md'))
    .map(f => path.join(PAGES_DIR, f));

  if (mdFiles.length === 0) {
    console.warn('[build] No .md files found in src/pages/');
    return;
  }

  await Promise.all(mdFiles.map(f => buildPage(f, sharedCss)));
  console.log(`[build] Done — ${mdFiles.length} page(s) built.`);
}

// Run directly: node build.mjs
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  buildAll().catch(err => { console.error(err); process.exit(1); });
}

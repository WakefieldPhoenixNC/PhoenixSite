/* Builds the published site into _site/. Netlify runs this on every deploy
   (see netlify.toml), including every time the CMS saves a change.

   It copies the site across, then writes the CMS content straight into each
   page, using the same contentFills() in js/main.js that the browser would
   otherwise run after the page opened. Visitors get finished pages: nothing
   pops in, flashes or jumps, and the content is there for search engines
   and with JavaScript off. Each senior team also gets its own finished
   players page at /players/<team>.html.

   Plain Node, nothing to install. A data file with a mistake in it stops
   the build, and Netlify then keeps the last good version of the site live
   instead of publishing a broken one.

   serve.bat runs this before previewing. To run it on its own:
     node build.js */

const fs = require('fs');
const path = require('path');
const { contentFills, escapeHtml, slugify, DATA_FILES } = require('./js/main.js');

const OUT = '_site';

// On Netlify, photos from the CMS are served through Netlify's image
// resizing, at about twice the size they're shown, so full-size phone photos
// still load quickly and the originals stay untouched. A local build keeps
// the original files, because the resizing only exists on Netlify.
const ON_NETLIFY = process.env.NETLIFY === 'true';
const imageUrl = (src, width) => (ON_NETLIFY && /^\/images\/.+\.(jpe?g|png|webp|gif|avif)$/i.test(src)
  ? `/.netlify/images?url=${encodeURIComponent(src)}&w=${width}`
  : src);

// Files in the repo that aren't part of the website. Everything else is
// published as it is.
const NOT_PUBLISHED = new Set([
  '.git', '.gitignore', '.gitattributes', '.claude', 'node_modules', OUT,
  'guide', 'build.js', 'serve.bat', 'README.md', 'netlify.toml'
]);

const data = {};
for (const [key, file] of Object.entries(DATA_FILES)) {
  data[key] = JSON.parse(fs.readFileSync(file.slice(1), 'utf8'));
}

function setAttr(tag, name, value) {
  const attr = `${name}="${escapeHtml(value)}"`;
  const existing = new RegExp(`\\s${name}="[^"]*"`);
  return existing.test(tag) ? tag.replace(existing, () => ` ${attr}`) : tag.replace(/>$/, () => ` ${attr}>`);
}

function setHidden(tag, hidden) {
  const without = tag.replace(/\shidden(="[^"]*")?(?=[\s>])/, '');
  return hidden ? without.replace(/>$/, ' hidden>') : without;
}

// The HTML version of applyFills() in main.js. Elements are found by their
// opening tag. Replacing an element's contents runs to the next closing tag
// of the same type, which is safe because nothing the content goes into
// holds another element of its own type (a grid <div> holds only a
// "Loading" <p>, a text <p> holds only text).
function applyFillsToHtml(html, fills) {
  for (const f of fills) {
    if (f.title) {
      html = html.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${escapeHtml(f.title)}</title>`);
      continue;
    }
    const target = f.id ? `\\bid="${f.id}"` : `\\bclass="(?:[^"]*\\s)?${f.cls}(?:\\s[^"]*)?"`;
    const editTag = tag => {
      if (f.attrs) Object.entries(f.attrs).forEach(([name, value]) => { tag = setAttr(tag, name, value); });
      if ('hidden' in f) tag = setHidden(tag, f.hidden);
      return tag;
    };
    const inner = 'html' in f ? f.html : 'text' in f ? escapeHtml(f.text) : null;
    if (inner === null) {
      html = html.replace(new RegExp(`<[a-z][a-z0-9]*\\b[^>]*${target}[^>]*>`, 'g'), editTag);
    } else {
      html = html.replace(
        new RegExp(`(<([a-z][a-z0-9]*)\\b[^>]*${target}[^>]*>)[\\s\\S]*?(</\\2>)`, 'g'),
        (whole, open, tagName, close) => editTag(open) + inner + close
      );
    }
  }
  return html;
}

function buildPage(html, options = {}) {
  const fills = contentFills(data, {
    has: id => html.includes(`id="${id}"`),
    playersHref: slug => `/players/${slug}.html`,
    imageUrl,
    ...options
  });
  // data-built tells main.js the content is already in the page.
  return applyFillsToHtml(html, fills).replace(/<html\b([^>]*)>/, (tag, attrs) => `<html${attrs} data-built>`);
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT);
for (const name of fs.readdirSync('.')) {
  if (NOT_PUBLISHED.has(name) || name.startsWith('brag-output')) continue;
  fs.cpSync(name, path.join(OUT, name), { recursive: true });
}

// players.html itself is left as it is: it still fills itself in from
// ?team=..., so any old link to it keeps working.
const pages = fs.readdirSync('.').filter(name => name.endsWith('.html') && name !== 'players.html');
for (const name of pages) {
  fs.writeFileSync(path.join(OUT, name), buildPage(fs.readFileSync(name, 'utf8')));
}

const playersPage = fs.readFileSync('players.html', 'utf8');
const teamSlugs = (data.teams.teams || []).map(t => slugify(t.name)).filter(Boolean);
fs.mkdirSync(path.join(OUT, 'players'));
for (const slug of teamSlugs) {
  fs.writeFileSync(path.join(OUT, 'players', `${slug}.html`), buildPage(playersPage, { teamSlug: slug }));
}

console.log(`Built ${pages.length} pages and ${teamSlugs.length} team pages into ${OUT}/`);

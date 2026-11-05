# Wakefield Phoenix Netball Club — website

A static website with a built-in editor (Decap CMS) so committee members can
keep teams, players, and committee info up to date themselves, year to year,
with no code and no developer needed for routine updates.

**Stack:** plain HTML/CSS/JS. No framework, no build step, no npm install.
Any file here can be opened and edited directly in a text editor. Content
that changes often lives in JSON files that both the CMS and the page
JavaScript read — see "How content flows" below.

## Pages

| File | What it is |
|---|---|
| `index.html` | Home page — hero, about section, results/social callouts |
| `teams.html` | Senior/Junior team listings, with a tab toggle between them |
| `players.html` | One page for every senior team's player roster — reads `?team=<slug>` from the URL (e.g. `players.html?team=1st-team`), no separate file per team |
| `committee.html` | Committee member listing |
| `contact.html` | General enquiry form + a prominent "Enquire to Join" callout + social links |
| `admin/index.html` | The CMS itself — visit `yoursite.com/admin` |

## How content flows

Two separate places hold text/data, on purpose, with a clear line between them:

- **`data/*.json` — CMS-managed.** Anything a committee member might realistically
  need to change: `teams.json` (senior teams, including each team's player
  roster nested inside it), `junior-teams.json`, `committee.json`,
  `site-links.json` (logo + club email + social/results/join-form links). Edited via
  `/admin`, which commits straight to GitHub through Netlify Identity + Git
  Gateway — nobody touches code for these.
- **`config/site-content.json` — dev-only, not in the CMS at all.** Page
  taglines, headings, and paragraph copy (homepage hero text, the "about"
  paragraph, page intros). This was deliberately kept out of the CMS —
  giving a volunteer committee a text field for every heading on the site
  is more surface area for something to look wrong than it's worth for
  copy that changes rarely. Edit this file directly when the wording needs
  to change. Any `{{team_count}}` inside a string is swapped automatically
  for the live number of senior teams, spelled out as a word ("four", not
  "4") — see `replaceTeamCount()` in `js/main.js`.

When Netlify publishes the site it runs `build.js`, which writes all of this
content straight into each page and puts the finished site in `_site/`. So
visitors get complete pages: nothing pops in or jumps after a page opens, and
the content is there for search engines too. Each senior team also gets its
own finished players page, `/players/<team>.html`.

The content code itself lives in `js/main.js` (`contentFills()`), and
`build.js` borrows it, so there's only one copy. If a page is opened without
being built (the raw files), `main.js` fetches the JSON and fills the page in
the browser instead, so nothing breaks either way. `bibCard()` in that file
is the one shared component behind every team/committee/player/kit card.

A data file with a mistake in it stops the build, and Netlify then keeps the
last good version of the site live rather than publishing a broken one. The
deploy log in Netlify shows the error.

## Other folders

```
css/style.css      All layout/visual styling
css/theme.css       Just the four brand colours — change the whole site's
                     palette here without touching style.css
admin/config.yml    Defines every CMS field committee members see
images/logo.png     Club crest, used in the header and favicon
images/hero-*.png   Homepage banner, exported from the club designer's
                     layered 6000 x 1875 artwork: hero-bg (background,
                     screens 1200px+ only) and hero-lockup (crest + both
                     wordmarks). The tagline and buttons are live HTML.
images/uploads/     Where CMS-uploaded photos land automatically
build.js            Writes the CMS content into the pages (see above)
netlify.toml        Build settings + response headers
sitemap.xml         robots.txt        Basic SEO — see below
```

## Previewing changes locally

Needs Node (for `build.js`) and Python's built-in web server, both already
on this machine. Easiest: double-click `serve.bat` in the project folder. It
builds the site exactly as Netlify would, serves it, and opens the browser.
After changing anything (code, or content in the local CMS), close it and
double-click it again to see the change.

It also starts Decap's local CMS server in a second window, so the CMS works
locally too: open `http://localhost:8080/admin/` and you're straight in, no
login. Edits save directly into the files in this folder (not to GitHub), so
it's a safe way to try CMS changes before pushing. This relies on
`local_backend: true` in `admin/config.yml`, which only applies on
localhost; the live site ignores it.

Or from a terminal, **inside the project folder**:

```
node build.js
python -m http.server 8080 --bind localhost --directory _site
```

(`--bind localhost` keeps it private to this computer; without it, anyone on
the same Wi-Fi can browse the folder while it runs. Use `localhost`, not
`127.0.0.1`: with the latter, every file waits 0.3s while the browser tries
IPv6 first, and pages visibly load in stages.)

Then open `http://localhost:8080/index.html` in a browser. This shows exactly
what's on disk, including anything not yet pushed to GitHub — useful for
checking a change before it goes live. Stop it with Ctrl+C.

If `python` isn't recognised in PowerShell, it's almost always Windows'
built-in placeholder stub getting found first: **Settings → Apps → Advanced
app settings → App execution aliases** → turn off the two `python.exe` /
`python3.exe` entries (they'll be listed under "App Installer"), then reopen
the terminal.

**Cache gotcha worth knowing:** every page loads CSS/JS with a version tag —
`style.css?v=12`, `main.js?v=12`, etc. Browsers cache these aggressively by
exact URL, so after editing `css/style.css` or `js/main.js`, bump that number
(all occurrences, across all 5 HTML files) or a browser that's already
visited the site may keep showing the old version indefinitely, even after a
hard refresh.

## Hosting and deployment

Netlify, auto-deploying from GitHub's `main` branch — push a commit, the live
site updates within about a minute. Netlify runs `node build.js` and publishes
`_site/` (both set in `netlify.toml`); there's nothing to install. The CMS's Netlify Identity +
Git Gateway login is already configured, invite-only — new committee editors
are added via the Netlify dashboard → **Identity → Invite users**.

**Free tier credits:** Netlify's free plan has 300 credits a month, a hard
limit that resets each billing cycle. A production deploy (every CMS Publish
or push) costs 15, and bandwidth and requests use the rest. When the credits
run out, deploys stop but the site stays online ("running on operational
credits"); Netlify's docs say that if the balance is used up completely, the
site shows "Site not available" and forms stop until the next cycle. The free
plan can't buy more credits, only upgrade.

**Photos:** on Netlify, `build.js` serves every CMS photo through Netlify's
image resizing (`/.netlify/images?url=...&w=...`) at about twice its size on
the page, so full-size phone photos are fine to upload and the originals stay
untouched in `images/uploads`. Local previews use the original files.

**Domain:** the free `*.netlify.app` address works indefinitely. A custom
domain (e.g. `wakefieldphoenixnetball.co.uk`, roughly £8–15/year) is
entirely optional — add it under **Site configuration → Domain management**
in Netlify if the club ever wants one, registered under a club email/payment
method rather than a personal one.

**Upgrading the CMS:** `admin/index.html` loads Decap CMS at one exact version
with an `integrity` fingerprint, so the browser refuses to run anything but
that exact file. To upgrade, change the version number in the URL, paste the
new URL into [srihash.org](https://www.srihash.org/) and replace the
`integrity` value with the one it gives you. Then check `/admin` still loads
before relying on it.

## SEO

Already in place: per-page `<title>`/meta descriptions, `SportsClub`
structured data on the homepage (`index.html`'s `<script type="application/
ld+json">`), `sitemap.xml`, `robots.txt`. Two things worth knowing:

- The `sitemap.xml` deliberately does **not** list `players.html` yet —
  its content is currently all placeholder ("Jane Doe" × 7 per team), and
  submitting placeholder pages for indexing is worse than not listing them
  at all. Once real rosters go in, add the real team URLs (e.g.
  `players.html?team=1st-team`) to the sitemap.
- Code-level SEO has a ceiling. For a local search like "Wakefield netball
  club" to genuinely rank well, the two highest-leverage things are outside
  this codebase entirely: a free **Google Business Profile**
  (business.google.com) and **Google Search Console** (submit the sitemap,
  request indexing) — both need to be set up by whoever owns the club's
  Google account, not something committable in code.

## The committee's own guide

`Wakefield-Phoenix-Website-Guide.docx` (handed over alongside this repo, not
in it) is the plain-English version of all this for non-technical committee
members — logins, how to use the CMS, what "credits" means, who to contact
if something goes wrong. This README is the technical reference; that
document is the one to actually give to whoever's updating team rosters
each season.

## Current state

Every piece of content is real and CMS-editable, but the actual data is
still placeholder — every player is "Person Name," team/committee descriptions
say "EDIT IN CMS," most photos are unset. That's expected; it's ready for
real content to go in via `/admin` whenever the club's ready, not something
that needs a developer.

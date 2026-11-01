/* Wakefield Phoenix Netball Club: site behaviour.

   Page content comes from the JSON files the CMS at /admin edits (data/*.json)
   and from config/site-content.json, a code-only file of page copy with no
   CMS wiring. contentFills() below turns all of it into a list of "fills":
   this HTML goes in that element, this link goes on that button, this
   section shows or hides. The same list is used in two places:

   - build.js, when Netlify publishes the site, writes the fills straight
     into every page, so visitors get finished pages and nothing pops in or
     jumps after a page opens.
   - This file, on a page that hasn't been built (previewing the raw files),
     fetches the JSON and applies the same fills in the browser. See
     renderContent() near the bottom.

   The rest of the file is page behaviour: tabs, menus, forms, animations. */

async function loadJSON(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error('Could not load ' + path);
  return res.json();
}

// CMS text gets placed inside HTML strings below, so characters that mean
// something in HTML are turned into plain text first. Without this, a stray
// "<" in a bio would break its card, and a deliberate one could run a script
// on the site.
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// Links typed into the CMS may only become web, email or phone links (or a
// page on this site). A "javascript:" link would run code when clicked, so
// anything else becomes a link that goes nowhere. build.js has no page
// address to resolve a relative link against, so any web address stands in.
function safeUrl(url) {
  try {
    const base = typeof location === 'undefined' ? 'https://example.org/' : location.href;
    const { protocol } = new URL(url, base);
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(protocol) ? url : '#';
  } catch (e) {
    return '#';
  }
}

// Spells out {{team_count}} as a word ("four" rather than "4"), capitalised only
// when the token opens the string or follows sentence-ending punctuation, lowercase
// mid-sentence. Falls back to the numeral itself past ten, since ten is the most
// teams the club expects to ever field at once.
const TEAM_COUNT_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
function replaceTeamCount(text, count) {
  const word = (Number.isInteger(count) && count >= 0 && count < TEAM_COUNT_WORDS.length)
    ? TEAM_COUNT_WORDS[count]
    : String(count ?? '');
  return text.replace(/\{\{\s*team_count\s*\}\}/gi, (match, offset, full) => {
    const before = full.slice(0, offset).trimEnd();
    const startOfSentence = before.length === 0 || /[.!?]$/.test(before);
    return startOfSentence ? word.charAt(0).toUpperCase() + word.slice(1) : word;
  });
}

// Turns a name into a stable, URL-safe id ("1st Team" -> "1st-team"), used to
// link a team card through to its own players page and to look it back up
// there (see teamDetailFills()). Both sides always compute it the same way,
// so there's no separate "slug" field for anyone to fill in or get wrong.
function slugify(text) {
  return String(text).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const note = text => `<p class="loading-note">${text}</p>`;

// ---------- Sponsors ----------

// Sponsorship tiers, biggest first. This order is the order the footer rows
// appear in, and each tier gets its own logo size (see .sponsor-row--* in the
// CSS), so a £500 club sponsor is visibly bigger than a £100 individual one.
const SPONSOR_TIERS = ['club', 'team', 'individual'];

const SPONSOR_TIER_HEADINGS = {
  club: 'Club sponsors',
  team: 'Team sponsors',
  individual: 'Player sponsors'
};

// A sponsor with no tier set falls back to the smallest size rather than the
// biggest, so a half-filled CMS entry can't accidentally get top billing.
function sponsorTier(s) {
  return SPONSOR_TIERS.includes(s.tier) ? s.tier : 'individual';
}

// One sponsor logo tile. Ticking the "link" box without pasting a URL
// shouldn't produce a dead link, so both have to be set before the logo
// becomes clickable.
function sponsorTile(s, className = 'sponsor') {
  const img = `<img src="${escapeHtml(s.logo)}" alt="${escapeHtml(s.name || '')}" loading="lazy">`;
  return s.isLink && s.linkUrl
    ? `<a class="${className}" href="${escapeHtml(safeUrl(s.linkUrl))}" target="_blank" rel="noopener">${img}</a>`
    : `<span class="${className}">${img}</span>`;
}

// The "Sponsored by" label and logos used on team and player cards.
function sponsoredBy(sponsors) {
  return '<span class="photo-sponsor-label">Sponsored by</span>' + sponsors.map(sp => sponsorTile(sp, 'photo-sponsor-logo')).join('');
}

// Team-tier sponsors who picked this team in the CMS. Senior teams are picked
// in "Which team?" and junior teams in "Which junior team?" (the CMS dropdown
// can only read one data file, and they live in separate ones). Senior and
// junior team names never overlap ("1st Team" vs "U14"), so one name is enough
// to know which team is meant.
function sponsorTeamName(sp) {
  return sp.juniorTeam || sp.team || '';
}

function teamSponsorsFor(sponsors, teamName) {
  return sponsors.filter(sp => sponsorTier(sp) === 'team' && sponsorTeamName(sp) === teamName);
}

// Player sponsors for one team, as a map of player position in the roster to
// that player's sponsor. Matched on team AND name, so two players with the
// same name in different teams can't pick up each other's sponsor. If one
// team ever has two players with the same name, the first of them gets it,
// since the CMS dropdown can't tell them apart either.
// The club allows ONE sponsor per player. The CMS can't stop two sponsors
// picking the same player, so if that happens only the first one listed in
// the CMS shows, and the other stays in the footer like any other sponsor.
function playerSponsorMap(sponsors, teamName, players) {
  const map = new Map();
  sponsors
    .filter(sp => sponsorTier(sp) === 'individual' && sp.team === teamName && sp.player)
    .forEach(sp => {
      const i = players.findIndex(pl => pl.name === sp.player);
      if (i === -1 || map.has(i)) return;
      map.set(i, [sp]);
    });
  return map;
}

// "2 of 4 places left" on a tier card, worked out from how many sponsors in
// data/sponsors.json already have that tier, so nobody has to keep a number
// up to date by hand. A per-team limit is counted team by team, using the
// team each Team sponsor picked in the CMS.
function sponsorshipAvailability(tier, sponsors, teamNames = []) {
  const limit = Number(tier.limit);
  if (!limit || limit < 1) return '';
  if (tier.limitPerTeam) {
    if (!teamNames.length) return `Up to ${limit} per team`;
    const full = teamNames.filter(name =>
      sponsors.filter(sp => sponsorTier(sp) === tier.tier && sponsorTeamName(sp) === name).length >= limit
    ).length;
    if (full === teamNames.length) return 'Fully booked';
    if (full === 0) return `Up to ${limit} per team`;
    return `Places left on ${teamNames.length - full} of ${teamNames.length} teams`;
  }
  const taken = sponsors.filter(s => sponsorTier(s) === tier.tier).length;
  const left = limit - taken;
  return left > 0 ? `${left} of ${limit} places left` : 'Fully booked';
}

// ---------- Cards ----------

// The one card behind every team, committee, player and kit card ("bib card").
// showTag: whether the coloured bib-tag bar renders (teams drop it, as the
// division underneath already says the same thing). centered: committee and
// player cards show a bigger, centred name (and, for players, a centred bio).
// secondaryLinkUrl/Label: a second, solid-styled button after the first, used
// for the internal "Meet the Players" link, kept visually distinct from the
// first (outlined) link, which is normally an external one like the league
// table. badge/badgeVariant/badgeTitle: an armband-style marker pinned over
// the photo's top-right corner, used for Captain/Vice-Captain alongside (not
// instead of) the same abbreviation in the name. photoSponsors: a "Sponsored
// by" pill over the bottom of the photo, which is a fixed shape, so a
// sponsored card is exactly the same size as any other. cardSponsors: the
// same as a strip along the bottom, for cards with no photo (junior teams).
// Everything that can come from the CMS is escaped here. subtitleHtml is the
// one exception, for HTML this file builds itself (the kit price chips),
// never for raw CMS text.
function bibCard({ tag, showTag = true, photo, photoAlt, title, subtitle, subtitleHtml, body, linkUrl, linkLabel, secondaryLinkUrl, secondaryLinkLabel, showPhoto = true, centered = false, photoHint, badge, badgeVariant, badgeTitle, photoSponsors = [], cardSponsors = [] }) {
  const classes = (centered ? 'bib-card centered' : 'bib-card') + (badge ? ' has-badge' : '');
  const placeholder = `<div class="no-image"><span>NO IMAGE AVAILABLE</span>${photoHint ? `<span class="no-image-hint">${photoHint}</span>` : ''}</div>`;
  const badgeHtml = badge ? `<span class="player-badge ${badgeVariant}"${badgeTitle ? ` title="${badgeTitle}"` : ''}>${badge}</span>` : '';
  const pill = photoSponsors.length ? `<div class="photo-sponsor"><div class="photo-sponsor-pill">${sponsoredBy(photoSponsors)}</div></div>` : '';
  const role = subtitleHtml || escapeHtml(subtitle);
  return `<article class="${classes}">
    ${showTag ? `<div class="bib-tag">${escapeHtml(tag)}</div>` : ''}
    ${showPhoto ? `<div class="bib-photo">${badgeHtml}${photo ? `<img src="${escapeHtml(photo)}" alt="${escapeHtml(photoAlt)}" loading="lazy">` : placeholder}${pill}</div>` : ''}
    <div class="bib-body">
      <h3>${escapeHtml(title)}</h3>
      ${role ? `<span class="role">${role}</span>` : ''}
      ${body ? `<p class="bio">${escapeHtml(body)}</p>` : ''}
      ${linkUrl ? `<a class="btn card-link" href="${escapeHtml(safeUrl(linkUrl))}" target="_blank" rel="noopener">${linkLabel}</a>` : ''}
      ${secondaryLinkUrl ? `<a class="btn card-link solid" href="${escapeHtml(secondaryLinkUrl)}">${secondaryLinkLabel}</a>` : ''}
    </div>
    ${cardSponsors.length ? `<div class="card-sponsors">${sponsoredBy(cardSponsors)}</div>` : ''}
  </article>`;
}

function formatKitPrice(item) {
  const chip = text => `<span class="kit-price-chip">${escapeHtml(text)}</span>`;
  if (item.adultPrice && item.juniorPrice) return chip(`Adult ${item.adultPrice}`) + chip(`Junior ${item.juniorPrice}`);
  if (item.adultPrice) return chip(`Adult ${item.adultPrice}`);
  if (item.juniorPrice) return chip(`Junior ${item.juniorPrice}`);
  return '';
}

// ---------- Content fills, one function per part of the site ----------
// A fill targets an element by id (or every element with a class, cls) and
// sets its html, text, attributes (attrs) and/or hidden state. { title }
// sets the page title. A fill whose element isn't on the page does nothing,
// so every page can be given the whole list. A data file that failed to
// load arrives as null, and its part of the page says so.

// Page copy from config/site-content.json, keyed by the element it fills.
// {{team_count}} in any of it becomes the live number of senior teams.
const SITE_TEXT_IDS = {
  homepage: { heroTagline: 'hero-tagline', aboutHeading: 'about-heading', aboutText: 'about-text', resultsHeading: 'results-heading', resultsText: 'results-text', socialHeading: 'social-heading', socialText: 'social-text' },
  teamsPage: { eyebrow: 'teams-eyebrow', tagline: 'teams-tagline' },
  committeePage: { eyebrow: 'committee-eyebrow', tagline: 'committee-tagline' },
  contactPage: { eyebrow: 'contact-eyebrow', tagline: 'contact-tagline', queryHeading: 'query-heading', queryText: 'query-text', joinEyebrow: 'join-eyebrow', joinHeading: 'join-heading', joinText: 'join-text', socialHeading: 'find-us-heading' }
};

function siteTextFills(content, teamCount) {
  const fills = [];
  Object.entries(SITE_TEXT_IDS).forEach(([section, ids]) => {
    const settings = content[section] || {};
    Object.entries(ids).forEach(([key, id]) => {
      if (settings[key]) fills.push({ id, text: replaceTeamCount(settings[key], teamCount) });
    });
  });
  const photo = (content.homepage || {}).aboutPhoto;
  if (photo) fills.push({ id: 'about-photo', html: `<img src="${escapeHtml(photo)}" alt="" loading="lazy">`, hidden: false });
  return fills;
}

// Site-wide links and logo from data/site-links.json. Things that appear more
// than once on a page (logo, socials) are found by class, so every copy
// updates together. If the file can't load, the links already in the HTML
// stay as they are.
function siteLinkFills(links) {
  if (!links) return [];
  const fills = [];
  if (links.logo) fills.push({ cls: 'js-logo', attrs: { src: links.logo } }, { id: 'favicon', attrs: { href: links.logo } });
  if (links.email) fills.push({ cls: 'js-email-link', text: links.email, attrs: { href: safeUrl(`mailto:${links.email}`) } });
  if (links.instagramUrl) fills.push({ cls: 'js-instagram-link', attrs: { href: safeUrl(links.instagramUrl) } });
  if (links.facebookUrl) fills.push({ cls: 'js-facebook-link', attrs: { href: safeUrl(links.facebookUrl) } });
  if (links.resultsUrl) fills.push({ cls: 'js-results-link', attrs: { href: safeUrl(links.resultsUrl) } });
  if (links.joinFormUrl) fills.push({ id: 'join-form-link', attrs: { href: safeUrl(links.joinFormUrl) } });
  fills.push({ id: 'join-callout', hidden: !links.joinFormUrl });
  return fills;
}

function committeeFills(committee) {
  if (!committee) return [{ id: 'committee-grid', html: note('Committee details are being updated, check back soon.') }];
  return [{
    id: 'committee-grid',
    html: (committee.members || []).map(p => bibCard({
      tag: p.role,
      photo: p.photo,
      photoAlt: p.name,
      title: p.name,
      centered: true,
      photoHint: '900 × 1200px portrait'
    })).join('')
  }];
}

function teamsFills(teams, sponsors, playersHref) {
  if (!teams) return [{ id: 'teams-grid', html: note('Team details are being updated, check back soon.') }];
  return [{
    id: 'teams-grid',
    html: teams.map(t => bibCard({
      showTag: false,
      photo: t.photo,
      photoAlt: t.name,
      title: t.name,
      subtitle: t.division,
      body: t.description,
      linkUrl: (t.showLeagueTable && t.leagueTableUrl) ? t.leagueTableUrl : null,
      linkLabel: 'View league table',
      secondaryLinkUrl: playersHref(slugify(t.name)),
      secondaryLinkLabel: 'Meet the Players →',
      photoHint: '1600 × 900px landscape',
      photoSponsors: teamSponsorsFor(sponsors, t.name)
    })).join('')
  }];
}

function juniorTeamsFills(juniorTeams, sponsors) {
  if (!juniorTeams) return [{ id: 'junior-teams-grid', html: note('Team details are being updated, check back soon.') }];
  return [{
    id: 'junior-teams-grid',
    // Unlike senior teams, the button shows as soon as the checkbox is ticked
    // even with no URL yet (falls back to "#"). Junior teams default to the
    // checkbox already ticked, so the button is visible from the start as a
    // placeholder until a real link is added.
    html: (juniorTeams.teams || []).map(t => bibCard({
      showTag: false,
      title: t.name,
      subtitle: t.division,
      body: t.description,
      showPhoto: false,
      linkUrl: t.showLeagueTable ? (t.leagueTableUrl || '#') : null,
      linkLabel: 'View league table',
      cardSponsors: teamSponsorsFor(sponsors, t.name)
    })).join('')
  }];
}

function kitFills(kit) {
  if (!kit) return [{ id: 'kit-grid', html: note('Kit details are being updated, check back soon.') }];
  const items = kit.items || [];
  const fills = [
    {
      id: 'kit-grid',
      html: items.length ? items.map(item => bibCard({
        showTag: false,
        photo: item.photo,
        photoAlt: item.name,
        title: item.name,
        subtitleHtml: formatKitPrice(item),
        body: item.description,
        centered: true,
        photoHint: '1000 × 600px landscape'
      })).join('') : note('Kit details are being added, check back soon.')
    },
    { id: 'kit-bundle-note', text: kit.bundleNote || '', hidden: !kit.bundleNote },
    { id: 'kit-price-note', text: kit.priceNote || '', hidden: !kit.priceNote },
    { id: 'kit-order', hidden: !kit.orderFormUrl }
  ];
  if (kit.orderFormUrl) fills.push({ id: 'kit-order-link', attrs: { href: safeUrl(kit.orderFormUrl) } });
  return fills;
}

// A senior team's players page: its name, division, description, sponsors
// and full roster. Junior teams don't get one, so this only ever looks at
// teams.json.
function teamDetailFills(teams, sponsors, slug) {
  if (!teams) return [{ id: 'team-players-grid', html: note('Player details are being updated, check back soon.') }];
  const team = teams.find(t => slugify(t.name) === slug);
  if (!team) {
    return [
      { id: 'team-not-found', hidden: false },
      { id: 'team-players-section', hidden: true },
      { id: 'team-description', hidden: true }
    ];
  }

  const players = team.players || [];
  const playerSponsors = playerSponsorMap(sponsors, team.name, players);
  // This page has room, so team sponsors get a proper row of their own as
  // well as the pill on the team card back on the Teams page.
  const forTeam = teamSponsorsFor(sponsors, team.name);

  const fills = [
    { id: 'team-name', text: team.name },
    { title: `${team.name} — Wakefield Phoenix Netball Club` },
    { id: 'team-division', text: team.division || '' },
    {
      id: 'team-players-grid',
      html: players.length ? players.map((p, i) => {
        const position = (p.position || '').trim();
        const badge = p.isCaptain ? 'C' : p.isViceCaptain ? 'VC' : null;
        return bibCard({
          tag: position,
          showTag: !!position,
          photo: p.photo,
          photoAlt: p.name,
          title: p.name + (badge ? ` (${badge})` : ''),
          body: p.bio,
          centered: true,
          photoHint: '900 × 1200px portrait',
          badge,
          badgeVariant: p.isCaptain ? 'captain' : p.isViceCaptain ? 'vice-captain' : '',
          badgeTitle: p.isCaptain ? 'Captain' : p.isViceCaptain ? 'Vice-Captain' : null,
          photoSponsors: playerSponsors.get(i) || []
        });
      }).join('') : note('Player info is being added, check back soon.')
    }
  ];
  if (team.description) fills.push({ id: 'team-description', text: team.description });
  if (forTeam.length) {
    fills.push({ id: 'team-sponsors-row', html: forTeam.map(sp => sponsorTile(sp)).join('') }, { id: 'team-sponsors', hidden: false });
  }
  return fills;
}

// Sponsor logos, one row per tier, club first. On every page they go in the
// footer. On the Sponsors page they go in the "Thank you" wall instead (with
// a heading per tier), and the footer stays empty there, so that page
// doesn't show every logo twice. No sponsors means nothing shows at all.
function sponsorFills(sponsors, onWall) {
  if (!sponsors.length) return [];
  const rows = SPONSOR_TIERS.map(tier => {
    const inTier = sponsors.filter(s => sponsorTier(s) === tier);
    if (!inTier.length) return '';
    const heading = onWall ? `<h3 class="sponsor-wall-heading">${SPONSOR_TIER_HEADINGS[tier]}</h3>` : '';
    return `${heading}<div class="sponsor-row sponsor-row--${tier}">${inTier.map(s => sponsorTile(s)).join('')}</div>`;
  }).join('');
  return onWall
    ? [{ id: 'sponsor-wall', html: rows }, { id: 'sponsor-wall-section', hidden: false }]
    : [{ id: 'sponsor-strip', html: rows, hidden: false }];
}

// sponsors.html: the intro text and one card per sponsorship tier, from
// data/sponsorship.json (the "Sponsorship page" entry in the CMS). Also puts
// the same tiers, with their prices, into the enquiry form's level dropdown,
// so the chosen option doubles as confirmation of the amount ("Club (£500)").
// Team sponsorship is open to junior teams too, so both count towards places.
function sponsorshipFills(page, sponsors, teamsData, juniorData) {
  if (!page) return [{ id: 'tier-grid', html: note('Sponsorship details are being updated, check back soon.') }];
  const teamNames = [...((teamsData && teamsData.teams) || []), ...((juniorData && juniorData.teams) || [])].map(t => t.name);
  const tiers = page.tiers || [];
  let cards = '';
  let options = '<option value="">Choose a level</option>';

  tiers.forEach(t => {
    const tierKey = SPONSOR_TIERS.includes(t.tier) ? t.tier : 'individual';
    const availability = sponsorshipAvailability(t, sponsors, teamNames);
    const isFull = availability === 'Fully booked';
    // Availability and the button share a footer pinned to the bottom of the
    // card, so they line up across all three cards.
    cards += `<article class="tier-card tier-card--${tierKey}">
      <h3 class="tier-name">${escapeHtml(t.name || '')}</h3>
      <div class="tier-price">${escapeHtml(t.price || '')}</div>
      ${page.season ? `<div class="tier-season">for the ${escapeHtml(page.season)} season</div>` : ''}
      <ul class="tier-benefits">${(t.benefits || []).map(b => `<li>${escapeHtml(b)}</li>`).join('')}</ul>
      <div class="tier-foot">
        ${availability ? `<p class="tier-availability${isFull ? ' is-full' : ''}">${escapeHtml(availability)}</p>` : ''}
        ${isFull ? '' : `<button type="button" class="btn solid tier-cta" data-tier="${tierKey}">Sponsor at this level</button>`}
      </div>
    </article>`;
    const label = (t.price ? `${t.name} (${t.price})` : t.name) + (isFull ? ', fully booked' : '');
    options += `<option data-tier="${tierKey}"${isFull ? ' disabled' : ''}>${escapeHtml(label)}</option>`;
  });

  const fills = [{ id: 'tier-grid', html: cards }];
  if (page.intro) fills.push({ id: 'sponsorship-intro', text: page.intro });
  if (page.howText) fills.push({ id: 'sponsor-how-text', text: page.howText });
  if (tiers.length) fills.push({ id: 'sp-tier', html: options });
  return fills;
}

// Every data file the site's content comes from, by the name contentFills()
// knows it by.
const DATA_FILES = {
  teams: '/data/teams.json',
  juniorTeams: '/data/junior-teams.json',
  committee: '/data/committee.json',
  kit: '/data/kit.json',
  sponsors: '/data/sponsors.json',
  sponsorship: '/data/sponsorship.json',
  links: '/data/site-links.json',
  content: '/config/site-content.json'
};

// All the fills for a page. has(id) says whether the page has an element,
// teamSlug says which team a players page is for, and playersHref makes the
// link from a team card to its players page (build.js gives each team its
// own finished page; the raw files use players.html?team=...).
function contentFills(data, { has = () => false, teamSlug = '', playersHref = slug => `/players.html?team=${encodeURIComponent(slug)}` } = {}) {
  const teams = data.teams ? (data.teams.teams || []) : null;
  const sponsors = ((data.sponsors && data.sponsors.sponsors) || []).filter(sp => sp.logo);
  return [
    ...siteTextFills(data.content || {}, teams ? teams.length : null),
    ...siteLinkFills(data.links),
    ...committeeFills(data.committee),
    ...teamsFills(teams, sponsors, playersHref),
    ...juniorTeamsFills(data.juniorTeams, sponsors),
    ...kitFills(data.kit),
    ...(has('team-players-grid') ? teamDetailFills(teams, sponsors, teamSlug) : []),
    ...sponsorFills(sponsors, has('sponsor-wall')),
    ...sponsorshipFills(data.sponsorship, sponsors, data.teams, data.juniorTeams)
  ];
}

function applyFills(fills) {
  fills.forEach(f => {
    if (f.title) {
      document.title = f.title;
      return;
    }
    const els = f.id ? [document.getElementById(f.id)] : [...document.getElementsByClassName(f.cls)];
    els.forEach(el => {
      if (!el) return;
      if ('html' in f) el.innerHTML = f.html;
      if ('text' in f) el.textContent = f.text;
      if (f.attrs) Object.entries(f.attrs).forEach(([name, value]) => el.setAttribute(name, value));
      if ('hidden' in f) el.hidden = f.hidden;
    });
  });
}

// A page published through build.js already has its content (it's marked
// with data-built), so there's nothing to do. Otherwise fetch every data
// file and fill the page in here. A file that fails to load becomes null,
// and only its own part of the page shows a "being updated" note.
async function renderContent() {
  if (document.documentElement.hasAttribute('data-built')) return;
  const entries = await Promise.all(Object.entries(DATA_FILES).map(([key, path]) =>
    loadJSON(path).then(value => [key, value], () => [key, null])
  ));
  applyFills(contentFills(Object.fromEntries(entries), {
    has: id => !!document.getElementById(id),
    teamSlug: new URLSearchParams(location.search).get('team') || ''
  }));
}

// ---------- Page behaviour ----------

function initTeamsTabs() {
  const seniorBtn = document.getElementById('tab-senior');
  const juniorBtn = document.getElementById('tab-junior');
  const seniorGrid = document.getElementById('teams-grid');
  const juniorGrid = document.getElementById('junior-teams-grid');
  if (!seniorBtn || !juniorBtn || !seniorGrid || !juniorGrid) return;

  // Quick crossfade instead of an instant swap: fade the outgoing grid out,
  // then (once that's done) actually hide/show and fade the new one in.
  // prefers-reduced-motion already collapses all transitions site-wide to
  // ~0ms, so this naturally becomes an instant swap for anyone who needs that.
  function showGrid(showEl, hideEl, showBtn, hideBtn) {
    hideEl.style.opacity = '0';
    window.setTimeout(() => {
      hideEl.hidden = true;
      showEl.hidden = false;
      showEl.style.opacity = '0';
      void showEl.offsetWidth; // force a reflow so the opacity:0 above is "seen" before animating to 1
      showEl.style.opacity = '1';
    }, 150);
    showBtn.classList.add('active');
    showBtn.setAttribute('aria-pressed', 'true');
    hideBtn.classList.remove('active');
    hideBtn.setAttribute('aria-pressed', 'false');
  }

  seniorBtn.addEventListener('click', () => showGrid(seniorGrid, juniorGrid, seniorBtn, juniorBtn));
  juniorBtn.addEventListener('click', () => showGrid(juniorGrid, seniorGrid, juniorBtn, seniorBtn));
}

// Mobile header menu — hidden behind a hamburger button under the breakpoint
// where the nav links no longer fit next to the logo (see the CSS media
// query on nav.main-nav). Closes itself again once a link is actually used,
// so navigating away never leaves it stuck open.
function initMobileNav() {
  const toggle = document.getElementById('nav-toggle');
  const nav = document.querySelector('.main-nav');
  if (!toggle || !nav) return;

  toggle.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(isOpen));
  });

  nav.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      nav.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });
}

// Floating "back to top" button — appears once the page has been scrolled
// a reasonable distance, rather than always being on screen.
function initBackToTop() {
  const btn = document.getElementById('back-to-top');
  if (!btn) return;

  const toggleVisible = () => {
    btn.classList.toggle('visible', window.scrollY > 400);
  };
  window.addEventListener('scroll', toggleVisible, { passive: true });
  toggleVisible();

  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

// Cards, headings and panels further down the page fade and rise into place
// as they're scrolled to (the look itself is .reveal in the CSS). Anything
// already on screen when it first appears is left alone: animating what's in
// front of the visitor while the page is still loading makes every page look
// like it's assembling itself. This script adds the hidden starting state
// itself, so if it never runs, everything is simply visible. On a page that
// fills its content in the browser, the cards arrive after the page opens,
// so a MutationObserver picks those up as they're added. Items that come
// into view together get a growing delay, so a row of cards arrives one
// after another instead of all at once.
const REVEAL_SELECTOR = [
  '.section-head', '.callout', '.page-section .hero-actions', '.bib-card', '.tier-card',
  '.join-hero-card', '.form-card', '.contact-grid > *', '.team-sponsors', '.sponsor-wall', '.sponsor-strip'
].join(', ');

function initScrollReveal() {
  if (!('IntersectionObserver' in window)) return;
  // A visitor who has asked their device for less motion gets no reveals at
  // all, rather than reveals that just blink on.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // The -8% bottom margin waits until an item is a little way up the
  // screen, so the movement happens where the visitor is actually looking.
  const io = new IntersectionObserver(entries => {
    entries.filter(e => e.isIntersecting).forEach((e, i) => {
      e.target.style.setProperty('--reveal-delay', `${Math.min(i, 5) * 70}ms`);
      e.target.classList.add('in');
      io.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -8% 0px' });

  // Something hidden right now (a closed tab, a section waiting for its
  // data) has no height, so it counts as off screen and animates once shown.
  const seen = new WeakSet();
  const watch = el => {
    if (seen.has(el)) return;
    seen.add(el);
    const box = el.getBoundingClientRect();
    if (box.height && box.top < window.innerHeight && box.bottom > 0) return;
    el.classList.add('reveal');
    io.observe(el);
  };
  const scan = root => {
    if (root.matches(REVEAL_SELECTOR)) watch(root);
    root.querySelectorAll(REVEAL_SELECTOR).forEach(watch);
  };

  scan(document.body);
  new MutationObserver(records => {
    records.forEach(r => r.addedNodes.forEach(node => {
      if (node.nodeType === Node.ELEMENT_NODE) scan(node);
    }));
  }).observe(document.body, { childList: true, subtree: true });
}

// Picks a level in the sponsorship form and brings the form into view, so
// every "Sponsor at this level" button lands the visitor one step from done.
function chooseSponsorshipLevel(tierKey) {
  const select = document.getElementById('sp-tier');
  const formSection = document.getElementById('sponsor-form');
  if (!select || !formSection) return;
  const option = [...select.options].find(o => o.dataset.tier === tierKey && !o.disabled);
  if (option) {
    select.value = option.value;
    select.dispatchEvent(new Event('change'));
  }
  // A scripted smooth scroll ignores the CSS prefers-reduced-motion rule the
  // rest of the site follows, so it has to check for itself.
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  formSection.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  const nameField = document.getElementById('sp-name');
  if (nameField) nameField.focus({ preventScroll: true });
}

// Sends a Netlify form in the background so the visitor gets a message on
// the page instead of being taken away from it. FormData as the body sends
// multipart, which is what lets a file (a sponsor's logo) go through, and
// the Content-Type header is deliberately left unset so the browser can add
// the boundary marker multipart needs. fetch only throws on a network
// failure, so a server that rejects the submission is checked for here,
// otherwise the visitor would be thanked for something that never arrived.
async function submitNetlifyForm(form) {
  const res = await fetch('/', { method: 'POST', body: new FormData(form) });
  if (!res.ok) throw new Error('Form submission failed: ' + res.status);
}

function showFormStatus(el, text, ok) {
  el.textContent = text;
  el.className = 'form-status ' + (ok ? 'success' : 'error');
}

// contact.html: the general "Send a Query" form.
function initContactForm() {
  const form = document.getElementById('enquiry-form');
  const status = document.getElementById('form-status');
  if (!form || !status) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await submitNetlifyForm(form);
      showFormStatus(status, "Thanks, we've got your message and will reply soon.", true);
      form.reset();
    } catch (err) {
      showFormStatus(status, 'Something went wrong sending that. Please try again.', false);
    }
  });
}

const MAX_LOGO_BYTES = 8 * 1024 * 1024; // Netlify's limit for one form submission

// sponsors.html: the sponsorship enquiry form. Team and individual
// sponsorship also ask who's being backed. The tier cards' buttons are
// listened for on the grid as a whole, since the cards can be written into
// the page before this script runs.
function initSponsorshipForm() {
  const form = document.getElementById('sponsorship-form');
  if (!form) return;
  const status = document.getElementById('sponsorship-status');
  const select = document.getElementById('sp-tier');
  const forField = document.getElementById('sp-for-field');
  const forInput = document.getElementById('sp-for');
  const forLabel = document.getElementById('sp-for-label');
  const forHint = document.getElementById('sp-for-hint');
  const logo = document.getElementById('sp-logo');
  const tierGrid = document.getElementById('tier-grid');

  if (tierGrid) {
    tierGrid.addEventListener('click', e => {
      const btn = e.target.closest('button[data-tier]');
      if (btn) chooseSponsorshipLevel(btn.dataset.tier);
    });
  }

  const updateWho = () => {
    const tier = select.selectedOptions[0]?.dataset.tier;
    const needsWho = tier === 'team' || tier === 'individual';
    forField.hidden = !needsWho;
    forInput.required = needsWho;
    forLabel.textContent = tier === 'individual' ? 'Which player?' : 'Which team?';
    forHint.hidden = tier !== 'individual';
  };
  select.addEventListener('change', updateWho);
  updateWho();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const file = logo.files[0];
    if (file && file.size > MAX_LOGO_BYTES) {
      showFormStatus(status, 'That logo file is too big (over 8MB). Please send a smaller version.', false);
      return;
    }
    try {
      await submitNetlifyForm(form);
      showFormStatus(status, "Thanks, we've got your sponsorship enquiry and will be in touch soon.", true);
      form.reset();
      updateWho();
    } catch (err) {
      showFormStatus(status, 'Something went wrong sending that. Please try again.', false);
    }
  });
}

// build.js loads this same file in Node, where there's no page to run on.
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    initScrollReveal(); // first, so it's already watching if content is added below
    renderContent();
    initTeamsTabs();
    initContactForm();
    initSponsorshipForm();
    initMobileNav();
    initBackToTop();
  });
}

if (typeof module !== 'undefined') {
  module.exports = { contentFills, escapeHtml, slugify, DATA_FILES };
}

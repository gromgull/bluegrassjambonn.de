// Builds the static site into dist/: index.html, songs.html, links.html, events.ics and assets.
import { mkdirSync, rmSync, cpSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, loadData, loadSite, readJson, expandEvents, todayIn, addMonths, addMonthsKeepDay } from "../lib/events.mjs";
import { buildIcs } from "../lib/ics.mjs";

const OUT = join(ROOT, "dist");
const data = loadData();
const site = loadSite();
const today = todayIn(data.timezone);

// Events are generated from the rules up to `horizonMonths` ahead (inclusive).
// The calendar feed also keeps a month of history so recent cancellations still sync.
const horizon = addMonthsKeepDay(today, site.horizonMonths ?? 6);
const feedEvents = expandEvents(data, addMonths(today, -1), horizon + "~");
const upcoming = feedEvents.filter((e) => e.endDate >= today);

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const fmt = (date, options) => new Date(`${date}T12:00:00Z`).toLocaleDateString("de-DE", { timeZone: "UTC", ...options });

function eventItem(e) {
  const changed = new Set(e.changes);
  const badges = [];
  if (e.cancelled) badges.push(`<span class="badge badge-cancelled">Abgesagt</span>`);
  else {
    if (changed.has("date")) badges.push(`<span class="badge">Verschoben</span>`);
    if (changed.has("location")) badges.push(`<span class="badge">Anderer Ort</span>`);
    if (changed.has("start")) badges.push(`<span class="badge">Andere Uhrzeit</span>`);
  }
  const kind = e.seriesId ?? "extra";
  return `
      <li class="event event-${esc(kind)}${e.cancelled ? " is-cancelled" : ""}" data-end="${e.endDate}">
        <time class="event-date" datetime="${e.date}T${e.start}">
          <span class="event-dow">${esc(fmt(e.date, { weekday: "short" }).replace(".", ""))}</span>
          <span class="event-day">${esc(fmt(e.date, { day: "numeric" }))}</span>
          <span class="event-month">${esc(fmt(e.date, { month: "short" }).replace(".", ""))}</span>
        </time>
        <div class="event-body">
          <h3 class="event-title">${esc(e.title)} ${badges.join(" ")}</h3>
          <p class="event-meta">
            <span class="${changed.has("start") ? "hl" : ""}">${esc(fmt(e.date, { weekday: "long", day: "numeric", month: "long" }))}, ${esc(e.start)} Uhr</span>
            <span class="sep" aria-hidden="true">·</span>
            <span class="${changed.has("location") ? "hl" : ""}">${esc(e.location)}</span>
          </p>
          ${e.note ? `<p class="event-note">${esc(e.note)}</p>` : ""}
        </div>
      </li>`;
}

const icons = {
  instagram: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.2c3.2 0 3.6 0 4.8.1 1.2.1 1.8.2 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.4 1.1.4 2.2.1 1.3.1 1.6.1 4.8s0 3.6-.1 4.8c-.1 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1.1.4-2.2.4-1.3.1-1.6.1-4.8.1s-3.6 0-4.8-.1c-1.2-.1-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.4-1.1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.8c.1-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1.1-.4 2.2-.4C8.4 2.2 8.8 2.2 12 2.2zm0 2c-3.1 0-3.5 0-4.7.1-1.1.1-1.7.2-2.1.4-.5.2-.9.4-1.3.8-.4.4-.6.8-.8 1.3-.1.4-.3 1-.4 2.1-.1 1.2-.1 1.6-.1 4.7s0 3.5.1 4.7c.1 1.1.2 1.7.4 2.1.2.5.4.9.8 1.3.4.4.8.6 1.3.8.4.1 1 .3 2.1.4 1.2.1 1.6.1 4.7.1s3.5 0 4.7-.1c1.1-.1 1.7-.2 2.1-.4.5-.2.9-.4 1.3-.8.4-.4.6-.8.8-1.3.1-.4.3-1 .4-2.1.1-1.2.1-1.6.1-4.7s0-3.5-.1-4.7c-.1-1.1-.2-1.7-.4-2.1-.2-.5-.4-.9-.8-1.3-.4-.4-.8-.6-1.3-.8-.4-.1-1-.3-2.1-.4-1.2-.1-1.6-.1-4.7-.1zm0 3.1a4.7 4.7 0 1 1 0 9.4 4.7 4.7 0 0 1 0-9.4zm0 7.6a2.9 2.9 0 1 0 0-5.8 2.9 2.9 0 0 0 0 5.8zm6-7.8a1.1 1.1 0 1 1-2.2 0 1.1 1.1 0 0 1 2.2 0z"/></svg>`,
  facebook: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13.5 21.9v-7.7h2.6l.4-3h-3V9.3c0-.9.2-1.5 1.5-1.5h1.6V5.1c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H7.8v3h2.6v7.7C5.6 21.2 2 17 2 12 2 6.5 6.5 2 12 2s10 4.5 10 10c0 5-3.6 9.2-8.5 9.9z"/></svg>`,
  spotify: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor"/><g fill="none" stroke="var(--icon-cut, #fff)" stroke-linecap="round"><path d="M6.5 9.2c3.6-1.1 7.6-.8 11 .9" stroke-width="1.9"/><path d="M7.2 12.5c3-.9 6.2-.6 8.9.8" stroke-width="1.6"/><path d="M7.8 15.6c2.4-.6 4.8-.4 6.9.6" stroke-width="1.3"/></g></svg>`,
  calendar: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 2h2v2h6V2h2v2h3a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3V2zm12 8H5v9h14v-9zM5 6v2h14V6H5z"/></svg>`,
};

const socials = Object.entries(site.links ?? {})
  .filter(([, url]) => url)
  .map(
    ([name, url]) =>
      `<a class="social" href="${esc(url)}" rel="noopener" target="_blank">${icons[name] ?? ""}<span>${esc(name[0].toUpperCase() + name.slice(1))}</span></a>`,
  )
  .join("\n          ");

// Decorative guitar, redrawn after the flyer.
const guitar = `
  <svg class="guitar" viewBox="-125 10 580 1330" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <path class="g-body" d="M164 585 C250 580 320 600 345 650 C385 720 375 810 340 868 C305 925 320 985 375 1045 C440 1120 440 1230 370 1280 C310 1320 230 1325 164 1325 C98 1325 18 1320 -42 1280 C-112 1230 -112 1120 -47 1045 C8 985 23 925 -12 868 C-47 810 -57 720 -17 650 C8 600 78 580 164 585 Z"/>
    <g class="g-pegs">
      <ellipse cx="82" cy="75" rx="15" ry="11"/><ellipse cx="82" cy="125" rx="15" ry="11"/><ellipse cx="82" cy="172" rx="15" ry="11"/>
      <ellipse cx="244" cy="80" rx="15" ry="11"/><ellipse cx="244" cy="130" rx="15" ry="11"/><ellipse cx="244" cy="172" rx="15" ry="11"/>
    </g>
    <path class="g-head" d="M100 34 Q163 20 228 34 L216 246 L112 246 Z"/>
    <rect class="g-nut" x="112" y="242" width="104" height="13"/>
    <rect class="g-neck" x="112" y="255" width="104" height="470"/>
    <circle class="g-hole" cx="160" cy="862" r="86"/>
    <g class="g-strings">
      <line x1="125" y1="255" x2="125" y2="1100"/><line x1="140" y1="255" x2="140" y2="1100"/>
      <line x1="155" y1="255" x2="155" y2="1100"/><line x1="170" y1="255" x2="170" y2="1100"/>
      <line x1="185" y1="255" x2="185" y2="1100"/><line x1="200" y1="255" x2="200" y2="1100"/>
    </g>
    <rect class="g-bridge" x="90" y="1096" width="142" height="43"/>
  </svg>`;

// Speckled paper texture, deterministic so builds are reproducible.
function speckles() {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let dots = "";
  for (let i = 0; i < 70; i++) {
    const r = (rand() * 1.6 + 0.4).toFixed(2);
    const o = (rand() * 0.25 + 0.1).toFixed(2);
    dots += `<circle cx='${(rand() * 240).toFixed(1)}' cy='${(rand() * 240).toFixed(1)}' r='${r}' fill-opacity='${o}'/>`;
  }
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><g fill='#b08a63'>${dots}</g></svg>`)}")`;
}

const css = `
:root {
  --paper: #efdfc8;
  --ink: #353c4a;
  --coral: #f2766b;
  --teal: #6bbcc4;
  --guitar: #fdbe5f;
  --neck: #e3604c;
  --card: rgba(255, 250, 242, 0.72);
  --display: "Open Sans", system-ui, sans-serif;
  --body: "Archivo Narrow", "Arial Narrow", system-ui, sans-serif;
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
html { background: var(--paper); }
body {
  margin: 0;
  color: var(--ink);
  font: 400 1.2rem/1.45 var(--body);
  background: var(--paper) ${speckles()};
  -webkit-font-smoothing: antialiased;
}
a { color: inherit; }
.layout {
  display: grid;
  grid-template-columns: minmax(220px, 34%) 1fr;
  min-height: 100vh;
}
.guitar-col { position: relative; overflow: hidden; }
.guitar {
  position: sticky; top: 0;
  display: block; width: 100%; height: 100vh; max-height: 1300px;
  overflow: visible; padding: 2vh 0 0;
}
.g-body, .g-head { fill: var(--guitar); }
.g-neck { fill: var(--neck); }
.g-pegs, .g-nut, .g-hole, .g-bridge { fill: var(--ink); }
.g-strings line { stroke: #fff8ee; stroke-width: 2.5; }

main { padding: clamp(2rem, 5vw, 4rem) clamp(1rem, 5vw, 4.5rem) 3rem 1rem; max-width: 52rem; }
.logo-mobile { display: none; }
.logo-mobile img { display: block; width: 100%; height: auto; }

.hero { text-align: right; }
.bar { height: 10px; background: var(--teal); border: 0; margin: 0; }
.bar-top { width: 70%; margin-left: auto; margin-right: 8%; }
.bar-bottom { width: 100%; }
h1 {
  font: 800 clamp(2.4rem, 7.2vw, 5.4rem)/0.98 var(--display);
  text-transform: uppercase; letter-spacing: 0.01em;
  margin: 0.25em 0 0.2em;
}
h1 .line { display: block; }
h1 .jam { color: var(--coral); font-size: 1.32em; display: inline-block; transform: translateY(-0.14em); margin-left: 0.15em; line-height: 0.8; }
h1 .line:last-child { margin-top: 0.2em; }
h1 .bonn { display: inline-block; }
.venue { font-size: 1.6rem; margin: 1.2rem 0 0.2rem; text-align: center; padding-left: 15%; }
.everyone { font-size: 1.6rem; margin: 0 0 0.6rem; }
.instruments { color: var(--coral); text-transform: uppercase; font-size: 1.3rem; line-height: 1.5; max-width: 22em; margin: 0 0 0 auto; }

.schedule { list-style: none; padding: 0; margin: 2.2rem 0 0; }
.schedule li { font: 800 clamp(1.6rem, 3.6vw, 2.4rem)/1.1 var(--display); margin-bottom: 1.4rem; }
.schedule .title { display: block; text-align: left; padding-left: 8%; }
.schedule .when { display: block; color: var(--coral); }
.start { font: 800 clamp(1.6rem, 3.6vw, 2.4rem)/1.1 var(--display); margin: 1.6rem 0 0; }

section { margin-top: 4rem; }
h2 {
  font: 800 1.9rem/1.1 var(--display); text-transform: uppercase;
  margin: 0 0 1.2rem; display: flex; align-items: center; gap: 0.8rem;
}
h2::after { content: ""; flex: 1; height: 6px; background: var(--teal); }

.events { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.75rem; }
.event {
  display: grid; grid-template-columns: 4.6rem 1fr; gap: 1.1rem; align-items: center;
  background: var(--card); border-radius: 14px; padding: 0.8rem 1.1rem 0.8rem 0.8rem;
  border-left: 8px solid var(--coral);
}
.event-bluegrass { border-left-color: var(--teal); }
.event-extra { border-left-color: var(--guitar); }
.event-date {
  display: grid; justify-items: center; line-height: 1;
  background: var(--ink); color: #fff; border-radius: 10px; padding: 0.45rem 0 0.55rem;
}
.event-dow, .event-month { font: 700 0.85rem/1.2 var(--body); text-transform: uppercase; letter-spacing: 0.06em; }
.event-day { font: 800 1.9rem/1 var(--display); }
.event-title { font: 800 1.35rem/1.2 var(--display); margin: 0; }
.event-meta { margin: 0.15rem 0 0; font-size: 1.1rem; }
.event-meta .sep { margin: 0 0.35em; color: var(--coral); }
.hl { background: #ffe1a6; border-radius: 4px; padding: 0 0.25em; }
.event-note { margin: 0.35rem 0 0; font-style: italic; }
.badge {
  display: inline-block; vertical-align: middle; font: 700 0.75rem/1 var(--body);
  text-transform: uppercase; letter-spacing: 0.06em; padding: 0.3em 0.55em; border-radius: 99px;
  background: var(--guitar); color: var(--ink); transform: translateY(-2px);
}
.badge-cancelled { background: var(--coral); color: #fff; }
.is-cancelled { opacity: 0.75; border-left-color: #b9a993; }
.is-cancelled .event-date { background: #8d8779; }
.is-cancelled .event-meta { text-decoration: line-through; }

.card { background: var(--card); border-radius: 14px; padding: 1.3rem 1.4rem; }
.card p { margin: 0 0 1rem; }

/* tabs */
.tabs { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 0.4rem; margin: 0 0 2.2rem; }
.tabs a {
  font: 700 1rem/1 var(--body); text-transform: uppercase; letter-spacing: 0.05em; text-decoration: none;
  padding: 0.65em 1.05em; border-radius: 99px; background: var(--card);
}
.tabs a:hover { background: var(--coral); color: #fff; }
.tabs a[aria-current="page"] { background: var(--ink); color: #fff; }

/* compact title on sub-pages */
h1.small-title { font-size: clamp(1.9rem, 4.4vw, 3.3rem); }
.hero-small .bar { height: 7px; }
.page-intro { font-size: 1.35rem; margin: 1.2rem 0 0; }
.playlist { margin: 1rem 0 0; }
.btn { --icon-cut: var(--ink); }
.btn:hover { --icon-cut: var(--coral); }
.hero-small + section { margin-top: 3rem; }

/* songs & tunes */
.repertoire {
  list-style: none; margin: 0; padding: 0;
  display: grid; grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr)); gap: 0.6rem;
}
.repertoire li {
  background: var(--card); border-radius: 12px; padding: 0.7rem 1rem 0.75rem;
  border-left: 8px solid var(--teal);
  display: flex; flex-direction: column; justify-content: center; min-height: 4rem;
}
#tunes .repertoire li { border-left-color: var(--coral); }
.r-title { font: 800 1.08rem/1.25 var(--display); }
.r-artist { font-size: 1.02rem; opacity: 0.75; }

/* links */
.links { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.75rem; }
.link-card {
  display: grid; gap: 0.2rem; text-decoration: none;
  background: var(--card); border-radius: 14px; padding: 1rem 1.2rem; border-left: 8px solid var(--teal);
}
.links li:nth-child(even) .link-card { border-left-color: var(--coral); }
.l-title .badge { margin-left: 0.3em; }
.link-card:hover { background: #fffaf2; }
.link-card:hover .l-title { color: var(--coral); }
.l-title { font: 800 1.35rem/1.2 var(--display); }
.l-desc { font-size: 1.12rem; }
.l-host { font-size: 0.95rem; opacity: 0.65; }
.buttons { display: flex; flex-wrap: wrap; gap: 0.6rem; }
.btn {
  display: inline-flex; align-items: center; gap: 0.5em; text-decoration: none;
  font: 700 1.05rem/1 var(--body); text-transform: uppercase; letter-spacing: 0.04em;
  padding: 0.75em 1.1em; border-radius: 99px; background: var(--ink); color: #fff;
}
.btn.alt { background: transparent; color: var(--ink); box-shadow: inset 0 0 0 2px var(--ink); }
.btn svg, .social svg { width: 1.2em; height: 1.2em; }
.btn:hover { background: var(--coral); color: #fff; box-shadow: none; }

footer { margin-top: 4rem; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1.5rem; }
.socials { display: flex; flex-wrap: wrap; gap: 0.6rem; }
.social {
  display: inline-flex; align-items: center; gap: 0.45em; text-decoration: none; font-weight: 700;
  padding: 0.6em 1em; border-radius: 99px; background: var(--card);
}
.social:hover { background: var(--coral); color: #fff; }
.logos { display: flex; align-items: center; gap: 1.2rem; }
.logos img { height: 96px; width: auto; display: block; }
.logos a { border-radius: 8px; transition: transform 0.15s; }
.logos a:hover { transform: scale(1.05); }
.small { font-size: 0.95rem; opacity: 0.7; }

@media (max-width: 760px) {
  .layout { display: block; }
  .guitar-col { display: none; }
  main { padding: 1.5rem 1rem 2.5rem; }
  .logo-mobile { display: block; width: 92px; margin: 0 auto 1rem; }
  .tabs { justify-content: center; flex-wrap: nowrap; gap: 0.25rem; margin-bottom: 1.6rem; }
  .tabs a { font-size: 0.8rem; letter-spacing: 0.02em; padding: 0.65em 0.7em; white-space: nowrap; }
  .hero { text-align: center; }
  .bar-top { width: 80%; margin: 0 auto; }
  .venue { padding-left: 0; }
  .instruments { margin: 0 auto; }
  .schedule .title { text-align: center; padding-left: 0; }
  .event { grid-template-columns: 3.9rem 1fr; gap: 0.8rem; }
  .event-day { font-size: 1.6rem; }
  .event-title { font-size: 1.15rem; }
  .event-meta { font-size: 1rem; }
  .event-meta .sep { display: none; }
  .event-meta span { display: block; }
  footer { justify-content: center; }
}
@media (prefers-reduced-motion: no-preference) { .btn, .social { transition: background 0.15s, color 0.15s; } }
`;

const footer = `
    <footer>
      <div class="socials">
          ${socials}
      </div>
      <div class="logos">
        <a href="./" title="Startseite"><img src="assets/logo.png" alt="Bluegrass Jam Bonn" width="96" height="96"></a>
        ${site.venueUrl ? `<a href="${esc(site.venueUrl)}" rel="noopener" target="_blank" title="James Joyce Irish Pub auf Facebook"><img src="assets/james-joyce.png" alt="James Joyce Irish Pub" width="96" height="96"></a>` : `<img src="assets/james-joyce.png" alt="James Joyce Irish Pub" width="96" height="96">`}
      </div>
      <p class="small">Stand: ${esc(fmt(today, { day: "numeric", month: "long", year: "numeric" }))}</p>
    </footer>`;

const PAGES = [
  { file: "index.html", href: "./", label: "Termine" },
  { file: "songs.html", href: "songs.html", label: "Songs & Tunes" },
  { file: "links.html", href: "links.html", label: "Links & Friends" },
];

const nav = (current) => `
    <nav class="tabs" aria-label="Seiten">
      ${PAGES.map((p) => `<a href="${p.href}"${p.file === current ? ' aria-current="page"' : ""}>${esc(p.label)}</a>`).join("\n      ")}
    </nav>`;

const title = (small) => `
      <hr class="bar bar-top">
      <h1${small ? ' class="small-title"' : ""}>
        <span class="line">Acoustic &amp;</span>
        <span class="line">Bluegrass</span>
        <span class="line"><span class="bonn">Bonn</span><span class="jam">Jam</span></span>
      </h1>
      <hr class="bar bar-bottom">`;

function layout({ file, pageTitle, description, body, script = "" }) {
  const fullTitle = pageTitle ? `${pageTitle} – ${site.title}` : site.title;
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description ?? site.description)}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(description ?? site.description)}">
<meta property="og:image" content="assets/logo.png">
<link rel="icon" href="assets/logo.png">
<link rel="alternate" type="text/calendar" title="${esc(site.calendarName)}" href="events.ics">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo+Narrow:wght@400;700&family=Open+Sans:wght@800&display=swap" rel="stylesheet">
<style>${css}</style>
</head>
<body>
<div class="layout">
  <div class="guitar-col">${guitar}
  </div>
  <main>
    <a class="logo-mobile" href="./"><img src="assets/logo.png" alt="Bluegrass Jam Bonn Logo"></a>
    ${nav(file)}
${body}
${footer}
  </main>
</div>
${script}
</body>
</html>
`;
}

// --- Termine (home) ----------------------------------------------------------

const homeBody = `
    <header class="hero">${title(false)}
      <p class="venue">${esc(site.venue)}</p>
      ${site.intro.map((p) => `<p class="everyone">${p}</p>`).join("\n      ")}
      <p class="instruments">${esc(site.instruments)}</p>
      <ul class="schedule">
        ${site.schedule.map((s) => `<li><span class="title">${esc(s.title)}</span><span class="when">${esc(s.when)}</span></li>`).join("\n        ")}
      </ul>
      <p class="start">${esc(site.startNote)}</p>
    </header>

    <section id="termine" aria-labelledby="termine-h">
      <h2 id="termine-h">Nächste Termine</h2>
      ${upcoming.length ? `<ol class="events">${upcoming.map(eventItem).join("")}\n      </ol>` : `<p>Gerade sind keine Termine geplant.</p>`}
    </section>

    <section id="kalender" aria-labelledby="kalender-h">
      <h2 id="kalender-h">Kalender</h2>
      <div class="card">
        <p>Abonniere unseren Kalender – Absagen und Änderungen landen dann automatisch in deinem Kalender.</p>
        <div class="buttons">
          <a class="btn" id="webcal" href="events.ics">${icons.calendar}Kalender abonnieren</a>
          <a class="btn alt" id="gcal" href="events.ics" target="_blank" rel="noopener">Google Kalender</a>
          <a class="btn alt" href="events.ics" download>.ics herunterladen</a>
        </div>
      </div>
    </section>`;

const homeScript = `<script>
  // Hide events that have passed since the last build.
  (function () {
    var p = new Intl.DateTimeFormat("en-CA", { timeZone: ${JSON.stringify(data.timezone)}, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    var get = function (t) { return p.find(function (x) { return x.type === t; }).value; };
    var today = get("year") + "-" + get("month") + "-" + get("day");
    document.querySelectorAll(".event[data-end]").forEach(function (el) { if (el.dataset.end < today) el.hidden = true; });

    // Absolute subscription links for calendar apps.
    var ics = new URL("events.ics", location.href);
    var webcal = ics.href.replace(/^https?:/, "webcal:");
    document.getElementById("webcal").href = webcal;
    document.getElementById("gcal").href = "https://calendar.google.com/calendar/render?cid=" + encodeURIComponent(webcal);
  })();
</script>`;

// --- Songs & Tunes -----------------------------------------------------------

const songs = readJson("songs.json");
const repertoire = (id, heading, items) => `
    <section id="${id}" aria-labelledby="${id}-h">
      <h2 id="${id}-h">${esc(heading)}</h2>
      <ul class="repertoire">
        ${items
          .map((s) => `<li><span class="r-title">${esc(s.title)}</span>${s.artist ? `<span class="r-artist">${esc(s.artist)}</span>` : ""}</li>`)
          .join("\n        ")}
      </ul>
    </section>`;

const songsBody = `
    <header class="hero hero-small">${title(true)}
      <p class="page-intro">${esc(songs.intro ?? "Das spielen wir oft – zum Mitspielen, Mitsingen und Üben für die nächste Session.")}</p>
      ${songs.playlist ? `<p class="playlist"><a class="btn" href="${esc(songs.playlist)}" rel="noopener" target="_blank">${icons.spotify}Playlist auf Spotify</a></p>` : ""}
    </header>
${repertoire("songs", "Songs", songs.songs ?? [])}
${repertoire("tunes", "Tunes", songs.tunes ?? [])}`;

// --- Links & Friends ---------------------------------------------------------

const links = readJson("links.json");
const host = (url) => new URL(url).hostname.replace(/^www\./, "");
const linksBody = `
    <header class="hero hero-small">${title(true)}
      <p class="page-intro">Freunde, Sessions und Orte rund um Bluegrass &amp; Acoustic Music.</p>
    </header>

    <section id="links" aria-labelledby="links-h">
      <h2 id="links-h">Links &amp; Friends</h2>
      <ul class="links">
        ${links
          .map(
            (l) => `<li><a class="link-card" href="${esc(l.url)}" rel="noopener" target="_blank">
          <span class="l-title">${esc(l.title)}${l.tag ? ` <span class="badge">${esc(l.tag)}</span>` : ""}</span>
          ${l.description ? `<span class="l-desc">${esc(l.description)}</span>` : ""}
          <span class="l-host">${esc(host(l.url))} ↗</span>
        </a></li>`,
          )
          .join("\n        ")}
      </ul>
    </section>`;

// --- write -------------------------------------------------------------------

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(join(ROOT, "src", "assets"), join(OUT, "assets"), { recursive: true });
writeFileSync(join(OUT, "index.html"), layout({ file: "index.html", body: homeBody, script: homeScript }));
writeFileSync(join(OUT, "songs.html"), layout({ file: "songs.html", pageTitle: "Songs & Tunes", description: "Songs und Tunes, die wir bei der Bluegrass Jam Bonn spielen.", body: songsBody }));
writeFileSync(join(OUT, "links.html"), layout({ file: "links.html", pageTitle: "Links & Friends", description: "Freunde, Sessions und Links rund um die Bluegrass Jam Bonn.", body: linksBody }));
writeFileSync(
  join(OUT, "events.ics"),
  buildIcs(feedEvents, {
    calendarName: site.calendarName,
    timezone: data.timezone,
    uidDomain: "bluegrassjambonn",
    url: site.url || undefined,
  }),
);
writeFileSync(join(OUT, ".nojekyll"), "");

console.log(`Built dist/ — ${upcoming.length} upcoming on the page, ${feedEvents.length} in events.ics, ${(songs.songs ?? []).length + (songs.tunes ?? []).length} songs & tunes, ${links.length} links`);

# Acoustic & Bluegrass Jam Bonn

Static website + subscribable calendar (`events.ics`) for the jams at the James Joyce Irish Pub.
No dependencies, just Node ≥ 20.

```sh
npm run build   # → dist/index.html, songs.html, links.html, events.ics
npm run dev     # build + preview at http://localhost:8080
```

## Where things live

| File | What |
| --- | --- |
| `data/site.json` | Page text, links, `horizonMonths` (how far ahead events are generated, default 6) |
| `data/events.json` | Recurring series, per-event overrides, one-off events |
| `data/songs.json` | Songs & Tunes page: `playlist` (Spotify link), `songs` and `tunes`, each `{ title, artist }` |
| `data/links.json` | Links & Friends page: list of `{ title, url, description, tag? }` |
| `scripts/build.mjs` | HTML/CSS template and build |
| `lib/events.mjs` | Recurrence expansion + overrides |
| `lib/ics.mjs` | Calendar feed writer |
| `bin/jam.mjs` | The `jam` CLI |

## Tweaking events

Every event has a stable id: `<series>-<original date>`, e.g. `bluegrass-2026-12-15`.
Where only one event falls on a date, you can use the bare date instead.

```sh
npx jam list                                   # upcoming events + ids (--months 12, --all)
npx jam cancel 2026-12-15 --note "Weihnachtspause"
npx jam restore 2026-12-15
npx jam set acoustic-2027-01-04 --location "Pawlow, Bonn" --start 20:00
npx jam set acoustic-2027-01-04 --date 2027-01-11   # move it (keeps the id)
npx jam set bluegrass-2027-02-16 --note "Mit Gast-Fiddler!"
npx jam reset acoustic-2027-01-04              # back to the regular schedule
npx jam add --title "Sommer-Jam im Park" --date 2027-07-10 --start 15:00 --location "Hofgarten"
npx jam remove sommer-jam-im-park-2027-07-10
```

Then commit and push `data/events.json`; GitHub Actions rebuilds and deploys.
(`npm run jam -- <command>` works too.)

Cancelled events stay in the feed with `STATUS:CANCELLED`, so subscribers' calendars
update instead of silently losing the event. Prefer `cancel` over `remove` for anything
already announced. Every change bumps the event's `SEQUENCE` so calendar apps pick it up.

To change the regular schedule itself (day, time, a pause), edit `series` in
`data/events.json`. Each series supports `from` / `until` dates, plus `start`,
`durationMinutes` and `location` to override `defaults`. `rule.nth` can be `-1` for "last".

## Deployment

1. Push to a GitHub repo on the `main` branch.
2. Under **Settings → Pages**, set *Source* to **GitHub Actions**.

The workflow also runs every night, so past events drop off the page and the feed always
covers the next `horizonMonths` (6) months. Optionally set `url` in `data/site.json` to the live URL; it's
then added as a link in each calendar entry.

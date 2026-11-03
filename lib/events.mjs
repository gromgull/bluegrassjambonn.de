// Shared event logic: expands recurring series, applies per-occurrence overrides,
// and merges one-off extra events.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const EVENTS_FILE = join(ROOT, "data", "events.json");
export const SITE_FILE = join(ROOT, "data", "site.json");

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export function loadData() {
  return JSON.parse(readFileSync(EVENTS_FILE, "utf8"));
}

export function saveData(data) {
  writeFileSync(EVENTS_FILE, JSON.stringify(data, null, 2) + "\n");
}

export function loadSite() {
  return JSON.parse(readFileSync(SITE_FILE, "utf8"));
}

// --- plain calendar-date helpers (no time zones involved) -------------------

export const pad = (n) => String(n).padStart(2, "0");
export const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

/** Today's date (YYYY-MM-DD) in the given IANA time zone. */
export function todayIn(timeZone) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** Add months to a YYYY-MM-DD date, returning the first of that month. */
export function addMonths(date, months) {
  const [y, m] = date.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}

/** nth weekday of a month; nth = -1 means the last one. Returns null if it doesn't exist. */
function nthWeekday(year, month, weekday, nth) {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (nth > 0) {
    const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    const day = 1 + ((weekday - firstDow + 7) % 7) + (nth - 1) * 7;
    return day <= daysInMonth ? ymd(year, month, day) : null;
  }
  const lastDow = new Date(Date.UTC(year, month - 1, daysInMonth)).getUTCDay();
  const day = daysInMonth - ((lastDow - weekday + 7) % 7) + (nth + 1) * 7;
  return day >= 1 ? ymd(year, month, day) : null;
}

function addMinutes(date, time, minutes) {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d, hh, mm + minutes));
  return {
    date: ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()),
    time: `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`,
  };
}

/** Same day-of-month N months later (clamped to month end), as YYYY-MM-DD. */
export function addMonthsKeepDay(date, months) {
  const [y, m, d] = date.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return ymd(first.getUTCFullYear(), first.getUTCMonth() + 1, Math.min(d, days));
}

// --- expansion ---------------------------------------------------------------

/**
 * Returns every event (recurring + extra) whose date lies in [from, to),
 * sorted by date/time. Each event is a plain object:
 * { id, seriesId, title, description, date, start, endDate, end, location,
 *   cancelled, note, sequence, overridden, changes: [...] }
 */
export function expandEvents(data, from, to) {
  const { defaults = {}, series = [], overrides = {}, extra = [] } = data;
  const events = [];

  for (const s of series) {
    const weekday = WEEKDAYS.indexOf(String(s.rule.weekday).toLowerCase());
    if (weekday < 0) throw new Error(`Unknown weekday "${s.rule.weekday}" in series ${s.id}`);

    // Iterate months, with one month of slack on each side so moved events are caught.
    for (let month = addMonths(from, -1); month < addMonths(to, 1); month = addMonths(month, 1)) {
      const [y, m] = month.split("-").map(Number);
      const date = nthWeekday(y, m, weekday, s.rule.nth);
      if (!date) continue;
      if (s.from && date < s.from) continue;
      if (s.until && date > s.until) continue;

      const id = `${s.id}-${date}`;
      const base = {
        id,
        seriesId: s.id,
        title: s.title,
        description: s.description ?? "",
        date,
        start: s.start ?? defaults.start,
        durationMinutes: s.durationMinutes ?? defaults.durationMinutes ?? 180,
        location: s.location ?? defaults.location ?? "",
        originalDate: date,
      };
      events.push(applyOverride(base, overrides[id]));
    }
  }

  for (const e of extra) {
    events.push(
      applyOverride(
        {
          seriesId: null,
          description: "",
          start: defaults.start,
          durationMinutes: defaults.durationMinutes ?? 180,
          location: defaults.location ?? "",
          ...e,
          originalDate: e.date,
        },
        null,
      ),
    );
  }

  return events
    .filter((e) => e.date >= from && e.date < to)
    .map(finalize)
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}

const OVERRIDABLE = ["title", "description", "date", "start", "durationMinutes", "location", "note", "cancelled"];

function applyOverride(base, ov) {
  const ev = { cancelled: false, note: "", sequence: 0, changes: [], ...base };
  if (!ov) return ev;
  for (const key of OVERRIDABLE) {
    if (ov[key] === undefined) continue;
    if (key !== "note" && key !== "cancelled" && ov[key] !== base[key]) ev.changes.push(key);
    ev[key] = ov[key];
  }
  ev.sequence = ov.sequence ?? 0;
  ev.updatedAt = ov.updatedAt;
  ev.overridden = true;
  return ev;
}

function finalize(ev) {
  const end = addMinutes(ev.date, ev.start, Number(ev.durationMinutes));
  return { ...ev, endDate: end.date, end: end.time };
}

// --- lookup used by the CLI --------------------------------------------------

/** Resolve "acoustic-2026-12-07", an extra-event id, or a bare date to a single event. */
export function findEvent(data, ref) {
  const all = expandEvents(data, "2000-01-01", addMonths(todayIn(data.timezone), 36));

  const byId = all.find((e) => e.id === ref);
  if (byId) return { event: byId };

  if (/^\d{4}-\d{2}-\d{2}$/.test(ref)) {
    const matches = all.filter((e) => e.date === ref || e.originalDate === ref);
    if (matches.length === 1) return { event: matches[0] };
    if (matches.length > 1) return { error: `Several events on ${ref}: ${matches.map((e) => e.id).join(", ")} — use the id.` };
  }
  return { error: `No event found for "${ref}". Run "jam list" to see ids.` };
}

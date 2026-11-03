#!/usr/bin/env node
// CLI for tweaking individual events in data/events.json.
import { parseArgs } from "node:util";
import { loadData, saveData, expandEvents, findEvent, todayIn, addMonths } from "../lib/events.mjs";

const HELP = `
jam — manage Bluegrass Jam Bonn events (edits data/events.json)

Usage:
  jam list [--months 6] [--all]            Upcoming events with their ids
  jam cancel <event> [--note "..."]         Mark an event as cancelled
  jam restore <event>                       Undo a cancellation
  jam set <event> [options]                 Change a single event
      --location "..."   --start 20:00   --duration 180 (minutes)
      --date 2026-12-08  --title "..."   --description "..."   --note "..."
  jam reset <event>                         Drop all overrides for an event
  jam add --title "..." --date YYYY-MM-DD [--start 19:30] [--location ...]
          [--duration 180] [--description ...] [--note ...] [--id my-id]
                                            Add a one-off event
  jam remove <event>                        Delete a one-off event

<event> is an id like "bluegrass-2026-11-17" or just a date ("2026-11-17")
when only one event falls on that day.

Run "npm run build" afterwards (or just commit + push — CI rebuilds).
`;

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    months: { type: "string" },
    all: { type: "boolean" },
    note: { type: "string" },
    location: { type: "string" },
    start: { type: "string" },
    duration: { type: "string" },
    date: { type: "string" },
    title: { type: "string" },
    description: { type: "string" },
    id: { type: "string" },
    help: { type: "boolean", short: "h" },
  },
});

const [command, ref] = positionals;
const data = loadData();
data.overrides ??= {};
data.extra ??= [];

const fail = (msg) => {
  console.error(`✖ ${msg}`);
  process.exit(1);
};

const validate = () => {
  if (opts.date && !/^\d{4}-\d{2}-\d{2}$/.test(opts.date)) fail(`--date must be YYYY-MM-DD, got "${opts.date}"`);
  if (opts.start && !/^\d{2}:\d{2}$/.test(opts.start)) fail(`--start must be HH:MM, got "${opts.start}"`);
  if (opts.duration && !/^\d+$/.test(opts.duration)) fail(`--duration must be minutes, got "${opts.duration}"`);
};

const fieldsFromOpts = () => {
  validate();
  const f = {};
  for (const k of ["location", "start", "date", "title", "description", "note"]) if (opts[k] !== undefined) f[k] = opts[k];
  if (opts.duration !== undefined) f.durationMinutes = Number(opts.duration);
  return f;
};

const resolve = () => {
  if (!ref) fail(`"${command}" needs an event id or date.`);
  const { event, error } = findEvent(data, ref);
  if (error) fail(error);
  return event;
};

const isExtra = (ev) => ev.seriesId === null;

/** Apply fields to an event: extras are edited in place, series events get an override. */
function update(ev, fields) {
  const now = new Date().toISOString();
  if (isExtra(ev)) {
    const x = data.extra.find((e) => e.id === ev.id);
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined) delete x[k];
      else x[k] = v;
    }
    x.sequence = (x.sequence ?? 0) + 1;
    x.updatedAt = now;
  } else {
    const ov = (data.overrides[ev.id] ??= {});
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined) delete ov[k];
      else ov[k] = v;
    }
    ov.sequence = (ov.sequence ?? 0) + 1;
    ov.updatedAt = now;
  }
  saveData(data);
}

function describe(e) {
  const flags = [];
  if (e.cancelled) flags.push("CANCELLED");
  if (e.changes?.length) flags.push(`changed: ${e.changes.join(",")}`);
  if (e.seriesId === null) flags.push("one-off");
  const date = new Date(`${e.date}T12:00:00Z`).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
  return [
    `${date} ${e.start}  ${e.title.padEnd(16)} ${e.id}`,
    `    ${e.location}${flags.length ? `  [${flags.join("; ")}]` : ""}${e.note ? `\n    Note: ${e.note}` : ""}`,
  ].join("\n");
}

switch (command) {
  case undefined:
  case "help":
    console.log(HELP);
    break;

  case "list": {
    const today = todayIn(data.timezone);
    const from = opts.all ? "2000-01-01" : today;
    const events = expandEvents(data, from, addMonths(today, Number(opts.months ?? 6)));
    console.log(events.map(describe).join("\n") || "No events.");
    break;
  }

  case "cancel": {
    const ev = resolve();
    update(ev, { cancelled: true, ...(opts.note !== undefined ? { note: opts.note } : {}) });
    console.log(`✔ Cancelled ${ev.id}`);
    break;
  }

  case "restore": {
    const ev = resolve();
    update(ev, { cancelled: undefined });
    console.log(`✔ Restored ${ev.id}`);
    break;
  }

  case "set": {
    const ev = resolve();
    const fields = fieldsFromOpts();
    if (!Object.keys(fields).length) fail("Nothing to change. See `jam help` for options.");
    update(ev, fields);
    console.log(`✔ Updated ${ev.id}: ${Object.keys(fields).join(", ")}`);
    break;
  }

  case "reset": {
    const ev = resolve();
    if (isExtra(ev)) fail(`${ev.id} is a one-off event; use "jam set" or "jam remove".`);
    if (!data.overrides[ev.id]) fail(`${ev.id} has no overrides.`);
    // Keep the sequence number so calendar apps pick up the reverted version.
    const sequence = (data.overrides[ev.id].sequence ?? 0) + 1;
    data.overrides[ev.id] = { sequence, updatedAt: new Date().toISOString() };
    saveData(data);
    console.log(`✔ Reset ${ev.id} to the regular schedule`);
    break;
  }

  case "add": {
    const fields = fieldsFromOpts();
    if (!fields.title || !fields.date) fail("`jam add` needs --title and --date.");
    const slug = fields.title.toLowerCase().normalize("NFKD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "");
    const id = opts.id ?? `${slug}-${fields.date}`;
    if (data.extra.some((e) => e.id === id) || findEvent(data, id).event) fail(`An event with id "${id}" already exists; pass --id.`);
    data.extra.push({ id, ...fields, sequence: 0, updatedAt: new Date().toISOString() });
    saveData(data);
    console.log(`✔ Added ${id}`);
    break;
  }

  case "remove": {
    const ev = resolve();
    if (!isExtra(ev)) fail(`${ev.id} is a recurring event — use "jam cancel" instead, so subscribers see the cancellation.`);
    data.extra = data.extra.filter((e) => e.id !== ev.id);
    saveData(data);
    console.log(`✔ Removed ${ev.id}`);
    break;
  }

  default:
    fail(`Unknown command "${command}".\n${HELP}`);
}

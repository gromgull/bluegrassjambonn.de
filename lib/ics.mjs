// Minimal RFC 5545 calendar writer.

const VTIMEZONE_BERLIN = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Berlin",
  "X-LIC-LOCATION:Europe/Berlin",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

const escapeText = (s) =>
  String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");

/** Fold lines longer than 75 octets (RFC 5545 §3.1). */
function fold(line) {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts = [];
  let current = "";
  let currentLen = 0;
  for (const ch of line) {
    const len = Buffer.byteLength(ch, "utf8");
    const limit = parts.length === 0 ? 75 : 74; // continuation lines start with a space
    if (currentLen + len > limit) {
      parts.push(current);
      current = "";
      currentLen = 0;
    }
    current += ch;
    currentLen += len;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

const localStamp = (date, time) => `${date.replace(/-/g, "")}T${time.replace(":", "")}00`;
const utcStamp = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function buildIcs(events, { calendarName, timezone, uidDomain, url }) {
  if (timezone !== "Europe/Berlin") {
    throw new Error("Only Europe/Berlin has a bundled VTIMEZONE; add one in lib/ics.mjs for other zones.");
  }
  const now = utcStamp(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Bluegrass Jam Bonn//Event Calendar//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    `X-WR-TIMEZONE:${timezone}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT12H",
    "X-PUBLISHED-TTL:PT12H",
    ...VTIMEZONE_BERLIN,
  ];

  for (const e of events) {
    const summary = e.cancelled ? `ABGESAGT: ${e.title}` : e.title;
    const description = [e.note, e.description, url].filter(Boolean).join("\n\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.id}@${uidDomain}`,
      `DTSTAMP:${now}`,
      e.updatedAt ? `LAST-MODIFIED:${utcStamp(new Date(e.updatedAt))}` : null,
      `SEQUENCE:${e.sequence ?? 0}`,
      `DTSTART;TZID=${timezone}:${localStamp(e.date, e.start)}`,
      `DTEND;TZID=${timezone}:${localStamp(e.endDate, e.end)}`,
      `SUMMARY:${escapeText(summary)}`,
      description ? `DESCRIPTION:${escapeText(description)}` : null,
      e.location ? `LOCATION:${escapeText(e.location)}` : null,
      url ? `URL:${url}` : null,
      `STATUS:${e.cancelled ? "CANCELLED" : "CONFIRMED"}`,
      "TRANSP:OPAQUE",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.filter(Boolean).map(fold).join("\r\n") + "\r\n";
}

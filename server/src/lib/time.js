'use strict';
/**
 * TIMEZONE & DATE HELPERS — the core defence against "month bleeding".
 *
 * Rules:
 *  - Every instant is stored as an ISO-8601 UTC string (occurred_at_utc).
 *  - Every grouping/sorting uses `local_date`, the calendar date in the
 *    USER'S IANA timezone, computed once at write time.
 *  - Reading code never calls getMonth()/getUTCFullYear() on raw dates.
 */

const TZ_ALIASES = {
  'india/new delhi': 'Asia/Kolkata',
  'india/delhi': 'Asia/Kolkata',
  'new delhi': 'Asia/Kolkata',
  'india': 'Asia/Kolkata',
  'ist': 'Asia/Kolkata',
  'calcutta': 'Asia/Kolkata',
  'asia/calcutta': 'Asia/Kolkata',
  'asia/kolkata': 'Asia/Kolkata',
  'gmt': 'UTC',
  'utc': 'UTC',
};

function normalizeTimezone(tz) {
  if (!tz || typeof tz !== 'string') return 'UTC';
  const clean = tz.trim();
  const lower = clean.toLowerCase();
  if (TZ_ALIASES[lower]) return TZ_ALIASES[lower];
  try {
    Intl.DateTimeFormat('en-US', { timeZone: clean });
    return clean;
  } catch {
    return 'UTC';
  }
}

/** Offset (minutes) of `tz` at instant `date` — DST-correct. */
function tzOffsetMinutes(date, tz) {
  const safeTz = normalizeTimezone(tz);
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: safeTz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(
    +p.year, p.month - 1, +p.day,
    p.hour === '24' ? 0 : +p.hour, +p.minute, +p.second
  );
  return Math.round((asUtc - date.getTime()) / 60000);
}

/** 'YYYY-MM-DD' of `date` as seen in `tz`. */
function localDateInTz(date, tz) {
  const safeTz = normalizeTimezone(tz);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);                                           // en-CA → YYYY-MM-DD
}

/**
 * Derive storage fields for an expense from the instant it happened.
 * @returns {{ occurredAtUtc: string, localDate: string, tzOffsetMinutes: number }}
 */
function resolveInstant(occurredAtIso, userTz) {
  const date = new Date(occurredAtIso);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid occurredAt timestamp');
  return {
    occurredAtUtc: date.toISOString(),
    localDate: localDateInTz(date, userTz),
    tzOffsetMinutes: tzOffsetMinutes(date, userTz),
  };
}

/** Inclusive [from, to] of a calendar month in plain local_date strings (no tz drift). */
function monthRange(year, month /* 1-12 */) {
  const pad = (n) => String(n).padStart(2, '0');
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(lastDay)}` };
}

/** Inclusive [from, to] of a calendar year. */
function yearRange(year) {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

module.exports = { normalizeTimezone, tzOffsetMinutes, localDateInTz, resolveInstant, monthRange, yearRange };

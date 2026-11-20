// Local leaderboard rules (Ticket-04 §3). Pure functions, shared by the server, the page and tests.
export const NAME_RE = /^[\p{L}\p{M}\p{N}_]{3,12}$/u; // [A-Za-z0-9_] plus Vietnamese letters (bonus)
export const MAX_ENTRIES = 10;

export function validEntry(e) {
  return !!e && typeof e.name === "string" && NAME_RE.test(e.name.normalize("NFC")) &&
    Number.isInteger(e.score) && e.score >= 0 && Number.isInteger(e.nights_won) && e.nights_won >= 0 && e.nights_won <= 3 &&
    typeof e.achieved_at === "string" && !Number.isNaN(Date.parse(e.achieved_at)) && Number.isInteger(e.seed);
}

// score desc; equal score -> whoever achieved it first stays above; keep top 10
export function insertEntry(entries, e) {
  if (!validEntry(e)) throw new Error("invalid leaderboard entry");
  const all = [...entries, { name: e.name.normalize("NFC"), score: e.score, nights_won: e.nights_won, achieved_at: e.achieved_at, seed: e.seed }];
  all.sort((a, b) => b.score - a.score || Date.parse(a.achieved_at) - Date.parse(b.achieved_at));
  return all.slice(0, MAX_ENTRIES);
}

// ISO 8601 with the local time-zone offset, e.g. 2026-11-20T15:04:05+07:00
export function isoWithZone(d = new Date()) {
  const pad = (n) => String(Math.abs(n)).padStart(2, "0");
  const off = -d.getTimezoneOffset();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${off >= 0 ? "+" : "-"}${pad(Math.trunc(off / 60))}:${pad(off % 60)}`;
}

const APP_NAMES: Record<string, string> = {
  offshoot: "OffShoot", foolcat: "FoolCat", editready: "EditReady", canister: "Canister",
};

/** A catalog app id as the operator knows it. */
export const appName = (id: string | null | undefined) => (id ? (APP_NAMES[id] ?? id) : "—");

/** Local 24-hour time: `02:14`, or `02:14:07` with seconds. */
export function clock(ts: string, seconds = false): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: "2-digit", minute: "2-digit", ...(seconds ? { second: "2-digit" } : {}), hourCycle: "h23",
  });
}

/** Local calendar day, `2026-09-23`. */
export function dayKey(ts: string | Date): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** `Today`, `Yesterday`, or `Mon 21 Sep`. */
export function dayLabel(key: string, now = new Date()): string {
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (key === dayKey(now)) return "Today";
  if (key === dayKey(yesterday)) return "Yesterday";
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

/** A time with its day when it is not today: `02:14`, `Yesterday 02:14`, `Mon 21 Sep 02:14`. */
export function when(ts: string): string {
  const label = dayLabel(dayKey(ts));
  return label === "Today" ? clock(ts) : `${label} ${clock(ts)}`;
}

/**
 * `when`, phrased to follow a verb mid-sentence ("… failed {whenPhrase(ts)}"): `at 02:14`,
 * `yesterday at 23:26`, or `on Mon 21 Sep at 23:26`. `when` itself stays for right-aligned times.
 */
export function whenPhrase(ts: string): string {
  const label = dayLabel(dayKey(ts));
  const time = clock(ts);
  if (label === "Today") return `at ${time}`;
  if (label === "Yesterday") return `yesterday at ${time}`;
  return `on ${label} at ${time}`;
}

/** `340 ms`, `1.2 s`, `2 min 5 s`, or null without an end. */
export function duration(start: string, end: string | null | undefined): string | null {
  if (!end) return null;
  const ms = Math.max(0, new Date(end).getTime() - new Date(start).getTime());
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)} min ${s % 60} s`;
}

export const plural = (n: number, word: string, many = `${word}s`) => (n === 1 ? word : many);

const PALETTE = ["#3b82f6", "#ea6a2e", "#34a853", "#14a3a3", "#7c5cf2", "#e0559b"];

/** Stable avatar color per conversation, so a chat keeps its color across reloads. */
export function colorFor(key: string): string {
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export function initialOf(title: string): string {
  return Array.from(title.trim())[0]?.toUpperCase() ?? "Z";
}

/** The backend stores naive UTC timestamps; read them as UTC. */
function parseServerDate(value: string): Date {
  return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`);
}

/** "Friday 7:48 AM" style stamp for the top of a conversation. */
export function formatStamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
  }).format(parseServerDate(value));
}

/** Short sidebar time: time today, weekday this week, otherwise a date. */
export function formatListTime(value: string, now = new Date()): string {
  const date = parseServerDate(value);
  const days = (now.getTime() - date.getTime()) / 86_400_000;

  if (date.toDateString() === now.toDateString()) {
    return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
  }

  if (days < 7) {
    return new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(date);
  }

  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

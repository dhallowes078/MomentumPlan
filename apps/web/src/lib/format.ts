export function priorityColor(p: number) {
  if (p >= 5) return "#a33b2d";
  if (p >= 4) return "#c45c26";
  if (p >= 3) return "#b7791f";
  if (p >= 2) return "#2f6b50";
  return "#4a5c52";
}

export function formatMinutes(m: number) {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

export function formatTime(iso: string | Date) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function formatDay(iso: string | Date) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

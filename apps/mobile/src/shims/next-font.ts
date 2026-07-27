/** Shim: next/font/google → CSS variables already set in index.html / globals. */
export function Outfit(_opts?: unknown) {
  return { className: "", variable: "--font-sans", style: {} };
}

export function Fraunces(_opts?: unknown) {
  return { className: "", variable: "--font-display", style: {} };
}

export default function stubFont() {
  return { className: "", variable: "--font-sans", style: {} };
}

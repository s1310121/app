export function fmt(x, digits = 4) {
  if (x === null || x === undefined) return "—";
  if (Number.isNaN(x)) return "NaN";
  return Number(x).toFixed(digits);
}

export function fmtPct(x, digits = 1) {
  if (x === null || x === undefined) return "—";
  return `${Number(x).toFixed(digits)}%`;
}

export function fmtBool(b) {
  return b ? "Yes" : "No";
}

export function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
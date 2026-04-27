// Escape an arbitrary string so it is safe to embed inside an HTML attribute
// value (e.g. `title="..."`). Covers the five characters that have special
// meaning in HTML attributes.
export function escapeHtmlAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Escape for HTML text content. Telegram's HTML mode only requires the first
// three replacements; quotes pass through fine in text nodes.
export function escapeHtmlText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

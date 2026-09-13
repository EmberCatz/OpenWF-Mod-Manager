import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({ gfm: true, breaks: false });

// Conservative allowlist — formatting only. No <img>: screenshots already
// have their own dedicated (Imgur-only) field, so allowing hotlinked images
// inside free-text descriptions too would just double the unaudited-image
// surface for no real benefit.
const ALLOWED_TAGS = ["p", "br", "strong", "em", "ul", "ol", "li", "a", "code", "pre", "blockquote", "h1", "h2", "h3", "h4", "hr"];

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noreferrer");
  }
});

// Renders a mod's description as sanitized, limited-feature Markdown —
// this is untrusted user content shown to every viewer of the mod, so an
// unsanitized renderer would be a stored-XSS hole (see
// docs/security-audit-2026-09.md). marked itself doesn't sanitize raw HTML
// (that option was removed upstream) — DOMPurify against the allowlist
// above is the actual security boundary here, not marked's output.
export function renderModDescription(text: string): string {
  const html = marked.parse(text, { async: false }) as string;
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR: ["href"] });
}

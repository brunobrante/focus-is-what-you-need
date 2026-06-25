// Sanitize externally-sourced SVG before we decompose it into our own nodes. We
// never use dangerouslySetInnerHTML — paths are re-rendered from parsed data — so
// the only real surface is anything executable that DOMParser might keep alive
// while we read attributes. Strip scripts, event handlers, and external refs.

const DANGEROUS_TAGS = new Set(["script", "foreignObject", "iframe", "image", "use", "a", "animate", "animatetransform", "set"]);

/** Parse + sanitize SVG markup. Returns the cleaned <svg> element, or null. */
export function sanitizeSvg(markup: string): SVGSVGElement | null {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(markup, "image/svg+xml");
  } catch {
    return null;
  }
  if (doc.querySelector("parsererror")) return null;
  const svg = doc.querySelector("svg");
  if (!svg) return null;

  const walk = (el: Element): void => {
    // Depth-first; collect children first since we may remove during iteration.
    for (const child of Array.from(el.children)) {
      if (DANGEROUS_TAGS.has(child.tagName.toLowerCase())) {
        child.remove();
        continue;
      }
      walk(child);
    }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      if (name.startsWith("on")) {
        el.removeAttribute(attr.name);
      } else if ((name === "href" || name === "xlink:href") && !value.startsWith("#")) {
        el.removeAttribute(attr.name);
      } else if (value.includes("javascript:")) {
        el.removeAttribute(attr.name);
      }
    }
  };
  walk(svg);
  return svg as SVGSVGElement;
}

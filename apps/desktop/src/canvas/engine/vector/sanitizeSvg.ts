// Sanitize externally-sourced SVG before we decompose it into our own nodes. We
// never use dangerouslySetInnerHTML — paths are re-rendered from parsed data — so
// the only real surface is anything executable that DOMParser might keep alive
// while we read attributes. Strip scripts, event handlers, and external refs.

const DANGEROUS_TAGS = new Set(["script", "style", "foreignobject", "iframe", "image", "use", "a", "animate", "animatetransform", "set"]);

// url(...) that does NOT point at a local #fragment — i.e. an external reference.
const EXTERNAL_URL_RE = /url\(\s*['"]?\s*(?!#)/i;

function localTagName(el: Element): string {
  // Match on the LOCAL name so namespaced tags (`svg:script`) can't slip past.
  return (el.localName || el.tagName).toLowerCase();
}

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
      if (DANGEROUS_TAGS.has(localTagName(child))) {
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
      } else if (EXTERNAL_URL_RE.test(value)) {
        // e.g. fill="url(https://evil/#x)" or style="fill:url(http://…)". Local
        // url(#gradient) refs are kept.
        el.removeAttribute(attr.name);
      }
    }
  };
  walk(svg);
  return svg as SVGSVGElement;
}

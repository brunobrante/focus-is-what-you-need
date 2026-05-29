export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read blob"));
    reader.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

export function waitForImage(img: HTMLImageElement): Promise<void> {
  return new Promise((resolve) => {
    if (img.complete && img.naturalWidth) {
      resolve();
      return;
    }
    img.addEventListener("load", () => resolve(), { once: true });
  });
}

export function measureImage(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 0, h: img.naturalHeight || 0 });
    img.onerror = () => reject(new Error("Could not measure image"));
    img.src = src;
  });
}

export function inferType(name: string): string {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "JPG";
  if (ext === "png") return "PNG";
  if (ext === "webp") return "WEBP";
  if (ext === "svg") return "SVG";
  if (ext === "gif") return "GIF";
  return "IMG";
}

export function shortComponentName(id: string) {
  return id.replace(/^c-/, "").slice(0, 4);
}

export function safeStackFileName(componentId: string): string {
  const base = componentId
    .trim()
    .replace(/[^a-zA-Z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || `component-${Date.now()}`}.png`;
}

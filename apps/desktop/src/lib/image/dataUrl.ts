// Canonical Blob/File → data-URL / base64 helpers. Previously reimplemented
// (byte-for-byte) in generate/engine/image.ts, lib/references/referenceThumbnails.ts,
// lib/utils.ts (as readFileAsDataUrl), and lib/references/blobStore/codec.ts.

/** Read a Blob (or File — File extends Blob) as a full `data:<type>;base64,<…>` URL. */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Could not read blob"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read blob"));
    reader.readAsDataURL(blob);
  });
}

/** Read a Blob as raw base64 with the `data:…,` prefix stripped. */
export async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await blobToDataUrl(blob);
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

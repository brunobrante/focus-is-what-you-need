// Classic-CV object segmentation for the "Adjust crop" tool — an alternative to
// SAM that suits UI elements (solid-colour buttons/pills on a contrasting
// background) far better than a model trained on natural photos. It estimates
// the background colour from the crop's border ring, then thresholds each pixel
// by its colour distance from that background (Otsu split) into a foreground
// mask. The caller traces the largest component's outline, so interior text
// holes are ignored. Framework-free and unit-tested — no canvas/DOM here.

/** Otsu's method over a 256-bin histogram; returns the threshold bin [0, 255]. */
export function otsuThreshold(histogram: number[], total: number): number {
  let sum = 0;
  for (let i = 0; i < 256; i += 1) sum += i * histogram[i];
  let sumB = 0;
  let wB = 0;
  let maxVar = -1;
  let threshold = 0;
  for (let t = 0; t < 256; t += 1) {
    wB += histogram[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * histogram[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) {
      maxVar = between;
      threshold = t;
    }
  }
  return threshold;
}

/** Median colour of the 1px border ring — the crop's likely background. */
function borderMedianColor(
  data: Uint8ClampedArray | Uint8Array,
  w: number,
  h: number,
): [number, number, number] {
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const push = (i: number) => {
    const o = i * 4;
    rs.push(data[o]);
    gs.push(data[o + 1]);
    bs.push(data[o + 2]);
  };
  for (let x = 0; x < w; x += 1) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y += 1) {
    push(y * w);
    push(y * w + (w - 1));
  }
  const median = (arr: number[]) => {
    arr.sort((a, b) => a - b);
    return arr[arr.length >> 1];
  };
  return [median(rs), median(gs), median(bs)];
}

/**
 * Foreground mask (255 = object) of the dominant element in an RGBA crop, by
 * colour distance from the border-estimated background with an Otsu threshold.
 * Returns null for an empty/short buffer.
 */
export function segmentByContrast(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): Uint8Array | null {
  const count = width * height;
  if (width <= 0 || height <= 0 || data.length < count * 4) return null;

  const bg = borderMedianColor(data, width, height);
  const dist = new Uint8Array(count);
  const hist = new Array<number>(256).fill(0);
  const maxDist = Math.sqrt(3) * 255;
  for (let i = 0; i < count; i += 1) {
    const o = i * 4;
    const dr = data[o] - bg[0];
    const dg = data[o + 1] - bg[1];
    const db = data[o + 2] - bg[2];
    const d = Math.sqrt(dr * dr + dg * dg + db * db);
    const v = Math.min(255, Math.round((d / maxDist) * 255));
    dist[i] = v;
    hist[v] += 1;
  }

  const threshold = otsuThreshold(hist, count);
  const mask = new Uint8Array(count);
  for (let i = 0; i < count; i += 1) mask[i] = dist[i] > threshold ? 255 : 0;
  return mask;
}

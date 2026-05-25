import { expect, test } from "bun:test";

import { intrinsicSvgSizeFromDataUrl } from "@/components/Snapshot";

test("reads intrinsic svg size from encoded snapshot data urls", () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="52" viewBox="0 0 60 52"></svg>`;
  const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

  expect(intrinsicSvgSizeFromDataUrl(dataUrl)).toEqual({ width: 60, height: 52 });
});

test("falls back to viewBox when svg width and height are absent", () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 32"></svg>`;
  const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

  expect(intrinsicSvgSizeFromDataUrl(dataUrl)).toEqual({ width: 48, height: 32 });
});

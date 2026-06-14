import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { IconWindow } from "@/components/icons";

import type { ComponentVariant, ProjectType, ScreenVariant } from "@/lib/data/types";
import { getInitialZoomForSubjectSize, type Size } from "@/canvas/engine/viewport";
import { useScene, useThumbnail } from "@/lib/storage/hooks";
import { graphJSONHasSnapshotContent } from "@/lib/storage/sceneSnapshots";
import type { SceneOwnerType } from "@/lib/storage/schema";

type ScreenSnapshotProps = {
  kind: "screen";
  // A screen's scene/snapshot is owned by its active variant.
  ownerType: SceneOwnerType;
  ownerId: string;
  variant: ScreenVariant;
  type: ProjectType;
  emptyMode?: "card" | "preview";
  display?: "fit" | "natural" | "card";
};

type ComponentSnapshotProps = {
  kind: "component";
  ownerType: SceneOwnerType;
  ownerId: string;
  seedKey: ComponentVariant | null;
  type: ProjectType;
  emptyMode?: "card" | "preview";
  display?: "fit" | "natural" | "card";
};

export type SnapshotProps = ScreenSnapshotProps | ComponentSnapshotProps;

export function Snapshot(props: SnapshotProps) {
  const { ownerType, ownerId } = props;
  const { data } = useThumbnail(ownerType, ownerId);
  const { data: scene, loading: sceneLoading } = useScene(ownerType, ownerId);
  const sceneIsEmpty = scene ? !graphJSONHasSnapshotContent(scene.graphJSON) : false;

  if (data && !sceneLoading && !sceneIsEmpty) {
    const display = props.display ?? "fit";
    const componentSize =
      props.kind === "component" && (display === "natural" || display === "card")
        ? intrinsicSvgSizeFromDataUrl(data.dataUrl)
        : null;

    if (display === "card" && componentSize) {
      return <CardSnapshotImage src={data.dataUrl} size={componentSize} />;
    }

    // "natural" mode: show at intrinsic/scaled size so small components appear
    // legible in preview panels where the image floats at its own size.
    const componentScale = componentSize ? getInitialZoomForSubjectSize(componentSize) : 1;
    const componentStyle =
      componentSize && componentScale > 1
        ? {
            width: componentSize.width * componentScale,
            height: componentSize.height * componentScale,
          }
        : undefined;
    return (
      <img
        src={data.dataUrl}
        alt=""
        className={
          display === "natural"
            ? "block h-auto w-auto max-h-full max-w-full object-contain"
            : "block h-full w-full object-contain"
        }
        style={componentStyle}
        draggable={false}
      />
    );
  }

  return props.emptyMode === "preview" ? (
    <EmptyPreviewPlaceholder kind={props.kind} />
  ) : (
    <EmptyCardPlaceholder type={props.type} kind={props.kind} />
  );
}

function CardSnapshotImage({ src, size }: { src: string; size: Size }) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const [hostSize, setHostSize] = useState<Size | null>(null);
  const scale = hostSize ? resolveSnapshotCardScale(size, hostSize) : 1;
  const imageStyle = useMemo<CSSProperties>(
    () => ({
      width: size.width * scale,
      height: size.height * scale,
    }),
    [scale, size.height, size.width],
  );

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const updateHostSize = () => {
      const next = {
        width: host.clientWidth,
        height: host.clientHeight,
      };
      setHostSize((current) =>
        current && current.width === next.width && current.height === next.height
          ? current
          : next,
      );
    };

    updateHostSize();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateHostSize);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  return (
    <span ref={hostRef} className="grid h-full w-full place-items-center overflow-hidden">
      <img
        src={src}
        alt=""
        className="block object-contain"
        style={imageStyle}
        draggable={false}
      />
    </span>
  );
}

export function resolveSnapshotCardScale(subjectSize: Size, hostSize: Size): number {
  const subjectWidth = Math.max(1, subjectSize.width);
  const subjectHeight = Math.max(1, subjectSize.height);
  const hostWidth = Math.max(1, hostSize.width);
  const hostHeight = Math.max(1, hostSize.height);
  const legibilityScale = getInitialZoomForSubjectSize({
    width: subjectWidth,
    height: subjectHeight,
  });
  const fitScale = Math.min(hostWidth / subjectWidth, hostHeight / subjectHeight);

  return Math.max(0.01, Math.min(legibilityScale, fitScale));
}

export function intrinsicSvgSizeFromDataUrl(dataUrl: string): Size | null {
  if (!dataUrl.startsWith("data:image/svg+xml")) return null;
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex < 0) return null;

  const rawSvg = dataUrl.slice(commaIndex + 1);
  const svg = dataUrl.includes(";base64,")
    ? decodeBase64(rawSvg)
    : decodeURIComponent(rawSvg);
  if (!svg) return null;

  const width = readSvgNumberAttribute(svg, "width");
  const height = readSvgNumberAttribute(svg, "height");
  if (width && height) return { width, height };

  const viewBox = svg.match(/\bviewBox=["']([^"']+)["']/i)?.[1];
  const parts = viewBox?.trim().split(/[\s,]+/).map(Number) ?? [];
  const viewBoxWidth = parts[2];
  const viewBoxHeight = parts[3];
  if (Number.isFinite(viewBoxWidth) && Number.isFinite(viewBoxHeight) && viewBoxWidth > 0 && viewBoxHeight > 0) {
    return { width: viewBoxWidth, height: viewBoxHeight };
  }

  return null;
}

function readSvgNumberAttribute(svg: string, attribute: "width" | "height"): number | null {
  const value = svg.match(new RegExp(`\\b${attribute}=["']([^"']+)["']`, "i"))?.[1];
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function decodeBase64(value: string): string | null {
  try {
    return globalThis.atob(value);
  } catch {
    return null;
  }
}

function EmptyPreviewPlaceholder({ kind }: { kind: SnapshotProps["kind"] }) {
  return (
    <div className="grid h-full w-full place-items-center text-center">
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-5">
        <span className="grid h-9 w-9 place-items-center rounded-full border border-[var(--border-strong)] text-[var(--text-faint)]">
          <IconWindow size={16} strokeWidth={1.6} />
        </span>
        <span className="text-[13px] font-medium text-[var(--text-muted)]">
          {kind === "screen" ? "Empty screen" : "Empty component"}
        </span>
      </div>
    </div>
  );
}

function EmptyCardPlaceholder({
  type,
}: {
  type: ProjectType;
  kind: SnapshotProps["kind"];
}) {
  return type === "mobile" ? <PhoneEmpty /> : type === "tablet" ? <TabletEmpty /> : <DesktopEmpty />;
}

function DesktopEmpty() {
  return (
    <div className="flex h-[72%] w-[82%] flex-col overflow-hidden rounded-md border border-[#2C2C2C] bg-[#161616]">
      <div className="flex h-7 items-center border-b border-[#2C2C2C] bg-[#1F1F1F] px-3">
        <i className="h-2 w-20 rounded-full bg-[#303030]" />
      </div>
      <div className="grid flex-1 gap-3 p-5">
        <i className="h-3 w-[58%] rounded-full bg-[#2D2D2D]" />
        <i className="h-2 w-[82%] rounded-full bg-[#252525]" />
        <i className="h-2 w-[68%] rounded-full bg-[#252525]" />
        <div className="mt-auto grid grid-cols-3 gap-2">
          <i className="h-10 rounded-md border border-[#262626] bg-[#1D1D1D]" />
          <i className="h-10 rounded-md border border-[#262626] bg-[#1D1D1D]" />
          <i className="h-10 rounded-md border border-[#262626] bg-[#1D1D1D]" />
        </div>
      </div>
    </div>
  );
}

function TabletEmpty() {
  return (
    <div className="flex h-[78%] w-[66%] flex-col overflow-hidden rounded-[12px] border border-[#2C2C2C] bg-[#161616] p-3">
      <div className="flex flex-1 flex-col gap-2 rounded-lg border border-[#262626] bg-[#181818] p-3">
        <i className="h-3 w-[62%] rounded-full bg-[#303030]" />
        <i className="h-2 w-[84%] rounded-full bg-[#252525]" />
        <i className="h-2 w-[52%] rounded-full bg-[#252525]" />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <i className="h-9 rounded-md bg-[#202020]" />
          <i className="h-9 rounded-md bg-[#202020]" />
        </div>
        <i className="mt-auto h-8 rounded-md bg-[#222222]" />
      </div>
    </div>
  );
}

function PhoneEmpty() {
  return (
    <div className="flex h-[82%] w-[86%] min-w-[122px] flex-col gap-2 overflow-hidden rounded-[12px] border border-[#2C2C2C] bg-[#181818] p-3">
      <i className="h-2.5 w-[68%] rounded-full bg-[#303030]" />
      <i className="h-1.5 w-[88%] rounded-full bg-[#252525]" />
      <i className="h-1.5 w-[56%] rounded-full bg-[#252525]" />
      <i className="mt-1 h-10 rounded-md bg-[#202020]" />
      <i className="h-8 rounded-md bg-[#202020]" />
      <i className="mt-auto h-7 rounded-md bg-[#222222]" />
    </div>
  );
}

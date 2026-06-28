import type { ReactNode } from "react";

const isDev = import.meta.env.DEV;

function isDesktop(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
  );
}

type DevWrapperProps = {
  /** Restrict to a platform. Omit for dev-only content (hidden in prod regardless of platform). */
  platform?: "desktop" | "web";
  /** Use block display instead of inline-block — for panels, sections, full-width areas. */
  block?: boolean;
  /**
   * Extra classes forwarded to the wrapper element even on the correct platform.
   * Use when the wrapper must carry positioning (e.g. "absolute bottom-5 left-1/2 -translate-x-1/2")
   * so absolutely-positioned children anchor to the correct parent.
   */
  className?: string;
  children: ReactNode;
};

/**
 * Platform + dev-mode visibility gate.
 *
 * Correct platform → always renders (prod or dev), no border.
 * Wrong platform + dev → renders with dashed amber outline and hover label.
 * Wrong platform + prod → null.
 * No platform (dev-only) + dev → renders with border.
 * No platform + prod → null.
 *
 * When `className` is provided, a real DOM wrapper is always emitted on the correct
 * platform too (needed when the wrapper must carry absolute/fixed positioning).
 */
export function DevWrapper({ platform, block, className, children }: DevWrapperProps) {
  const onDesktop = isDesktop();

  const isCorrectPlatform =
    (platform === "desktop" && onDesktop) || (platform === "web" && !onDesktop);

  if (isCorrectPlatform) {
    // On the right platform always show. If className was given we need a real
    // element so the positioning classes land somewhere.
    if (className) {
      const Tag = block ? "div" : "span";
      return <Tag className={className}>{children}</Tag>;
    }
    return <>{children}</>;
  }

  // Wrong platform or dev-only: hide in production.
  if (!isDev) return null;

  // Dev mode: show with an indicator.
  const label =
    platform === "desktop"
      ? "DEV MODE: only desktop"
      : platform === "web"
        ? "DEV MODE: only web"
        : "DEV MODE";
  return (
    <Outline label={label} block={block} className={className}>
      {children}
    </Outline>
  );
}

function Outline({
  label,
  block,
  className,
  children,
}: {
  label: string;
  block?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const Tag = block ? "div" : "span";
  const base = block
    ? "block min-h-full [outline-offset:-3px]"
    : "inline-block outline-offset-2";
  // An absolutely-positioned element is its own positioning context for children,
  // so skip `relative` when `className` already provides absolute/fixed/sticky.
  const posClass = className && /\b(absolute|fixed|sticky)\b/.test(className) ? "" : "relative";
  return (
    <Tag
      className={`group ${posClass} outline outline-2 outline-dashed outline-amber-500 ${base}${className ? ` ${className}` : ""}`}
    >
      {children}
      <span
        className={`pointer-events-none absolute z-50 whitespace-nowrap rounded bg-amber-500 px-2 py-1 text-[11px] font-medium leading-tight text-white opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100 ${block ? "left-1/2 top-2 -translate-x-1/2" : "bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2"}`}
      >
        {label}
        {!block && (
          <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-amber-500" />
        )}
      </span>
    </Tag>
  );
}

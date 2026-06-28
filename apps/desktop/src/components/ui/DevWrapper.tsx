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
  children: ReactNode;
};

/**
 * Hides children in production when the current platform doesn't match `platform`.
 * In dev mode, always renders children wrapped in a dashed outline; hover reveals a label.
 */
export function DevWrapper({ platform, block, children }: DevWrapperProps) {
  if (!isDev) return null;

  const onDesktop = isDesktop();

  if (platform === "desktop" && !onDesktop) {
    return <Outline label="Only dev mode - desktop only" block={block}>{children}</Outline>;
  }
  if (platform === "web" && onDesktop) {
    return <Outline label="Only dev mode - web only" block={block}>{children}</Outline>;
  }
  if (!platform) {
    return <Outline label="Only dev mode" block={block}>{children}</Outline>;
  }

  return <>{children}</>;
}

function Outline({ label, block, children }: { label: string; block?: boolean; children: ReactNode }) {
  const Tag = block ? "div" : "span";
  return (
    <Tag className={`group relative outline outline-2 outline-dashed outline-amber-500 ${block ? "block min-h-full [outline-offset:-3px]" : "inline-block outline-offset-2"}`}>
      {children}
      <span className={`pointer-events-none absolute z-50 whitespace-nowrap rounded bg-amber-500 px-2 py-1 text-[11px] font-medium leading-tight text-white opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100 ${block ? "left-1/2 top-2 -translate-x-1/2" : "bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2"}`}>
        {label}
        {!block && <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-amber-500" />}
      </span>
    </Tag>
  );
}

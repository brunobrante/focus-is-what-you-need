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
  children: ReactNode;
};

/**
 * Hides children in production when the current platform doesn't match `platform`.
 * In dev mode, always renders children wrapped in a dashed outline; hover reveals a label.
 */
export function DevWrapper({ platform, children }: DevWrapperProps) {
  if (!isDev) return null;

  const onDesktop = isDesktop();

  if (platform === "desktop" && !onDesktop) {
    return <Outline label="Only dev mode · desktop">{children}</Outline>;
  }
  if (platform === "web" && onDesktop) {
    return <Outline label="Only dev mode · web">{children}</Outline>;
  }
  if (!platform) {
    return <Outline label="Only dev mode">{children}</Outline>;
  }

  return <>{children}</>;
}

function Outline({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="group relative inline-block outline outline-2 outline-dashed outline-offset-2 outline-amber-500">
      {children}
      <span className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded bg-amber-500 px-2 py-1 text-[11px] font-medium leading-tight text-white opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100">
        {label}
        <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-amber-500" />
      </span>
    </span>
  );
}

import { IconSearch } from "@/components/icons";

/**
 * Toolbar affordance that opens the global search palette. The palette itself is
 * a single app-wide surface owned by `SearchProvider`; this button just calls
 * its `open()` action (wired by the caller).
 */
export function SearchToggle({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Search"
      className="grid h-6 w-6 cursor-pointer place-items-center rounded-md border-0 bg-transparent text-[var(--text-muted)] hover:bg-[#2A2A2A] hover:text-[var(--text)]"
    >
      <IconSearch size={13} strokeWidth={1.8} />
    </button>
  );
}

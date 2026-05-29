import type { ProjectTreeNode } from "./treeTypes";

export function BackFooter({
  parentNode,
  onBack,
}: {
  parentNode?: ProjectTreeNode | null;
  onBack?: () => void;
}) {
  if (!parentNode) return null;

  return (
    <button
      type="button"
      onClick={onBack}
      className="group flex w-full shrink-0 items-center gap-2 border-t border-[#2C2C2C] px-2.5 py-2 text-left transition-colors duration-[90ms] hover:bg-[#1E1E1E]"
    >
      <span className="grid h-5 w-5 shrink-0 place-items-center text-[#4A4A4A] transition-colors duration-[90ms] group-hover:text-[#CFCFCF]">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[10px] leading-none text-[#444] transition-colors duration-[90ms] group-hover:text-[#666]">
          Voltar para
        </span>
        <span className="truncate text-[12px] font-medium leading-none text-[#7A7A7A] transition-colors duration-[90ms] group-hover:text-[#CFCFCF]">
          {parentNode.name}
        </span>
      </span>

      <span className="shrink-0 text-[#3A3A3A] transition-colors duration-[90ms] group-hover:text-[#5A5A5A]">
        {parentNode.kind === "screen" ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8M12 17v4" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        )}
      </span>
    </button>
  );
}

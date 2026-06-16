import type { ProjectTreeNode } from "./treeTypes";
import { IconChevronLeft, IconGrid, IconScreen } from "@/components/icons";

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
      className="group flex w-full shrink-0 items-center gap-2 border-b border-[#2C2C2C] px-2.5 py-2 text-left transition-colors duration-[90ms] hover:bg-[#1E1E1E]"
    >
      <span className="grid h-5 w-5 shrink-0 place-items-center text-[#4A4A4A] transition-colors duration-[90ms] group-hover:text-[#CFCFCF]">
        <IconChevronLeft size={12} strokeWidth={2} />
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
          <IconScreen size={12} strokeWidth={1.7} />
        ) : (
          <IconGrid size={12} strokeWidth={1.7} />
        )}
      </span>
    </button>
  );
}

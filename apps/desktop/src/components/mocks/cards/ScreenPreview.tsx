import type { ProjectType } from "@/lib/data/types";

type Tpl = "hero" | "list" | "detail" | "form" | "profile";

const FRAME_STYLE_BY_TYPE: Record<ProjectType, React.CSSProperties> = {
  desktop: { maxWidth: 540, aspectRatio: "16 / 10" },
  tablet: { maxWidth: 360, aspectRatio: "4 / 5.5" },
  mobile: { maxWidth: 240, aspectRatio: "9 / 19.5" },
};

export function ScreenPreview({ tpl, type }: { tpl: Tpl; type: ProjectType }) {
  const isMobile = type === "mobile";
  return (
    <div
      className="flex w-full flex-col overflow-hidden rounded-[10px] border border-[var(--border-strong)] bg-[var(--bg)] shadow-[0_8px_32px_rgba(0,0,0,0.5),0_2px_8px_rgba(0,0,0,0.3)]"
      style={FRAME_STYLE_BY_TYPE[type]}
    >
      {!isMobile && type !== "tablet" && (
        <div className="flex h-7 items-center gap-1.5 border-b border-[var(--border)] bg-[#1A1A1A] px-3">
          <i className="h-[9px] w-[9px] rounded-full bg-[#2C2C2C]" />
          <i className="h-[9px] w-[9px] rounded-full bg-[#2A2A2A]" />
          <i className="h-[9px] w-[9px] rounded-full bg-[#2C2C2C]" />
        </div>
      )}
      <div className={`relative flex flex-1 flex-col overflow-hidden ${isMobile ? "gap-2.5 p-3.5" : "gap-3.5 px-7 py-6"}`}>
        <PvHeader mobile={isMobile} />
        <PvBody tpl={tpl} mobile={isMobile} />
        <PvFooter />
      </div>
    </div>
  );
}

function PvHeader({ mobile }: { mobile: boolean }) {
  return (
    <div
      className={`flex shrink-0 items-center justify-between rounded-lg bg-[#1F1F1F] ${mobile ? "px-3 py-2.5" : "px-[18px] py-3.5"}`}
    >
      <span className="h-6 w-6 rounded-md bg-white" />
      <div className="flex gap-3.5">
        {[0, 1, 2, 3].map((i) => (
          <i
            key={i}
            className={`block h-[7px] rounded-[2px] bg-[#2C2C2C] ${mobile ? "w-[18px]" : "w-9"}`}
          />
        ))}
      </div>
    </div>
  );
}

function PvFooter() {
  return (
    <div className="mt-auto flex shrink-0 gap-[18px] rounded-lg bg-[#1F1F1F] p-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex flex-1 flex-col gap-1.5">
          <i className="block h-[5px] w-[50%] rounded-[2px] bg-white" />
          <i className="block h-[5px] w-[80%] rounded-[2px] bg-[#2C2C2C]" />
          <i className="block h-[5px] w-[60%] rounded-[2px] bg-[#2C2C2C]" />
        </div>
      ))}
    </div>
  );
}

function PvBody({ tpl, mobile }: { tpl: Tpl; mobile: boolean }) {
  if (tpl === "hero") {
    return (
      <>
        <PvHero mobile={mobile} />
        <PvCards mobile={mobile} />
      </>
    );
  }
  if (tpl === "list") return <PvCards mobile={mobile} large />;
  if (tpl === "detail") {
    return (
      <>
        <PvHero mobile={mobile} />
        <PvForm fields={2} />
      </>
    );
  }
  if (tpl === "form") return <PvForm fields={3} />;
  if (tpl === "profile")
    return (
      <>
        <PvHero mobile={mobile} compact />
        <PvForm fields={1} />
      </>
    );
  return null;
}

function PvHero({ mobile, compact = false }: { mobile: boolean; compact?: boolean }) {
  return (
    <div
      className={`flex shrink-0 flex-col items-start gap-2.5 rounded-[10px] bg-[linear-gradient(135deg,#1f1f1f,#161616)] ${mobile ? "p-[18px]" : compact ? "p-5" : "p-7"}`}
    >
      <i className="block h-[18px] w-[60%] rounded bg-white" />
      <i className="block h-2 w-[80%] rounded bg-[#2C2C2C]" />
      {!compact && <i className="block h-2 w-[70%] rounded bg-[#2C2C2C]" />}
      <i className="mt-1.5 block h-7 w-20 rounded-md bg-white" />
    </div>
  );
}

function PvCards({ mobile, large = false }: { mobile: boolean; large?: boolean }) {
  const cols = mobile ? 2 : 3;
  return (
    <div
      className="grid shrink-0 gap-2.5"
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
    >
      {Array.from({ length: large ? 6 : 3 }).map((_, i) => (
        <div
          key={i}
          className="flex aspect-[4/3] flex-col justify-end gap-1 rounded-md bg-[#1F1F1F] p-2.5"
        >
          <i className="block h-2 w-[70%] rounded-[2px] bg-white" />
          <i className="block h-1.5 w-[50%] rounded-[2px] bg-[#2C2C2C]" />
        </div>
      ))}
    </div>
  );
}

function PvForm({ fields }: { fields: number }) {
  return (
    <div className="flex shrink-0 flex-col gap-2.5 rounded-lg bg-[#1F1F1F] p-[18px]">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="flex flex-col gap-[5px]">
          <i className="block h-1.5 w-[30%] rounded-[2px] bg-[#2C2C2C]" />
          <i className="block h-7 rounded border border-[#2C2C2C] bg-[#161616]" />
        </div>
      ))}
    </div>
  );
}

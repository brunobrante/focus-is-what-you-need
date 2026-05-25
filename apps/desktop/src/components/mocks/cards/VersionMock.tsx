import type { ScreenVersion } from "@/lib/data/screenVersions";

type Tpl = ScreenVersion["tpl"];

export function VersionMock({ tpl }: { tpl: Tpl }) {
  return (
    <div className="flex h-full w-full flex-col gap-1.5 p-2">
      <div className="flex items-center justify-between rounded-[3px] bg-[#1F1F1F] px-2 py-1.5">
        <span className="h-2 w-2 rounded-[2px] bg-white" />
        <div className="flex gap-1">
          <i className="h-1 w-3 rounded-[1px] bg-[#2C2C2C]" />
          <i className="h-1 w-3 rounded-[1px] bg-[#2C2C2C]" />
          <i className="h-1 w-3 rounded-[1px] bg-[#2C2C2C]" />
        </div>
      </div>
      <Body tpl={tpl} />
    </div>
  );
}

function Body({ tpl }: { tpl: Tpl }) {
  if (tpl === "hero") {
    return (
      <>
        <div className="flex flex-col gap-1 rounded-[3px] bg-[linear-gradient(135deg,#1f1f1f,#161616)] p-2">
          <i className="h-1.5 w-[55%] rounded-[1px] bg-white" />
          <i className="h-1 w-[80%] rounded-[1px] bg-[#2C2C2C]" />
          <i className="h-1 w-[65%] rounded-[1px] bg-[#2C2C2C]" />
          <i className="mt-1 h-2 w-6 rounded-[2px] bg-white" />
        </div>
        <div className="grid grid-cols-3 gap-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="aspect-square rounded-[2px] bg-[#1F1F1F]" />
          ))}
        </div>
      </>
    );
  }
  if (tpl === "list") {
    return (
      <div className="flex flex-1 flex-col gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-1.5 rounded-[2px] bg-[#1F1F1F] p-1.5">
            <div className="h-3 w-3 rounded-[1px] bg-[#2C2C2C]" />
            <div className="flex flex-1 flex-col gap-0.5">
              <i className="h-1 w-[50%] rounded-[1px] bg-white" />
              <i className="h-1 w-[70%] rounded-[1px] bg-[#2C2C2C]" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (tpl === "detail") {
    return (
      <>
        <div className="h-6 rounded-[2px] bg-[linear-gradient(135deg,#2a2a2a,#1a1a1a)]" />
        <div className="flex flex-col gap-1 rounded-[3px] bg-[#1F1F1F] p-2">
          <i className="h-1.5 w-[50%] rounded-[1px] bg-white" />
          <i className="h-1 w-[80%] rounded-[1px] bg-[#2C2C2C]" />
          <i className="h-1 w-[65%] rounded-[1px] bg-[#2C2C2C]" />
        </div>
      </>
    );
  }
  if (tpl === "form") {
    return (
      <div className="flex flex-1 flex-col gap-1.5 rounded-[3px] bg-[#1F1F1F] p-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-0.5">
            <i className="h-1 w-[25%] rounded-[1px] bg-[#2C2C2C]" />
            <div className="h-3 rounded-[2px] border border-[#2C2C2C] bg-[#161616]" />
          </div>
        ))}
        <i className="mt-1 h-2 w-8 rounded-[2px] bg-white" />
      </div>
    );
  }
  return (
    <div className="flex flex-1 flex-col gap-1">
      <div className="flex items-center gap-1.5 rounded-[2px] bg-[#1F1F1F] p-1.5">
        <div className="h-3 w-3 rounded-full bg-white" />
        <div className="flex flex-1 flex-col gap-0.5">
          <i className="h-1 w-[60%] rounded-[1px] bg-white" />
          <i className="h-1 w-[40%] rounded-[1px] bg-[#2C2C2C]" />
        </div>
      </div>
      <i className="h-1 w-[80%] rounded-[1px] bg-[#2C2C2C]" />
      <i className="h-1 w-[60%] rounded-[1px] bg-[#2C2C2C]" />
    </div>
  );
}

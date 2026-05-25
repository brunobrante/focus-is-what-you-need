import type { ComponentVariant } from "@/lib/data/types";

export function ComponentMock({ variant }: { variant: ComponentVariant }) {
  switch (variant) {
    case "cheader":
      return (
        <div className="flex w-full items-center justify-between rounded-md bg-[#1F1F1F] px-3 py-2.5">
          <span className="block h-[18px] w-[18px] rounded bg-white" />
          <div className="flex gap-2">
            <i className="block h-1.5 w-[26px] rounded-[2px] bg-[#2C2C2C]" />
            <i className="block h-1.5 w-[26px] rounded-[2px] bg-[#2C2C2C]" />
            <i className="block h-1.5 w-[26px] rounded-[2px] bg-[#2C2C2C]" />
          </div>
        </div>
      );
    case "chero":
      return (
        <div className="flex w-full flex-col items-start gap-1.5 rounded-md bg-[#1F1F1F] p-[18px]">
          <i className="block h-[11px] w-[70%] rounded-[3px] bg-white" />
          <i className="block h-2 w-[90%] rounded-[3px] bg-[#2C2C2C]" />
          <i className="block h-2 w-[90%] rounded-[3px] bg-[#2C2C2C]" />
          <i className="mt-1 block h-[18px] w-10 rounded bg-white" />
        </div>
      );
    case "cbtn":
      return (
        <div className="flex w-full items-center justify-center gap-1.5 p-3.5">
          <i className="block h-[22px] w-[60px] rounded bg-white" />
          <i className="block h-[22px] w-[60px] rounded border border-[#2C2C2C] bg-transparent" />
          <i className="block h-[22px] w-7 rounded border border-[#2C2C2C] bg-transparent" />
        </div>
      );
    case "cinput":
      return (
        <div className="flex w-full flex-col gap-1.5 p-3.5">
          <i className="block h-[5px] w-[30%] rounded-[2px] bg-[#2C2C2C]" />
          <i className="block h-[22px] w-full rounded border border-[#2C2C2C] bg-transparent" />
        </div>
      );
    case "ccards":
      return (
        <div className="grid w-full grid-cols-2 gap-1.5">
          <div className="h-9 rounded bg-[#1F1F1F]" />
          <div className="h-9 rounded bg-[#1F1F1F]" />
          <div className="h-9 rounded bg-[#1F1F1F]" />
          <div className="h-9 rounded bg-[#1F1F1F]" />
        </div>
      );
    case "csidebar":
      return (
        <div className="flex w-full items-stretch gap-1.5 p-1.5" style={{ height: 100 }}>
          <div className="flex w-[28%] flex-col gap-1 rounded bg-[#1F1F1F] p-2">
            <i className="block h-[5px] w-full rounded-[2px] bg-white" />
            <i className="block h-[5px] w-[80%] rounded-[2px] bg-[#2C2C2C]" />
            <i className="block h-[5px] w-[60%] rounded-[2px] bg-[#2C2C2C]" />
            <i className="block h-[5px] w-[70%] rounded-[2px] bg-[#2C2C2C]" />
          </div>
          <div className="flex-1 rounded border border-dashed border-[#2C2C2C]" />
        </div>
      );
    case "cmodal":
      return (
        <div className="grid w-full place-items-center p-[18px]">
          <div className="flex w-[70%] flex-col gap-1 rounded-md border border-[#2C2C2C] bg-[#1F1F1F] p-2">
            <i className="block h-1.5 w-[50%] rounded-[2px] bg-white" />
            <i className="block h-1 w-full rounded-[2px] bg-[#2C2C2C]" />
            <i className="block h-1 w-full rounded-[2px] bg-[#2C2C2C]" />
          </div>
        </div>
      );
    case "cfooter":
      return (
        <div className="flex w-full gap-4 rounded-md bg-[#1F1F1F] p-3.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-1 flex-col gap-1">
              <i className="block h-[5px] w-[50%] rounded-[2px] bg-[#3A3A3A]" />
              <i className="block h-[5px] w-[80%] rounded-[2px] bg-[#2C2C2C]" />
              <i className="block h-[5px] w-[60%] rounded-[2px] bg-[#2C2C2C]" />
            </div>
          ))}
        </div>
      );
  }
}

import type { ScreenVariant } from "@/lib/data/types";

export function ScreenMock({ variant }: { variant: ScreenVariant }) {
  return (
    <div className="flex h-[86%] w-[86%] flex-col overflow-hidden rounded-md border border-[#232323] bg-[#161616]">
      <div className="flex h-[14%] items-center gap-1 border-b border-[#232323] bg-[#1F1F1F] px-2">
        <i className="block h-1.5 w-1.5 rounded-full bg-[#2D2D2D]" />
        <i className="block h-1.5 w-1.5 rounded-full bg-[#2D2D2D]" />
        <i className="block h-1.5 w-1.5 rounded-full bg-[#2D2D2D]" />
      </div>
      <ScreenBody variant={variant} />
    </div>
  );
}

function Row({ width }: { width?: string }) {
  return <div className="h-2 rounded-[3px] bg-[#1F1F1F]" style={{ width }} />;
}
function Block() {
  return <div className="min-h-[30px] flex-1 rounded bg-[#1F1F1F]" />;
}

function ScreenBody({ variant }: { variant: ScreenVariant }) {
  return (
    <div className="flex flex-1 flex-col gap-1.5 p-2">
      {variant === "hero" && (
        <>
          <Row width="70%" />
          <Row width="40%" />
          <Block />
        </>
      )}
      {variant === "list" && (
        <>
          <Row width="70%" />
          <Row />
          <Row />
          <Row width="40%" />
        </>
      )}
      {variant === "detail" && (
        <>
          <Block />
          <Row width="70%" />
          <Row width="40%" />
        </>
      )}
      {variant === "form" && (
        <>
          <Row width="40%" />
          <Row />
          <Row width="40%" />
          <Row />
        </>
      )}
      {variant === "profile" && (
        <>
          <div className="grid flex-1 grid-cols-2 gap-1.5">
            <div className="rounded bg-[#1F1F1F]" />
            <div className="rounded bg-[#1F1F1F]" />
          </div>
          <Row width="70%" />
        </>
      )}
      {variant === "blank" && null}
    </div>
  );
}

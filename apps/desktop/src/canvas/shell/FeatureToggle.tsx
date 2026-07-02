// A labelled switch row used in canvas side panels (the tabs panel and the
// preview launcher). Extracted from two byte-identical copies (D7).
export function FeatureToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex h-7 w-full items-center justify-between rounded-md border border-[#2C2C2C] bg-[#202020] px-2.5 text-left text-[11px] font-medium text-[#CFCFCF] transition-colors duration-100 hover:bg-[#282828]"
    >
      <span>{label}</span>
      <span
        className={[
          "relative h-[16px] w-[30px] shrink-0 rounded-full border transition-colors duration-100",
          checked ? "border-[#0D99FF]/50 bg-[#0D99FF]/30" : "border-[#3A3A3A] bg-[#141414]",
        ].join(" ")}
      >
        <span
          className="absolute left-[2px] top-1/2 h-[10px] w-[10px] rounded-full bg-[#D8D8D8] transition-transform duration-100"
          style={{ transform: checked ? "translate(16px, -50%)" : "translate(0, -50%)" }}
        />
      </span>
    </button>
  );
}

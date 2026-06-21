export function Switch({
  checked,
  ariaLabel,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  ariaLabel: string;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={[
        "inline-flex shrink-0 items-center",
        disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer",
      ].join(" ")}
    >
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span
        className={[
          "relative h-6 w-11 rounded-full border transition-colors",
          checked
            ? "border-[#5b6cff] bg-[#5b6cff]"
            : "border-[var(--border-strong)] bg-[var(--surface)]",
        ].join(" ")}
      >
        <span
          className="absolute top-1/2 h-[18px] w-[18px] rounded-full bg-white transition-transform"
          style={{ transform: `translate(${checked ? 21 : 3}px, -50%)` }}
        />
      </span>
    </label>
  );
}

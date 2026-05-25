type Kind = "hero" | "cards" | "form" | "dash" | "type";

export function ReferenceMock({
  bg,
  accent,
  kind,
  source,
}: {
  bg: string;
  accent: string;
  kind: Kind;
  source?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 600 450"
      preserveAspectRatio="xMidYMid slice"
      className="block h-full w-full"
    >
      <rect width="600" height="450" fill={bg} />
      {kind === "hero" && <HeroBlock accent={accent} />}
      {kind === "cards" && <CardsBlock accent={accent} />}
      {kind === "form" && <FormBlock accent={accent} />}
      {kind === "dash" && <DashBlock accent={accent} />}
      {kind === "type" && <TypeBlock accent={accent} />}
      {source ? (
        <text
          x="40"
          y="430"
          fontFamily="ui-monospace,SFMono-Regular,Menlo,monospace"
          fontSize="11"
          fill={accent}
          opacity="0.55"
        >
          {source}
        </text>
      ) : null}
    </svg>
  );
}

function HeroBlock({ accent }: { accent: string }) {
  return (
    <>
      <rect x="40" y="36" width="520" height="40" rx="6" fill={accent} opacity="0.16" />
      <rect x="40" y="120" width="320" height="22" rx="4" fill={accent} />
      <rect x="40" y="156" width="420" height="10" rx="3" fill={accent} opacity="0.5" />
      <rect x="40" y="174" width="380" height="10" rx="3" fill={accent} opacity="0.5" />
      <rect x="40" y="208" width="120" height="36" rx="6" fill={accent} />
      <rect x="40" y="290" width="160" height="100" rx="6" fill={accent} opacity="0.18" />
      <rect x="220" y="290" width="160" height="100" rx="6" fill={accent} opacity="0.18" />
      <rect x="400" y="290" width="160" height="100" rx="6" fill={accent} opacity="0.18" />
    </>
  );
}

function CardsBlock({ accent }: { accent: string }) {
  return (
    <>
      <rect x="40" y="36" width="520" height="40" rx="6" fill={accent} opacity="0.16" />
      <rect x="40" y="110" width="160" height="120" rx="8" fill={accent} opacity="0.20" />
      <rect x="220" y="110" width="160" height="120" rx="8" fill={accent} opacity="0.20" />
      <rect x="400" y="110" width="160" height="120" rx="8" fill={accent} opacity="0.20" />
      <rect x="40" y="250" width="160" height="120" rx="8" fill={accent} opacity="0.20" />
      <rect x="220" y="250" width="160" height="120" rx="8" fill={accent} opacity="0.20" />
      <rect x="400" y="250" width="160" height="120" rx="8" fill={accent} opacity="0.20" />
    </>
  );
}

function FormBlock({ accent }: { accent: string }) {
  return (
    <>
      <rect x="40" y="36" width="520" height="40" rx="6" fill={accent} opacity="0.16" />
      <rect x="120" y="120" width="360" height="14" rx="3" fill={accent} />
      <rect x="120" y="160" width="80" height="10" rx="3" fill={accent} opacity="0.6" />
      <rect x="120" y="180" width="360" height="38" rx="6" fill={accent} opacity="0.18" />
      <rect x="120" y="234" width="80" height="10" rx="3" fill={accent} opacity="0.6" />
      <rect x="120" y="254" width="360" height="38" rx="6" fill={accent} opacity="0.18" />
      <rect x="120" y="308" width="80" height="10" rx="3" fill={accent} opacity="0.6" />
      <rect x="120" y="328" width="360" height="38" rx="6" fill={accent} opacity="0.18" />
      <rect x="120" y="384" width="120" height="36" rx="6" fill={accent} />
    </>
  );
}

function TypeBlock({ accent }: { accent: string }) {
  return (
    <>
      <text x="40" y="160" fontFamily="Georgia,serif" fontSize="120" fontWeight="700" fill={accent}>
        Aa
      </text>
      <rect x="40" y="220" width="220" height="10" rx="3" fill={accent} opacity="0.6" />
      <rect x="40" y="240" width="380" height="8" rx="3" fill={accent} opacity="0.4" />
      <rect x="40" y="258" width="320" height="8" rx="3" fill={accent} opacity="0.4" />
      <rect x="40" y="320" width="120" height="60" rx="6" fill={accent} opacity="0.18" />
      <rect x="180" y="320" width="120" height="60" rx="6" fill={accent} opacity="0.18" />
      <rect x="320" y="320" width="120" height="60" rx="6" fill={accent} opacity="0.18" />
    </>
  );
}

function DashBlock({ accent }: { accent: string }) {
  return (
    <>
      <rect x="20" y="20" width="120" height="380" rx="8" fill={accent} opacity="0.10" />
      <rect x="36" y="46" width="80" height="10" rx="3" fill={accent} opacity="0.6" />
      <rect x="36" y="68" width="60" height="8" rx="3" fill={accent} opacity="0.4" />
      <rect x="36" y="88" width="60" height="8" rx="3" fill={accent} opacity="0.4" />
      <rect x="160" y="36" width="200" height="60" rx="8" fill={accent} opacity="0.18" />
      <rect x="380" y="36" width="200" height="60" rx="8" fill={accent} opacity="0.18" />
      <rect x="160" y="116" width="420" height="180" rx="8" fill={accent} opacity="0.14" />
      <rect x="160" y="316" width="200" height="84" rx="8" fill={accent} opacity="0.18" />
      <rect x="380" y="316" width="200" height="84" rx="8" fill={accent} opacity="0.18" />
    </>
  );
}

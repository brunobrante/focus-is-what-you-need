const LOGO_COLORS = [
  "#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ef4444", "#14b8a6",
];

export function projectLogoColor(name: string): string {
  const idx = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % LOGO_COLORS.length;
  return LOGO_COLORS[idx]!;
}

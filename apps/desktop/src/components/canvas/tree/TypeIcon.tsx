import type { NodeType } from "./treeTypes";

export function TypeIcon({ type, hasChildren }: { type: NodeType; hasChildren?: boolean }) {
  const common = {
    width: 14,
    height: 14,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (hasChildren) {
    return (
      <svg {...common}>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    );
  }

  switch (type) {
    case "frame":
    case "component":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
        </svg>
      );
    case "text":
      return (
        <svg {...common}>
          <path d="M5 6h14" />
          <path d="M12 6v13" />
          <path d="M9 19h6" />
        </svg>
      );
    case "image":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
      );
    case "ellipse":
      return (
        <svg {...common}>
          <ellipse cx="12" cy="12" rx="9" ry="6" />
        </svg>
      );
    case "line":
      return (
        <svg {...common}>
          <line x1="5" y1="19" x2="19" y2="5" />
          <path d="M14 5h5v5" />
        </svg>
      );
    case "pen":
      return (
        <svg {...common}>
          <path d="M4 20c2-1 4-2 6-5s4-8 7-11" />
          <path d="M17 4l3 3" />
          <circle cx="4" cy="20" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      );
  }
}

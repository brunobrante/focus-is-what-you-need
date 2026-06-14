import type { NodeType } from "./treeTypes";

export function TypeIcon({
  type,
  hasChildren,
  linked,
}: {
  type: NodeType;
  hasChildren?: boolean;
  linked?: boolean;
}) {
  // A linked component instance ("external component") gets its own diamond-cluster
  // glyph, tinted by the row (purple). It is fill-based, so it uses currentColor.
  if (linked) {
    return (
      <svg width={14} height={14} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M8 5.83824L6.66041 4.5L8 3.16176L9.33959 4.5L8 5.83824ZM7.56946 2.17837L5.6796 4.06632C5.44013 4.30554 5.44013 4.69446 5.6796 4.93368L7.56946 6.82163C7.80753 7.05946 8.19247 7.05946 8.43054 6.82163L10.3204 4.93368C10.5599 4.69446 10.5599 4.30554 10.3204 4.06632L8.43054 2.17837C8.19247 1.94054 7.80753 1.94054 7.56946 2.17837ZM10.1618 8L11.5 6.66041L12.8382 8L11.5 9.33959L10.1618 8ZM9.17837 8.43054L11.0663 10.3204C11.3055 10.5599 11.6945 10.5599 11.9337 10.3204L13.8216 8.43054C14.0595 8.19247 14.0595 7.80753 13.8216 7.56946L11.9337 5.6796C11.6945 5.44013 11.3055 5.44013 11.0663 5.6796L9.17837 7.56946C8.94054 7.80753 8.94054 8.19247 9.17837 8.43054ZM6.66041 11.5L8 12.8382L9.33959 11.5L8 10.1618L6.66041 11.5ZM5.6796 11.0663L7.56946 9.17837C7.80753 8.94054 8.19247 8.94054 8.43054 9.17837L10.3204 11.0663C10.5599 11.3055 10.5599 11.6945 10.3204 11.9337L8.43054 13.8216C8.19247 14.0595 7.80753 14.0595 7.56946 13.8216L5.6796 11.9337C5.44013 11.6945 5.44013 11.3055 5.6796 11.0663ZM3.16176 8L4.5 6.66041L5.83824 8L4.5 9.33959L3.16176 8ZM2.17837 8.43054L4.06632 10.3204C4.30554 10.5599 4.69446 10.5599 4.93368 10.3204L6.82163 8.43054C7.05946 8.19247 7.05946 7.80753 6.82163 7.56946L4.93368 5.6796C4.69446 5.44013 4.30554 5.44013 4.06632 5.6796L2.17837 7.56946C1.94054 7.80753 1.94054 8.19247 2.17837 8.43054Z"
          fill="currentColor"
        />
      </svg>
    );
  }

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
    case "rect":
      return (
        <svg {...common}>
          <rect x="2" y="5" width="20" height="14" rx="2" />
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
    case "icon":
      return (
        <svg {...common}>
          <path d="M12 3.5l2.64 5.35 5.91.86-4.27 4.16 1.01 5.88L12 16.98l-5.29 2.77 1.01-5.88-4.27-4.16 5.91-.86L12 3.5z" />
        </svg>
      );
    case "ellipse":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
        </svg>
      );
    case "line":
      return (
        <svg {...common}>
          <line x1="5" y1="19" x2="19" y2="5" />
          <path d="M14 5h5v5" />
        </svg>
      );
    case "arrow":
      return (
        <svg {...common}>
          <path d="M3 12H21M14 5L21 12L14 19" />
        </svg>
      );
    case "polygon":
      return (
        <svg {...common}>
          <polygon points="12 3 21 8.5 17.5 21 6.5 21 3 8.5" />
        </svg>
      );
    case "star":
      return (
        <svg {...common}>
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
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

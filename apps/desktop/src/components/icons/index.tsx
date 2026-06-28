export interface IconProps {
  size?: number
  className?: string
  strokeWidth?: number
}

import type { ReactNode } from "react"
import {
  Star, Hand, Pen, SquarePen, PenLine, Type, Image as ImageIcon, Plus, Minus, X,
  ChevronLeft, ChevronDown, ChevronUp, ChevronsDown, Check,
  Settings, Trash2, Eye, EyeOff, LayoutGrid, Search, Maximize2, Minimize2,
  Monitor, Mic, Wand2, Undo2, SquareCheck, Globe, FileText, Smartphone,
  Play, Upload, Zap, Sparkles, CircleCheck, Lock, Unlock,
  MoreHorizontal, MoreVertical, RotateCcw, Paperclip, Hexagon, Copy,
  ZoomIn, Crosshair, PanelRight, Layers, History, Folder, Video,
  Database, Clock, Shield, ExternalLink, CirclePlus, Link, Unlink,
} from "lucide-react"

function BaseIcon({
  size = 18,
  className,
  strokeWidth = 1.6,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
      {children}
    </svg>
  )
}

// ── Canvas tool icons ──────────────────────────────────────────────────────────

export function IconCursor({ size = 18, className }: IconProps) {
  return (
    <BaseIcon size={size} className={className} strokeWidth={1.6}>
      <path d="M5 3 L5 18 L9.2 14.2 L11.6 19.6 L13.6 18.7 L11.2 13.4 L17 13.4 Z" fill="currentColor" stroke="none" />
    </BaseIcon>
  )
}

export function IconHand({ size = 20, className, strokeWidth = 1.6 }: IconProps) {
  return <Hand size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconScale({ size = 18, className }: IconProps) {
  return (
    <BaseIcon size={size} className={className} strokeWidth={1.6}>
      <path d="M5 5h6M5 5v6M5 5l6 6" />
      <rect x="11" y="11" width="8" height="8" rx="1" />
    </BaseIcon>
  )
}

export function IconWrapper({ size = 18, className }: IconProps) {
  return (
    <BaseIcon size={size} className={className} strokeWidth={1.6}>
      <path d="M7 3v18M17 3v18M3 7h18M3 17h18" />
    </BaseIcon>
  )
}

export function IconRectangle({ size = 18, className, strokeWidth = 1.6 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} className={className}>
      <rect x="4" y="5" width="16" height="14" rx="1.5" />
    </svg>
  )
}

export function IconRadius({ size = 18, className, strokeWidth = 1.6 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M 5 5 L 5 19 L 19 19 A 14 14 0 0 0 5 5" />
    </svg>
  )
}

export function IconEllipse({ size = 18, className, strokeWidth = 1.6 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} className={className}>
      <ellipse cx="12" cy="12" rx="8" ry="7" />
    </svg>
  )
}

export function IconLine({ size = 18, className, strokeWidth = 1.6 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" className={className}>
      <line x1="5" y1="19" x2="19" y2="5" />
    </svg>
  )
}

export function IconArrow({ size = 18, className, strokeWidth = 1.6 }: IconProps) {
  return (
    <BaseIcon size={size} className={className} strokeWidth={strokeWidth}>
      <line x1="5" y1="19" x2="19" y2="5" />
      <path d="M14 5h5v5" />
    </BaseIcon>
  )
}

export function IconPolygon({ size = 18, className, strokeWidth = 1.6 }: IconProps) {
  return <Hexagon size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconStar({ size = 18, className, strokeWidth = 1.6 }: IconProps) {
  return <Star size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconPen({ size = 18, className, strokeWidth = 1.6 }: IconProps) {
  return <Pen size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconPencil({ size = 18, className, strokeWidth = 1.6 }: IconProps) {
  return <SquarePen size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconText({ size = 18, className, strokeWidth = 1.6 }: IconProps) {
  return <Type size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconImage({ size = 18, className, strokeWidth = 1.6 }: IconProps) {
  return <ImageIcon size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconSvgShape({ size = 18, className, strokeWidth = 1.6 }: IconProps) {
  return (
    <BaseIcon size={size} className={className} strokeWidth={strokeWidth}>
      <path d="M12 2l3.5 6.5H20l-4.5 4 1.8 6.5L12 15.5 6.7 19l1.8-6.5L4 8.5h4.5Z" />
    </BaseIcon>
  )
}

// ── Common UI icons ────────────────────────────────────────────────────────────

export function IconPlus({ size = 14, className, strokeWidth = 2 }: IconProps) {
  return <Plus size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconMinus({ size = 13, className, strokeWidth = 1.8 }: IconProps) {
  return <Minus size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconClose({ size = 11, className, strokeWidth = 2 }: IconProps) {
  return <X size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconChevronLeft({ size = 12, className, strokeWidth = 2 }: IconProps) {
  return <ChevronLeft size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconChevronDown({ size = 9, className, strokeWidth = 2.2 }: IconProps) {
  return <ChevronDown size={size} className={className} strokeWidth={strokeWidth} />
}

/** Tiny fill-based dropdown chevron for toolbar button dropdowns (6×4 viewBox). */
export function IconChevronDownFill({ className }: { className?: string }) {
  return (
    <svg width="6" height="4" viewBox="0 0 6 4" fill="currentColor" className={className}>
      <path d="M0.5 0.5L3 3.5L5.5 0.5H0.5Z" />
    </svg>
  )
}

/** Source dropdown chevron (8×5 viewBox, semi-transparent). */
export function IconChevronDownMed({ className }: { className?: string }) {
  return (
    <svg width="7" height="5" viewBox="0 0 8 5" fill="currentColor" style={{ opacity: 0.55 }} className={className}>
      <path d="M0 0.5L4 4.5L8 0.5H0Z" />
    </svg>
  )
}

/** Badge settings arrow (5×8 custom viewBox). */
export function IconChevronRight({ size = 8, className, strokeWidth = 1.5 }: IconProps) {
  return (
    <svg width="5" height="8" viewBox="0 0 5 8" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M1 1l3 3-3 3" />
    </svg>
  )
}

export function IconChevronDoubleUp({ size = 12, className, strokeWidth = 1.8 }: IconProps) {
  return <ChevronsDown size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconCheck({ size = 10, className, strokeWidth = 2.5 }: IconProps) {
  return <Check size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconSettings({ size = 13, className, strokeWidth = 1.7 }: IconProps) {
  return <Settings size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconTrash({ size = 13, className, strokeWidth = 1.7 }: IconProps) {
  return <Trash2 size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconEye({ size = 14, className, strokeWidth = 1.7 }: IconProps) {
  return <Eye size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconGrid({ size = 13, className, strokeWidth = 1.7 }: IconProps) {
  return <LayoutGrid size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconSearch({ size = 11, className, strokeWidth = 1.8 }: IconProps) {
  return <Search size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconExpand({ size = 12, className, strokeWidth = 1.8 }: IconProps) {
  return <Maximize2 size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconCollapse({ size = 12, className, strokeWidth = 1.8 }: IconProps) {
  return <Minimize2 size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconScreen({ size = 13, className, strokeWidth = 1.7 }: IconProps) {
  return <Monitor size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconWindow({ size = 15, className, strokeWidth = 1.7 }: IconProps) {
  return (
    <BaseIcon size={size} className={className} strokeWidth={strokeWidth}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M8 9h8" />
      <path d="M8 14h5" />
    </BaseIcon>
  )
}

export function IconSpinner({ size = 20, className, strokeWidth = 1.5 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" className={`animate-spin ${className ?? ""}`}>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  )
}

export function IconListView({ size = 14, className, strokeWidth = 1.6 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" className={className}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}

export function IconCanvasView({ size = 14, className, strokeWidth = 1.6 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} className={className}>
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <path d="M3 9h18" strokeLinecap="round" />
    </svg>
  )
}

export function IconWand({ size = 14, className, strokeWidth = 1.7 }: IconProps) {
  return <Wand2 size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconBackArrow({ size = 13, className, strokeWidth = 2 }: IconProps) {
  return <Undo2 size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconMicrophone({ size = 12, className, strokeWidth = 1.8 }: IconProps) {
  return <Mic size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconSend({ size = 13, className, strokeWidth = 1.8 }: IconProps) {
  return (
    <BaseIcon size={size} className={className} strokeWidth={strokeWidth}>
      <path d="M12 19V5" />
      <path d="M5 12l7-7 7 7" />
    </BaseIcon>
  )
}

// ── Alignment icons (18×18 custom viewBox) ────────────────────────────────────

export function IconCenterAlign({ className }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className={className}>
      <rect x="1" y="1" width="16" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <rect x="5.5" y="5.5" width="7" height="7" rx="1" fill="currentColor" />
    </svg>
  )
}

export function IconOriginAlign({ className }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className={className}>
      <rect x="1" y="1" width="16" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <rect x="2.5" y="2.5" width="13" height="4" rx="0.8" fill="currentColor" />
    </svg>
  )
}

// ── Action menu icons ──────────────────────────────────────────────────────────

export function IconChecklist({ size = 12, className, strokeWidth = 1.8 }: IconProps) {
  return <SquareCheck size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconReplace({ size = 12, className, strokeWidth = 1.8 }: IconProps) {
  return (
    <BaseIcon size={size} className={className} strokeWidth={strokeWidth}>
      <path d="M21 2v6h-6" />
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M3 22v-6h6" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
    </BaseIcon>
  )
}

export function IconGlobe({ size = 12, className, strokeWidth = 1.8 }: IconProps) {
  return <Globe size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconRewrite({ size = 12, className, strokeWidth = 1.8 }: IconProps) {
  return <Pen size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconRenameLayers({ size = 12, className, strokeWidth = 1.8 }: IconProps) {
  return <PenLine size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconDocument({ size = 12, className, strokeWidth = 1.8 }: IconProps) {
  return <FileText size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconPhone({ size = 13, className, strokeWidth = 1.7 }: IconProps) {
  return <Smartphone size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconPlay({ size = 14, className }: { size?: number; className?: string }) {
  return <Play size={size} className={className} fill="currentColor" strokeWidth={0} />
}

export function IconUpload({ size = 12, className, strokeWidth = 1.8 }: IconProps) {
  return <Upload size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconColorStyles({ size = 12, className, strokeWidth = 1.8 }: IconProps) {
  return (
    <BaseIcon size={size} className={className} strokeWidth={strokeWidth}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a5 5 0 0 1 0 10 5 5 0 0 0 0 10" />
      <path d="M12 2v20" />
    </BaseIcon>
  )
}

export function IconTypeStyles({ size = 12, className, strokeWidth = 1.8 }: IconProps) {
  return <Type size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconLightning({ size = 12, className, strokeWidth = 1.8 }: IconProps) {
  return <Zap size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconSparkles({ size = 12, className, strokeWidth = 1.8 }: IconProps) {
  return <Sparkles size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconTmbAssets({ size = 12, className, strokeWidth = 1.8 }: IconProps) {
  return (
    <BaseIcon size={size} className={className} strokeWidth={strokeWidth}>
      <path d="M3 3h7v7H3z" />
      <path d="M14 3h7v7h-7z" />
      <path d="M3 14h7v7H3z" />
      <circle cx="17.5" cy="17.5" r="3.5" />
    </BaseIcon>
  )
}

export function IconAccessibilityCheck({ size = 12, className, strokeWidth = 1.8 }: IconProps) {
  return <CircleCheck size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconLock({ size = 12, className, strokeWidth = 1.8 }: IconProps) {
  return <Lock size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconUnlock({ size = 12, className, strokeWidth = 1.8 }: IconProps) {
  return <Unlock size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconEyeOff({ size = 12, className, strokeWidth = 1.8 }: IconProps) {
  return <EyeOff size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconEllipsis({ size = 14, className }: IconProps) {
  return <MoreHorizontal size={size} className={className} />
}

export function IconEllipsisVertical({ size = 14, className }: IconProps) {
  return <MoreVertical size={size} className={className} />
}

export function IconLayoutVertical({ size = 13, className, strokeWidth = 1.6 }: IconProps) {
  return (
    <BaseIcon size={size} className={className} strokeWidth={strokeWidth}>
      <rect x="3" y="3" width="8" height="18" rx="1.5" />
      <rect x="13" y="3" width="8" height="18" rx="1.5" />
    </BaseIcon>
  )
}

export function IconLayoutHorizontal({ size = 13, className, strokeWidth = 1.6 }: IconProps) {
  return (
    <BaseIcon size={size} className={className} strokeWidth={strokeWidth}>
      <rect x="3" y="3" width="18" height="8" rx="1.5" />
      <rect x="3" y="13" width="18" height="8" rx="1.5" />
    </BaseIcon>
  )
}

export function IconRefresh({ size = 12, className, strokeWidth = 1.8 }: IconProps) {
  return <RotateCcw size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconPaperclip({ size = 11, className, strokeWidth = 1.8 }: IconProps) {
  return <Paperclip size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconDiamond({ size = 10, className, strokeWidth = 2.4 }: IconProps) {
  return (
    <BaseIcon size={size} className={className} strokeWidth={strokeWidth}>
      <path d="M12 3l4 4-4 4-4-4 4-4z" />
      <path d="M12 13l4 4-4 4-4-4 4-4z" />
    </BaseIcon>
  )
}

export function IconComponentLink({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8 5.83824L6.66041 4.5L8 3.16176L9.33959 4.5L8 5.83824ZM7.56946 2.17837L5.6796 4.06632C5.44013 4.30554 5.44013 4.69446 5.6796 4.93368L7.56946 6.82163C7.80753 7.05946 8.19247 7.05946 8.43054 6.82163L10.3204 4.93368C10.5599 4.69446 10.5599 4.30554 10.3204 4.06632L8.43054 2.17837C8.19247 1.94054 7.80753 1.94054 7.56946 2.17837ZM10.1618 8L11.5 6.66041L12.8382 8L11.5 9.33959L10.1618 8ZM9.17837 8.43054L11.0663 10.3204C11.3055 10.5599 11.6945 10.5599 11.9337 10.3204L13.8216 8.43054C14.0595 8.19247 14.0595 7.80753 13.8216 7.56946L11.9337 5.6796C11.6945 5.44013 11.3055 5.44013 11.0663 5.6796L9.17837 7.56946C8.94054 7.80753 8.94054 8.19247 9.17837 8.43054ZM6.66041 11.5L8 12.8382L9.33959 11.5L8 10.1618L6.66041 11.5ZM5.6796 11.0663L7.56946 9.17837C7.80753 8.94054 8.19247 8.94054 8.43054 9.17837L10.3204 11.0663C10.5599 11.3055 10.5599 11.6945 10.3204 11.9337L8.43054 13.8216C8.19247 14.0595 7.80753 14.0595 7.56946 13.8216L5.6796 11.9337C5.44013 11.6945 5.44013 11.3055 5.6796 11.0663ZM3.16176 8L4.5 6.66041L5.83824 8L4.5 9.33959L3.16176 8ZM2.17837 8.43054L4.06632 10.3204C4.30554 10.5599 4.69446 10.5599 4.93368 10.3204L6.82163 8.43054C7.05946 8.19247 7.05946 7.80753 6.82163 7.56946L4.93368 5.6796C4.69446 5.44013 4.30554 5.44013 4.06632 5.6796L2.17837 7.56946C1.94054 7.80753 1.94054 8.19247 2.17837 8.43054Z"
        fill="currentColor"
      />
    </svg>
  )
}

export function IconDuplicate({ size = 13, className, strokeWidth = 1.6 }: IconProps) {
  return <Copy size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconZoomIn({ size = 13, className, strokeWidth = 1.8 }: IconProps) {
  return <ZoomIn size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconFastEdit({ size = 13, className, strokeWidth = 1.7 }: IconProps) {
  return <SquarePen size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconMoveTo({ size = 13, className, strokeWidth = 1.7 }: IconProps) {
  return (
    <BaseIcon size={size} className={className} strokeWidth={strokeWidth}>
      <path d="M3 7a2 2 0 0 1 2-2h3.5l2 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
      <path d="M12 12l3 3-3 3" />
      <path d="M9 15h6" />
    </BaseIcon>
  )
}

export function IconCrosshair({ size = 12, className, strokeWidth = 1.8 }: IconProps) {
  return <Crosshair size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconFrame({ size = 13, className, strokeWidth = 1.7 }: IconProps) {
  return (
    <BaseIcon size={size} className={className} strokeWidth={strokeWidth}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 3v18" />
    </BaseIcon>
  )
}

export function IconPanelRight({ size = 13, className, strokeWidth = 1.7 }: IconProps) {
  return <PanelRight size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconLayers({ size = 13, className, strokeWidth = 1.7 }: IconProps) {
  return <Layers size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconChevronUp({ size = 9, className, strokeWidth = 2.2 }: IconProps) {
  return <ChevronUp size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconHistory({ size = 13, className, strokeWidth = 1.7 }: IconProps) {
  return <History size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconCompare({ size = 13, className, strokeWidth = 1.7 }: IconProps) {
  return (
    <BaseIcon size={size} className={className} strokeWidth={strokeWidth}>
      <rect x="3" y="5" width="8" height="14" rx="1" />
      <rect x="13" y="5" width="8" height="14" rx="1" />
    </BaseIcon>
  )
}

export function IconFolder({ size = 14, className, strokeWidth = 1.7 }: IconProps) {
  return <Folder size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconVideo({ size = 18, className, strokeWidth = 1.5 }: IconProps) {
  return <Video size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconDatabase({ size = 15, className, strokeWidth = 1.7 }: IconProps) {
  return <Database size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconClock({ size = 15, className, strokeWidth = 1.7 }: IconProps) {
  return <Clock size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconShield({ size = 15, className, strokeWidth = 1.7 }: IconProps) {
  return <Shield size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconOpenCanvas({ size = 12, className, strokeWidth = 1.8 }: IconProps) {
  return <ExternalLink size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconCirclePlus({ size = 13, className, strokeWidth = 1.7 }: IconProps) {
  return <CirclePlus size={size} className={className} strokeWidth={strokeWidth} />
}

// ── Linked instance icons ────────────────────────────────────────────────────

export function IconLink({ size = 12, className, strokeWidth = 1.8 }: IconProps) {
  return <Link size={size} className={className} strokeWidth={strokeWidth} />
}

export function IconUnlink({ size = 12, className, strokeWidth = 1.8 }: IconProps) {
  return <Unlink size={size} className={className} strokeWidth={strokeWidth} />
}

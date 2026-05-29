import { useCallback, useLayoutEffect, useRef } from "react";
import type { CanvasDocument } from "@/canvas/engine/types";
import type { ViewportTransform } from "@/canvas/engine/viewport";
import { getCaretRect } from "./textEditingLayout";
import {
  clampTextIndex,
  clearNativeTextSelection,
  replaceTextRange,
  selectionRangeFromAnchor,
  viewportRectForLocalTextRect,
} from "./canvasStageHelpers";
import type { TextEditState } from "./canvasStageTypes";

type TextEditingTextareaProps = {
  textEdit: TextEditState | null;
  document: CanvasDocument;
  viewportRef: { current: HTMLDivElement | null };
  viewportTransform: ViewportTransform;
  onSelectionChange: (selectionStart: number, selectionEnd: number, anchorIndex?: number) => void;
  onInputValue: (value: string, selectionStart: number, selectionEnd: number) => void;
  onCommit: () => void;
  onCancel: () => void;
};

export function TextEditingTextarea({
  textEdit,
  document,
  viewportRef,
  viewportTransform,
  onSelectionChange,
  onInputValue,
  onCommit,
  onCancel,
}: TextEditingTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const latestTextEditRef = useRef<TextEditState | null>(textEdit);
  const composingRef = useRef(false);

  const updateHiddenTextareaPosition = useCallback(() => {
    const textarea = textareaRef.current;
    const viewport = viewportRef.current;
    if (!textarea || !viewport || !textEdit) return;
    const node = document.elements[textEdit.nodeId];
    if (!node || node.type !== "text") return;
    const caretLocalRect = getCaretRect(node, textEdit.selectionEnd);
    const caretViewportRect = viewportRectForLocalTextRect({
      document,
      nodeId: textEdit.nodeId,
      localRect: caretLocalRect,
      viewportTransform,
    });
    if (!caretViewportRect) return;
    const viewportRect = viewport.getBoundingClientRect();
    textarea.style.transform = `translate(${viewportRect.left + caretViewportRect.x}px, ${viewportRect.top + caretViewportRect.y}px)`;
  }, [document, textEdit, viewportRef, viewportTransform]);

  const applySelection = useCallback((
    textarea: HTMLTextAreaElement,
    selectionStart: number,
    selectionEnd: number,
    anchorIndex?: number,
  ) => {
    const current = latestTextEditRef.current;
    if (!current) return;
    const start = clampTextIndex(selectionStart, current.value);
    const end = clampTextIndex(selectionEnd, current.value);
    const nextStart = Math.min(start, end);
    const nextEnd = Math.max(start, end);
    const nextAnchor = anchorIndex ?? nextEnd;
    latestTextEditRef.current = { ...current, selectionStart: nextStart, selectionEnd: nextEnd, anchorIndex: nextAnchor };
    textarea.setSelectionRange(nextStart, nextEnd);
    onSelectionChange(nextStart, nextEnd, nextAnchor);
  }, [onSelectionChange]);

  const applyValue = useCallback((
    textarea: HTMLTextAreaElement,
    value: string,
    selectionStart: number,
    selectionEnd: number,
  ) => {
    const current = latestTextEditRef.current;
    if (!current) return;
    const start = clampTextIndex(selectionStart, value);
    const end = clampTextIndex(selectionEnd, value);
    const nextStart = Math.min(start, end);
    const nextEnd = Math.max(start, end);
    latestTextEditRef.current = { ...current, value, selectionStart: nextStart, selectionEnd: nextEnd, anchorIndex: nextEnd };
    textarea.value = value;
    textarea.setSelectionRange(nextStart, nextEnd);
    onInputValue(value, nextStart, nextEnd);
  }, [onInputValue]);

  const replaceCurrentSelection = useCallback((textarea: HTMLTextAreaElement, insert: string) => {
    const current = latestTextEditRef.current;
    if (!current) return;
    const next = replaceTextRange(current.value, current.selectionStart, current.selectionEnd, insert);
    applyValue(textarea, next.value, next.caretIndex, next.caretIndex);
  }, [applyValue]);

  useLayoutEffect(() => {
    latestTextEditRef.current = textEdit;
    const textarea = textareaRef.current;
    if (!textarea) return;
    if (!textEdit) { textarea.value = ""; return; }
    if (textarea.value !== textEdit.value) textarea.value = textEdit.value;
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(textEdit.selectionStart, textEdit.selectionEnd);
    updateHiddenTextareaPosition();
  }, [textEdit, updateHiddenTextareaPosition]);

  useLayoutEffect(() => {
    updateHiddenTextareaPosition();
  }, [updateHiddenTextareaPosition]);

  const syncNativeValue = (textarea: HTMLTextAreaElement) => {
    applyValue(textarea, textarea.value, textarea.selectionStart, textarea.selectionEnd);
  };

  const syncNativeSelection = (textarea: HTMLTextAreaElement) => {
    if (!latestTextEditRef.current) return;
    applySelection(textarea, textarea.selectionStart, textarea.selectionEnd);
  };

  return (
    <textarea
      id="text-editing-textarea"
      ref={textareaRef}
      tabIndex={-1}
      spellCheck={false}
      onBeforeInput={(event) => {
        clearNativeTextSelection();
        const current = latestTextEditRef.current;
        if (!current || composingRef.current) return;
        const nativeEvent = event.nativeEvent as InputEvent;
        const inputType = nativeEvent.inputType;
        const textarea = event.currentTarget;

        if (inputType === "insertText" || inputType === "insertReplacementText") {
          const data = nativeEvent.data;
          if (data == null) return;
          event.preventDefault();
          replaceCurrentSelection(textarea, data);
          return;
        }
        if (inputType === "deleteContentBackward") {
          event.preventDefault();
          if (current.selectionStart !== current.selectionEnd) { replaceCurrentSelection(textarea, ""); return; }
          if (current.selectionStart <= 0) return;
          const next = replaceTextRange(current.value, current.selectionStart - 1, current.selectionStart, "");
          applyValue(textarea, next.value, next.caretIndex, next.caretIndex);
          return;
        }
        if (inputType === "deleteContentForward") {
          event.preventDefault();
          if (current.selectionStart !== current.selectionEnd) { replaceCurrentSelection(textarea, ""); return; }
          if (current.selectionEnd >= current.value.length) return;
          const next = replaceTextRange(current.value, current.selectionEnd, current.selectionEnd + 1, "");
          applyValue(textarea, next.value, current.selectionEnd, current.selectionEnd);
        }
      }}
      onInput={(event) => {
        const textarea = event.currentTarget;
        if (composingRef.current) return;
        if (latestTextEditRef.current?.value === textarea.value) return;
        syncNativeValue(textarea);
      }}
      onSelect={(event) => {
        if (composingRef.current) syncNativeSelection(event.currentTarget);
      }}
      onCompositionStart={() => { composingRef.current = true; }}
      onCompositionEnd={(event) => {
        composingRef.current = false;
        syncNativeValue(event.currentTarget);
      }}
      onCopy={(event) => {
        const current = latestTextEditRef.current;
        if (!current || current.selectionStart === current.selectionEnd) return;
        event.clipboardData.setData("text/plain", current.value.slice(current.selectionStart, current.selectionEnd));
        event.preventDefault();
      }}
      onCut={(event) => {
        const current = latestTextEditRef.current;
        if (!current || current.selectionStart === current.selectionEnd) return;
        event.clipboardData.setData("text/plain", current.value.slice(current.selectionStart, current.selectionEnd));
        replaceCurrentSelection(event.currentTarget, "");
        event.preventDefault();
      }}
      onPaste={(event) => {
        if (!latestTextEditRef.current) return;
        replaceCurrentSelection(event.currentTarget, event.clipboardData.getData("text/plain"));
        event.preventDefault();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        const current = latestTextEditRef.current;

        if (event.key === "Escape") { event.preventDefault(); onCancel(); return; }
        if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); onCommit(); return; }
        if (!current || composingRef.current) return;

        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
          event.preventDefault();
          applySelection(event.currentTarget, 0, current.value.length, 0);
          return;
        }
        if (event.key === "Backspace") {
          event.preventDefault();
          if (current.selectionStart !== current.selectionEnd) { replaceCurrentSelection(event.currentTarget, ""); return; }
          if (current.selectionStart <= 0) return;
          const next = replaceTextRange(current.value, current.selectionStart - 1, current.selectionStart, "");
          applyValue(event.currentTarget, next.value, next.caretIndex, next.caretIndex);
          return;
        }
        if (event.key === "Delete") {
          event.preventDefault();
          if (current.selectionStart !== current.selectionEnd) { replaceCurrentSelection(event.currentTarget, ""); return; }
          if (current.selectionEnd >= current.value.length) return;
          const next = replaceTextRange(current.value, current.selectionEnd, current.selectionEnd + 1, "");
          applyValue(event.currentTarget, next.value, current.selectionEnd, current.selectionEnd);
          return;
        }
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          const direction = event.key === "ArrowLeft" ? -1 : 1;
          if (event.shiftKey) {
            const anchor = current.anchorIndex;
            const focus = current.selectionStart === current.selectionEnd
              ? current.selectionEnd
              : anchor === current.selectionStart
                ? current.selectionEnd
                : current.selectionStart;
            const nextFocus = clampTextIndex(focus + direction, current.value);
            const nextRange = selectionRangeFromAnchor(anchor, nextFocus);
            applySelection(event.currentTarget, nextRange.selectionStart, nextRange.selectionEnd, nextRange.anchorIndex);
            return;
          }
          const nextCaret = current.selectionStart !== current.selectionEnd
            ? event.key === "ArrowLeft" ? current.selectionStart : current.selectionEnd
            : clampTextIndex(current.selectionEnd + direction, current.value);
          applySelection(event.currentTarget, nextCaret, nextCaret, nextCaret);
        }
      }}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        opacity: 0,
        zIndex: -1,
        backgroundColor: "white",
        pointerEvents: "none",
        width: 1,
        height: 1,
        fontSize: 1,
        lineHeight: 1,
        transform: "translate(0px, 0px)",
      }}
    />
  );
}

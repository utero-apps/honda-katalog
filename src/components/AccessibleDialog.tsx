"use client";

import { type ReactNode, useEffect, useRef } from "react";

const focusableSelector = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

type AccessibleDialogProps = {
  children: ReactNode;
  labelledBy: string;
  onClose: () => void;
  describedBy?: string;
  closeLabel?: string;
  showCloseButton?: boolean;
  backdropClassName?: string;
  panelClassName?: string;
};

function joinClassNames(...classNames: Array<string | undefined>) {
  return classNames.filter(Boolean).join(" ");
}

function isVisible(element: HTMLElement) {
  const styles = window.getComputedStyle(element);
  return styles.visibility !== "hidden" && styles.display !== "none" && element.getClientRects().length > 0;
}

export function AccessibleDialog({
  children,
  labelledBy,
  onClose,
  describedBy,
  closeLabel = "Tutup dialog",
  showCloseButton = false,
  backdropClassName,
  panelClassName,
}: AccessibleDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const getFocusableControls = () =>
      Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter(isVisible);

    const focusInitialControl = () => {
      const requestedControl = dialog.querySelector<HTMLElement>("[data-dialog-initial-focus]");
      const target = requestedControl && isVisible(requestedControl) ? requestedControl : getFocusableControls()[0];
      (target ?? dialog).focus({ preventScroll: true });
    };

    const animationFrame = window.requestAnimationFrame(focusInitialControl);

    const handleDocumentKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab") return;

      const controls = getFocusableControls();
      if (controls.length === 0) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }

      const firstControl = controls[0];
      const lastControl = controls.at(-1) ?? firstControl;
      const activeElement = document.activeElement;

      if (event.shiftKey && (activeElement === firstControl || !dialog.contains(activeElement))) {
        event.preventDefault();
        lastControl.focus();
      } else if (!event.shiftKey && (activeElement === lastControl || !dialog.contains(activeElement))) {
        event.preventDefault();
        firstControl.focus();
      }
    };

    const containFocus = (event: FocusEvent) => {
      if (!dialog.contains(event.target as Node)) focusInitialControl();
    };

    document.addEventListener("keydown", handleDocumentKeyDown, true);
    document.addEventListener("focusin", containFocus, true);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      document.removeEventListener("keydown", handleDocumentKeyDown, true);
      document.removeEventListener("focusin", containFocus, true);
      document.body.style.overflow = previousOverflow;
      previouslyFocusedRef.current?.focus({ preventScroll: true });
    };
  }, []);

  return (
    <div
      className={joinClassNames(
        "dialog-backdrop fixed inset-0 z-50 grid min-h-dvh place-items-center overflow-y-auto bg-slate-950/70 p-3 backdrop-blur-sm motion-reduce:backdrop-blur-none sm:p-6",
        backdropClassName,
      )}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={joinClassNames(
          "dialog-panel relative my-auto max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-2xl border border-slate-200/80 bg-white p-4 text-slate-950 shadow-2xl outline-none motion-reduce:scroll-auto motion-reduce:transition-none sm:max-h-[calc(100dvh-3rem)] sm:rounded-3xl sm:p-6",
          panelClassName,
        )}
      >
        {showCloseButton && (
          <button
            type="button"
            aria-label={closeLabel}
            title={closeLabel}
            onClick={onClose}
            className="absolute right-3 top-3 grid min-h-11 min-w-11 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-100 hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 motion-reduce:transition-none sm:right-4 sm:top-4"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

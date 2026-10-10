import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { cn } from '@cloudflare/kumo';

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/**
 * Native disclosure controls are keyboard-operable, so `summary` joins the
 * tab order; content of a closed <details> is not rendered and can hold
 * neither focus nor its copy buttons.
 */
function focusable(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => {
    for (let host = element.closest('details'); host; host = host.parentElement?.closest('details') ?? null) {
      if (!host.open && !(element.tagName === 'SUMMARY' && element.parentElement === host)) return false;
    }
    return true;
  });
}

/**
 * Modal focus for one subject: focus moves to the close control, Tab wraps
 * inside the dialog, Escape closes, and closing returns focus to the trigger.
 * `identity` owns the lifecycle, so a refresh that replaces the subject's data
 * does not restart it. `onKey` receives other unmodified keys (j/k).
 */
export function useModalFocus({ dialogRef, closeRef, identity, onClose, onKey }: {
  readonly dialogRef: RefObject<HTMLElement | null>;
  readonly closeRef: RefObject<HTMLElement | null>;
  readonly identity: string;
  readonly onClose: () => void;
  readonly onKey?: (event: KeyboardEvent) => void;
}): void {
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const handlers = useRef({ onClose, onKey });
  handlers.current = { onClose, onKey };
  const firstOpen = useRef(true);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    // Moving between subjects inside one open drawer keeps the original trigger.
    if (firstOpen.current) returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    firstOpen.current = false;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (event.isComposing || event.keyCode === 229) return;
        event.preventDefault();
        handlers.current.onClose();
        return;
      }
      if (event.key !== 'Tab') {
        handlers.current.onKey?.(event);
        return;
      }
      const dialog = dialogRef.current;
      if (!dialog) return;
      const stops = focusable(dialog);
      if (stops.length === 0) {
        event.preventDefault();
        return;
      }
      const first = stops[0];
      const last = stops[stops.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity]);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      returnFocusRef.current?.focus();
      returnFocusRef.current = null;
    };
  }, []);
}

/** The right-hand drawer frame shared by board items and repository tasks. */
export function DrawerFrame({ dialogRef, labelledBy, className, closeLabel, onClose, header, children }: {
  readonly dialogRef: RefObject<HTMLElement | null>;
  readonly labelledBy: string;
  readonly className?: string;
  readonly closeLabel: string;
  readonly onClose: () => void;
  readonly header: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <>
      <button className="pane-scrim fixed inset-0 z-40 cursor-default bg-black/30 motion-safe:animate-[fade-in_120ms_ease-out]" type="button" tabIndex={-1} aria-label={closeLabel} onClick={onClose} />
      <aside
        ref={dialogRef}
        className={cn('fixed inset-y-0 right-0 z-50 flex w-full max-w-[min(720px,100vw)] flex-col border-l border-kumo-line bg-kumo-base text-kumo-default shadow-2xl motion-safe:animate-[slide-in_160ms_ease-out]', className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
      >
        {header}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-10 sm:px-6">{children}</div>
      </aside>
    </>
  );
}

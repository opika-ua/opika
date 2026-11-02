"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cx } from "./cx";
import { Icon } from "./Icon";

/**
 * A short message that confirms something happened and goes away (a saved form, a copied link).
 * Wrap the page in `ToastProvider` once; call `useToast().show(message, tone)` from any client
 * component. The region is always in the DOM and `aria-live="polite"` (a live region must exist before
 * its content for screen readers to announce it); an error toast is `role="alert"`. It leaves on
 * its own after `durationMs` and can be dismissed; the timer waits while the pointer or focus is on
 * the toast. An optional action (an «undo») is a button that runs once and dismisses the toast; it
 * never takes focus on its own. Messages, the action and dismiss labels are props: the kit holds no
 * copy. Nothing a person must act on belongs here: use InlineStatus or ErrorState.
 */
export type ToastTone = "info" | "success" | "error";

const TONE: Record<ToastTone, string> = {
  info: "border-line",
  success: "border-success",
  error: "border-danger",
};

export type ToastAction = { label: string; onAction: () => void };

export type ToastProps = {
  tone: ToastTone;
  message: string;
  dismissLabel: string;
  onDismiss?: () => void;
  action?: ToastAction | undefined;
  /** Pointer or focus is on the toast / has left it; the provider holds its timer while it is on. */
  onHold?: (held: boolean) => void;
  className?: string;
};

/** One toast, presentational. `ToastProvider` renders these; it is exported for the showcase and tests. */
export function Toast({
  tone,
  message,
  dismissLabel,
  onDismiss,
  action,
  onHold,
  className,
}: ToastProps) {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the handlers only pause the timer while the pointer or focus is on the toast; the buttons inside do the work.
    <div
      role={tone === "error" ? "alert" : undefined}
      onMouseEnter={() => onHold?.(true)}
      onMouseLeave={() => onHold?.(false)}
      onFocus={() => onHold?.(true)}
      onBlur={() => onHold?.(false)}
      className={cx(
        "pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-field border-2 bg-surface py-2 pr-2 pl-4 text-label text-ink shadow-float",
        TONE[tone],
        className,
      )}
    >
      <span className="min-w-0 flex-1">{message}</span>
      {action === undefined ? null : (
        <button
          type="button"
          onClick={action.onAction}
          className="inline-flex min-h-target shrink-0 cursor-pointer items-center rounded-pill px-3 text-label font-semibold text-accent-text underline focus-ring"
        >
          {action.label}
        </button>
      )}
      {onDismiss === undefined ? null : (
        <button
          type="button"
          aria-label={dismissLabel}
          onClick={onDismiss}
          className="inline-flex size-target shrink-0 cursor-pointer items-center justify-center rounded-pill text-ink focus-ring"
        >
          <Icon name="close" />
        </button>
      )}
    </div>
  );
}

type ToastEntry = {
  id: number;
  message: string;
  tone: ToastTone;
  action?: ToastAction | undefined;
  durationMs: number;
};
export type ShowToastOptions = { action?: ToastAction; durationMs?: number };
type ToastApi = {
  show: (message: string, tone?: ToastTone, options?: ShowToastOptions) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (api === null) throw new Error("useToast needs a ToastProvider above it");
  return api;
}

export function ToastProvider({
  dismissLabel,
  durationMs = 5000,
  children,
}: {
  dismissLabel: string;
  durationMs?: number;
  children: ReactNode;
}) {
  const [toasts, setToasts] = useState<readonly ToastEntry[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const arm = useCallback(
    (id: number, ms: number) => {
      const old = timers.current.get(id);
      if (old !== undefined) clearTimeout(old);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), ms),
      );
    },
    [dismiss],
  );

  const show = useCallback(
    (message: string, tone: ToastTone = "info", options: ShowToastOptions = {}) => {
      nextId.current += 1;
      const id = nextId.current;
      const ms = options.durationMs ?? durationMs;
      setToasts((current) => [
        ...current,
        { id, message, tone, action: options.action, durationMs: ms },
      ]);
      arm(id, ms);
    },
    [arm, durationMs],
  );

  // Holding clears the timer; letting go starts the full time again.
  const hold = useCallback(
    (toast: ToastEntry, held: boolean) => {
      if (held) {
        const timer = timers.current.get(toast.id);
        if (timer !== undefined) clearTimeout(timer);
        timers.current.delete(toast.id);
      } else {
        arm(toast.id, toast.durationMs);
      }
    },
    [arm],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-0 z-(--z-toast) flex flex-col items-center gap-2 pb-inset"
      >
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            tone={toast.tone}
            message={toast.message}
            dismissLabel={dismissLabel}
            onDismiss={() => dismiss(toast.id)}
            onHold={(held) => hold(toast, held)}
            action={
              toast.action === undefined
                ? undefined
                : {
                    label: toast.action.label,
                    onAction: () => {
                      dismiss(toast.id);
                      toast.action?.onAction();
                    },
                  }
            }
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

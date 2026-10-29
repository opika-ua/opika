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
 * its own after `durationMs` and can be dismissed. Messages and the dismiss label are props: the kit
 * holds no copy. Nothing a person must act on belongs here: use InlineStatus or ErrorState.
 */
export type ToastTone = "info" | "success" | "error";

const TONE: Record<ToastTone, string> = {
  info: "border-line",
  success: "border-success",
  error: "border-danger",
};

export type ToastProps = {
  tone: ToastTone;
  message: string;
  dismissLabel: string;
  onDismiss?: () => void;
  className?: string;
};

/** One toast, presentational. `ToastProvider` renders these; it is exported for the showcase and tests. */
export function Toast({ tone, message, dismissLabel, onDismiss, className }: ToastProps) {
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      className={cx(
        "pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-field border-2 bg-surface py-2 pr-2 pl-4 text-label text-ink shadow-float",
        TONE[tone],
        className,
      )}
    >
      <span className="min-w-0 flex-1">{message}</span>
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

type ToastEntry = { id: number; message: string; tone: ToastTone };
type ToastApi = { show: (message: string, tone?: ToastTone) => void };

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

  const show = useCallback(
    (message: string, tone: ToastTone = "info") => {
      nextId.current += 1;
      const id = nextId.current;
      setToasts((current) => [...current, { id, message, tone }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), durationMs),
      );
    },
    [dismiss, durationMs],
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
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

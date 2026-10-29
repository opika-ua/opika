"use client";

import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { cx } from "./cx";
import { useDialogCore } from "./dialog-core";
import { CONTROL, FieldError, FieldHint, type FieldSlots, fieldA11y, INVALID, LABEL } from "./form";
import { Icon } from "./Icon";
import { Spinner } from "./Spinner";

/**
 * A select-only combobox: the field is an editable search box, but the value is always one of the
 * listed options, never the typed text (APG "editable combobox with list autocomplete", manual
 * selection). Options come from an async `search`; the kit holds no copy and no data source.
 *
 * Below the `tablet` breakpoint the search opens in a full-height modal `<dialog>` with the input
 * pinned at the top (so the on-screen keyboard does not cover the results); from `tablet` up the
 * list sits under the field. Client-only: a form that uses it needs JS.
 */
export type ComboboxOption<V extends string = string> = {
  value: V;
  label: string;
  /** Second line in ink-2, e.g. district and region, to tell same-named places apart. */
  detail?: string;
};

export type ComboboxResult<V extends string = string> =
  | { kind: "too_short" }
  | { kind: "options"; options: readonly ComboboxOption<V>[] };

export type ComboboxMessages = {
  placeholder: string;
  tooShort: string;
  loading: string;
  empty: string;
  error: string;
  retry: string;
  found: (count: number) => string;
  clear: string;
  close: string;
};

export type ComboboxProps<V extends string = string> = FieldSlots & {
  /** Submitted with a plain form post: the option's `value`, never the typed text. */
  name?: string;
  value: ComboboxOption<V> | null;
  onChange: (next: ComboboxOption<V> | null) => void;
  search: (query: string, signal: AbortSignal) => Promise<ComboboxResult<V>>;
  /** Offered when the field is empty (after the current value), without a request. */
  suggestions?: readonly ComboboxOption<V>[];
  /** A client hint; the server stays the authority on what is too short. */
  minQueryLength?: number;
  debounceMs?: number;
  messages: ComboboxMessages;
  /** `auto`: a dialog below `tablet`. `inline`: always under the field. */
  presentation?: "auto" | "inline";
  required?: boolean;
  disabled?: boolean;
};

const PHONE_QUERY = "(max-width: 599.98px)";
const canMatch = () => typeof window !== "undefined" && typeof window.matchMedia === "function";
const subscribePhone = (notify: () => void) => {
  if (!canMatch()) return () => undefined;
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};
const isPhone = () => canMatch() && window.matchMedia(PHONE_QUERY).matches;

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; options: readonly ComboboxOption[] }
  | { kind: "error" };

const OPTION =
  "flex min-h-target w-full cursor-pointer flex-col justify-center rounded-field px-4 py-2 text-left text-body text-ink";
const OPTION_ACTIVE = "bg-line outline-3 -outline-offset-3 outline-focus";

type PickerProps = {
  mode: "inline" | "dialog";
  id: string;
  /** Accessible name when the visible label is not tied to this input (dialog mode). */
  ariaLabel: string | undefined;
  value: ComboboxOption | null;
  onChange: (next: ComboboxOption | null) => void;
  /** Dialog mode: close the dialog. */
  onDone: () => void;
  search: ComboboxProps["search"];
  suggestions: readonly ComboboxOption[];
  minQueryLength: number;
  debounceMs: number;
  messages: ComboboxMessages;
  invalid: boolean;
  required: boolean;
  disabled: boolean;
  describedBy: string | undefined;
};

/** The input, its list and its states. Mounted inline in the field, or inside the phone dialog. */
function Picker(props: PickerProps) {
  const { mode, id, value, onChange, onDone, messages, minQueryLength, debounceMs } = props;
  const listboxId = `${id}-listbox`;
  const optionId = (index: number) => `${id}-option-${index}`;
  const committedLabel = value?.label ?? "";
  const [text, setText] = useState(committedLabel);
  const [open, setOpen] = useState(mode === "dialog");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [active, setActive] = useState(-1);
  const [announcement, setAnnouncement] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const controller = useRef<AbortController | null>(null);
  // The same query typed again is answered without a request, for this picker's lifetime.
  const cache = useRef(new Map<string, readonly ComboboxOption[]>());
  const searchRef = useRef(props.search);
  searchRef.current = props.search;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const cancelPending = useCallback(() => {
    clearTimeout(timer.current);
    controller.current?.abort();
    controller.current = null;
  }, []);
  useEffect(() => cancelPending, [cancelPending]);

  useEffect(() => {
    if (mode === "dialog") inputRef.current?.focus();
  }, [mode]);

  const settle = useCallback((options: readonly ComboboxOption[]) => {
    setStatus({ kind: "ready", options });
    const m = messagesRef.current;
    setAnnouncement(options.length === 0 ? m.empty : m.found(options.length));
  }, []);

  const run = useCallback(
    (query: string) => {
      cancelPending();
      const key = query.trim().toLocaleLowerCase();
      const cached = cache.current.get(key);
      if (cached) {
        settle(cached);
        return;
      }
      const request = new AbortController();
      controller.current = request;
      setStatus({ kind: "loading" });
      searchRef.current(query.trim(), request.signal).then(
        (result) => {
          // A newer keystroke aborted this request: its answer is stale and dropped.
          if (request.signal.aborted) return;
          if (result.kind === "too_short") {
            setStatus({ kind: "idle" });
            return;
          }
          cache.current.set(key, result.options);
          settle(result.options);
        },
        () => {
          if (request.signal.aborted) return;
          setStatus({ kind: "error" });
          setAnnouncement(messagesRef.current.error);
        },
      );
    },
    [cancelPending, settle],
  );

  const typed = text.trim();
  const atRest = typed.length === 0 || text === committedLabel;
  const searching = !atRest && typed.length >= minQueryLength;
  // At rest: the current value first, then the caller's suggestions, no request.
  const restOptions: readonly ComboboxOption[] = atRest
    ? [...(value ? [value] : []), ...props.suggestions.filter((o) => o.value !== value?.value)]
    : [];
  const options = searching ? (status.kind === "ready" ? status.options : []) : restOptions;

  const commit = (option: ComboboxOption) => {
    cancelPending();
    onChange(option);
    setText(option.label);
    setOpen(false);
    setActive(-1);
    setStatus({ kind: "idle" });
    if (mode === "dialog") onDone();
  };

  const restore = () => {
    cancelPending();
    setText(committedLabel);
    setStatus({ kind: "idle" });
    setActive(-1);
  };

  const onInput = (next: string) => {
    setText(next);
    setOpen(true);
    setActive(-1);
    cancelPending();
    if (next.trim().length < minQueryLength) {
      setStatus({ kind: "idle" });
      return;
    }
    setStatus({ kind: "loading" });
    timer.current = setTimeout(() => run(next), debounceMs);
  };

  const move = (step: 1 | -1) => {
    if (options.length === 0) return;
    const first = step === 1 ? 0 : options.length - 1;
    const next = active < 0 ? first : (active + step + options.length) % options.length;
    setActive(next);
    document.getElementById(optionId(next))?.scrollIntoView?.({ block: "nearest" });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!open) setOpen(true);
        else if (!event.altKey) move(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        if (!open) setOpen(true);
        else move(-1);
        break;
      case "Enter": {
        if (!open) break;
        // A pick, or nothing: Enter never submits the form while the list is open.
        event.preventDefault();
        const chosen = options[active];
        if (chosen) commit(chosen);
        break;
      }
      case "Escape":
        // Dialog mode: the native dialog closes itself.
        if (mode !== "inline") break;
        if (open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          setActive(-1);
        } else if (text !== committedLabel) {
          event.preventDefault();
          restore();
        }
        break;
      default:
    }
  };

  const showList = open && !props.disabled;
  const rows = showList ? options : [];
  const activeId = showList && active >= 0 && active < rows.length ? optionId(active) : undefined;
  const loading = searching && status.kind === "loading";

  const note = (() => {
    if (!showList) return null;
    if (searching && status.kind === "error") {
      return (
        <div className="flex flex-col items-start gap-1 px-4 py-2 text-body text-ink">
          <span>{messages.error}</span>
          <button
            type="button"
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => run(text)}
            className="min-h-target cursor-pointer text-label underline focus-ring"
          >
            {messages.retry}
          </button>
        </div>
      );
    }
    if (loading) return <Spinner label={messages.loading} className="px-4 py-3" />;
    if (searching && status.kind === "ready" && status.options.length === 0) {
      return <p className="px-4 py-3 text-body text-ink-2">{messages.empty}</p>;
    }
    if (!searching && rows.length === 0) {
      return <p className="px-4 py-3 text-caption text-ink-2">{messages.tooShort}</p>;
    }
    return null;
  })();

  const listbox = showList ? (
    <div
      className={
        mode === "inline"
          ? "absolute top-full z-(--z-popover) mt-2 max-h-80 w-full overflow-y-auto rounded-panel border-2 border-line bg-surface p-2 shadow-float"
          : "min-h-0 flex-1 overflow-y-auto p-2"
      }
    >
      <div
        id={listboxId}
        role="listbox"
        aria-label={props.ariaLabel ?? messages.placeholder}
        aria-busy={loading}
        className="flex flex-col gap-1"
      >
        {rows.map((option, index) => (
          // biome-ignore lint/a11y/useKeyWithClickEvents: the keyboard path is the input's (aria-activedescendant + Enter).
          <div
            key={option.value}
            id={optionId(index)}
            role="option"
            tabIndex={-1}
            aria-selected={option.value === value?.value}
            data-active={index === active}
            // Focus stays in the input: pressing an option must not blur it before the click lands.
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => commit(option)}
            className={cx(OPTION, index === active && OPTION_ACTIVE)}
          >
            <span className="flex items-center justify-between gap-3">
              <span>{option.label}</span>
              {option.value === value?.value ? <Icon name="check" size="md" /> : null}
            </span>
            {option.detail === undefined ? null : (
              <span className="text-caption text-ink-2">{option.detail}</span>
            )}
          </div>
        ))}
      </div>
      {note}
    </div>
  ) : null;

  const input = (
    <input
      ref={inputRef}
      id={id}
      type="text"
      role="combobox"
      autoComplete="off"
      autoCapitalize="off"
      spellCheck={false}
      aria-autocomplete="list"
      aria-expanded={showList}
      aria-controls={showList ? listboxId : undefined}
      aria-activedescendant={activeId}
      aria-label={props.ariaLabel}
      aria-invalid={props.invalid ? true : undefined}
      aria-describedby={props.describedBy}
      aria-required={props.required || undefined}
      placeholder={messages.placeholder}
      disabled={props.disabled}
      value={text}
      onChange={(event) => onInput(event.target.value)}
      onFocus={() => {
        if (mode === "inline" && !props.disabled) setOpen(true);
      }}
      onKeyDown={onKeyDown}
      className={cx(
        CONTROL,
        "pr-24 placeholder:text-ink-2",
        props.invalid && mode === "inline" ? INVALID : "",
      )}
    />
  );

  const clearButton =
    text.length > 0 && !props.disabled ? (
      <button
        type="button"
        aria-label={messages.clear}
        onPointerDown={(event) => event.preventDefault()}
        onClick={() => {
          cancelPending();
          setText("");
          setStatus({ kind: "idle" });
          setActive(-1);
          setOpen(true);
          onChange(null);
          inputRef.current?.focus();
        }}
        className="absolute top-0 right-1 inline-flex size-target cursor-pointer items-center justify-center text-ink focus-ring"
      >
        <Icon name="close" size="md" />
      </button>
    ) : null;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: blur bubbles from the input and its buttons; this only decides whether focus left the field.
    <div
      ref={rootRef}
      className={mode === "inline" ? "relative" : "flex h-full min-h-0 flex-col"}
      onBlur={(event) => {
        if (mode !== "inline") return;
        if (rootRef.current?.contains(event.relatedTarget as Node | null)) return;
        // Leaving the field: close, and drop text that is not the committed option.
        setOpen(false);
        if (text !== committedLabel) restore();
      }}
    >
      {mode === "dialog" ? (
        <div className="flex items-start gap-2 p-4">
          <div className="relative min-w-0 flex-1">
            {input}
            {clearButton}
          </div>
          <button
            type="button"
            aria-label={messages.close}
            onClick={onDone}
            className="inline-flex size-target shrink-0 cursor-pointer items-center justify-center rounded-pill text-ink focus-ring"
          >
            <Icon name="close" />
          </button>
        </div>
      ) : (
        <div className="relative">
          {input}
          {clearButton}
          {loading ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 right-12 size-5 -translate-y-1/2 animate-spin-fast rounded-pill border-2 border-line border-t-ink motion-reduce:animate-none"
            />
          ) : null}
        </div>
      )}
      {listbox}
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}

export function Combobox<V extends string = string>({
  id,
  label,
  hint,
  error,
  describedBy,
  name,
  value,
  onChange,
  search,
  suggestions = [],
  minQueryLength = 2,
  debounceMs = 200,
  messages,
  presentation = "auto",
  required = false,
  disabled = false,
}: ComboboxProps<V>) {
  const slots = { id, label, hint, error, describedBy };
  const phone = useSyncExternalStore(subscribePhone, isPhone, () => false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const dialogId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const { ref: dialogRef, onBackdropClick } = useDialogCore({
    open: dialogOpen,
    onClose: () => {
      setDialogOpen(false);
      triggerRef.current?.focus();
    },
  });

  const a11y = fieldA11y(slots);
  const dialogName = typeof label === "string" ? label : messages.placeholder;
  // The picker works on plain strings; the caller's V is a narrowing of that at the edges.
  const common = {
    value: value as ComboboxOption | null,
    onChange: onChange as (next: ComboboxOption | null) => void,
    search: search as ComboboxProps["search"],
    suggestions: suggestions as readonly ComboboxOption[],
    minQueryLength,
    debounceMs,
    messages,
    required,
    disabled,
    invalid: Boolean(error),
  };

  let body: ReactNode;
  if (presentation === "auto" && phone) {
    body = (
      <>
        <div className="relative">
          <button
            ref={triggerRef}
            id={id}
            type="button"
            disabled={disabled}
            aria-haspopup="dialog"
            aria-expanded={dialogOpen}
            aria-controls={dialogId}
            aria-invalid={a11y["aria-invalid"]}
            aria-describedby={a11y["aria-describedby"]}
            onClick={() => setDialogOpen(true)}
            className={cx(
              CONTROL,
              "flex cursor-pointer items-center pr-24 text-left disabled:cursor-not-allowed",
              error ? INVALID : "",
              value ? "" : "text-ink-2",
            )}
          >
            <span className="truncate">{value?.label ?? messages.placeholder}</span>
          </button>
          {value && !disabled ? (
            <button
              type="button"
              aria-label={messages.clear}
              onClick={() => onChange(null)}
              className="absolute top-0 right-1 inline-flex size-target cursor-pointer items-center justify-center text-ink focus-ring"
            >
              <Icon name="close" size="md" />
            </button>
          ) : null}
        </div>
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: Esc is native on a modal <dialog>; the click only handles the backdrop. */}
        <dialog
          ref={dialogRef}
          id={dialogId}
          aria-label={dialogName}
          onClick={onBackdropClick}
          className="fixed inset-0 z-(--z-sheet) m-0 h-dvh max-h-dvh w-full max-w-none border-0 bg-surface p-0 pb-safe text-ink backdrop:bg-ink/40"
        >
          {dialogOpen ? (
            <Picker
              {...common}
              mode="dialog"
              id={`${id}-search`}
              ariaLabel={dialogName}
              onDone={() => dialogRef.current?.close()}
              describedBy={undefined}
            />
          ) : null}
        </dialog>
      </>
    );
  } else {
    body = (
      <Picker
        {...common}
        mode="inline"
        id={id}
        ariaLabel={undefined}
        onDone={() => undefined}
        describedBy={a11y["aria-describedby"]}
      />
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      {body}
      {name === undefined ? null : <input type="hidden" name={name} value={value?.value ?? ""} />}
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
      {hint !== undefined ? <FieldHint id={`${id}-hint`}>{hint}</FieldHint> : null}
    </div>
  );
}

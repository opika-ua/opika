"use client";

import { useState } from "react";
import { Button } from "../../../ui/Button";
import { Chip } from "../../../ui/Chip";
import { Combobox, type ComboboxOption, type ComboboxResult } from "../../../ui/Combobox";
import { ComboboxMulti } from "../../../ui/ComboboxMulti";
import { Icon } from "../../../ui/Icon";
import { Menu, MenuItem } from "../../../ui/Menu";
import { Modal } from "../../../ui/Modal";
import {
  MultiSelectChecklist,
  MultiSelectListbox,
  type MultiSelectRow,
} from "../../../ui/MultiSelectRows";
import { Popover } from "../../../ui/Popover";
import { Sheet } from "../../../ui/Sheet";
import { Text } from "../../../ui/Text";
import { ToastProvider, useToast } from "../../../ui/Toast";

/** The interactive kit pieces (state lives here so the page itself stays a server component). */

export function ModalDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Open modal
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Modal title"
        description="A bottom sheet on a phone, a centred card from tablet."
        closeLabel="Close"
      >
        <Button onClick={() => setOpen(false)}>Done</Button>
      </Modal>
    </>
  );
}

export function ModalHeaderDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Header variant
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Title below the header row"
        closeLabel="Close"
        header={<Text>Lead in the close button's row</Text>}
      >
        <Button onClick={() => setOpen(false)}>Done</Button>
      </Modal>
    </>
  );
}

export function SheetDemo() {
  return (
    <Sheet
      id="dev-ui-sheet"
      label="Sheet"
      closeLabel="Close"
      trigger={
        <>
          <Icon name="filter" /> Open sheet
        </>
      }
    >
      <Text>Sheet content. Opens with no JS through the hash.</Text>
      <Chip kind="option" type="checkbox" name="demo" value="a">
        Option A
      </Chip>
    </Sheet>
  );
}

export function MenuDemo() {
  const [open, setOpen] = useState(false);
  return (
    <Menu open={open} onOpenChange={setOpen} label="More">
      <MenuItem>
        <Button variant="ghost" className="w-full justify-start" onClick={() => setOpen(false)}>
          Edit
        </Button>
      </MenuItem>
      <MenuItem>
        <Button variant="ghost" className="w-full justify-start" onClick={() => setOpen(false)}>
          Withdraw
        </Button>
      </MenuItem>
    </Menu>
  );
}

export function PopoverDemo() {
  return (
    <div className="flex flex-wrap items-start gap-3">
      <Popover label="Місто: будь-яке" trigger="Місто" className="w-52">
        <Chip kind="option" type="radio" name="city" value="kyiv">
          Kyiv
        </Chip>
        <Chip kind="option" type="radio" name="city" value="brovary">
          Brovary
        </Chip>
      </Popover>
      <Popover label="Age: Adult" trigger="Adult" active className="w-52">
        <Text>Panel content</Text>
      </Popover>
      <FieldPopoverDemo />
    </div>
  );
}

/** The filter selector's shape: a field trigger, a ✕ when something is chosen, pills with counts. */
function FieldPopoverDemo() {
  const [chosen, setChosen] = useState<readonly string[]>(["Kyiv"]);
  const options = [
    { name: "Kyiv", count: 34 },
    { name: "Brovary", count: 14 },
    { name: "Bucha", count: 0 },
  ];
  const summary = chosen.length > 0 ? chosen.join(", ") : "City";
  return (
    <Popover
      variant="field"
      panel="pills"
      label={`City: ${summary}`}
      panelLabel="City"
      trigger={summary}
      active={chosen.length > 0}
      clear={{ href: "/dev/ui", label: "Clear City" }}
      className="w-53"
    >
      {options.map(({ name, count }) => {
        const pressed = chosen.includes(name);
        return (
          <Chip
            key={name}
            kind="choice"
            control="button"
            pressed={pressed}
            disabled={count === 0 && !pressed}
            count={count}
            accessibleName={`${name}, ${count} animals`}
            onPress={() =>
              setChosen((now) => (pressed ? now.filter((n) => n !== name) : [...now, name]))
            }
          >
            {name}
          </Chip>
        );
      })}
    </Popover>
  );
}

export function ChoiceChipDemo() {
  const [on, setOn] = useState(false);
  return (
    <Chip
      kind="choice"
      control="button"
      pressed={on}
      count={34}
      accessibleName="Choice, 34 animals"
      onPress={() => setOn((value) => !value)}
    >
      Choice
    </Chip>
  );
}

export function ToggleChipDemo() {
  const [on, setOn] = useState(false);
  return (
    <Chip kind="toggle" pressed={on} onClick={() => setOn((value) => !value)}>
      Toggle chip
    </Chip>
  );
}

function ToastButtons() {
  const { show } = useToast();
  return (
    <>
      <Button variant="secondary" onClick={() => show("Saved", "success")}>
        Show toast
      </Button>
      <Button variant="secondary" onClick={() => show("Could not save", "error")}>
        Show error toast
      </Button>
    </>
  );
}

export function ToastDemo() {
  return (
    <ToastProvider dismissLabel="Dismiss">
      <ToastButtons />
    </ToastProvider>
  );
}

const MOCK_PLACES: readonly ComboboxOption[] = [
  { value: "p1", label: "Springfield", detail: "North district, Alpha region" },
  { value: "p2", label: "Springfield", detail: "East district, Beta region" },
  { value: "p3", label: "Springfield", detail: "South district, Gamma region" },
  { value: "p4", label: "Riverton", detail: "West district, Alpha region" },
  { value: "p5", label: "Rivermouth", detail: "North district, Beta region" },
  { value: "p6", label: "O'Brien Hill", detail: "Central district, Gamma region" },
  { value: "p7", label: "Lakeside", detail: "East district, Alpha region" },
  { value: "p8", label: "Lakeview", detail: "South district, Beta region" },
];

/** A fake server: waits, honours the abort signal, "fails" for the query "fail". */
function mockSearch(query: string, signal: AbortSignal): Promise<ComboboxResult> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (query.toLowerCase() === "fail") {
        reject(new Error("mock failure"));
        return;
      }
      const q = query.toLowerCase();
      resolve({
        kind: "options",
        options: MOCK_PLACES.filter((place) => place.label.toLowerCase().startsWith(q)),
      });
    }, 600);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("aborted", "AbortError"));
    });
  });
}

const COMBOBOX_MESSAGES = {
  placeholder: "Start typing a place",
  tooShort: "Type at least 2 letters",
  loading: "Searching",
  empty: "Nothing found",
  error: "Search failed",
  retry: "Try again",
  found: (count: number) => `Found: ${count}`,
  clear: "Clear",
  close: "Close",
};

/** Mock source: try "spring" (three same names), "o'b", "zzz" (empty), "fail" (error). */
export function ComboboxDemo() {
  const [value, setValue] = useState<ComboboxOption | null>(null);
  const [broken, setBroken] = useState(false);
  return (
    <div className="flex w-full max-w-md flex-col gap-6">
      <Combobox
        id="demo-combobox"
        label="Place"
        hint="Mock data: try spring, o'b, zzz or fail."
        value={value}
        onChange={setValue}
        search={mockSearch}
        suggestions={MOCK_PLACES.slice(3, 5)}
        messages={COMBOBOX_MESSAGES}
        error={broken ? "Pick a place from the list" : null}
        required
      />
      <Button variant="secondary" onClick={() => setBroken((now) => !now)}>
        Toggle invalid state
      </Button>
      <Combobox
        id="demo-combobox-disabled"
        label="Place (disabled)"
        value={MOCK_PLACES[0] ?? null}
        onChange={() => undefined}
        search={mockSearch}
        messages={COMBOBOX_MESSAGES}
        disabled
      />
    </div>
  );
}

const MULTI_OPTIONS = [
  { value: "brovary", label: "Brovary", count: 3, detail: null },
  { value: "irpin", label: "Irpin", count: 8, detail: null },
  { value: "mykolaivka-k", label: "Mykolaivka", count: 1, detail: "Brovary district, Kyiv obl." },
  {
    value: "mykolaivka-o",
    label: "Mykolaivka",
    count: 2,
    detail: "Berezivka district, Odesa obl.",
  },
  { value: "bucha", label: "Bucha", count: 1, detail: null },
  { value: "odesa", label: "Odesa", count: 0, detail: null },
] as const;

/** Local data, no request: type «br» (match in the hint too), tick several, Backspace removes the last. */
export function ComboboxMultiDemo() {
  const [selected, setSelected] = useState<string[]>([]);
  const labelOf = (value: string) => MULTI_OPTIONS.find((o) => o.value === value)?.label ?? value;
  const rowsFor = (query: string, pinned: ReadonlySet<string>): MultiSelectRow[] => {
    const needle = query.trim().toLowerCase();
    return MULTI_OPTIONS.filter(
      (o) =>
        needle === "" ||
        o.label.toLowerCase().includes(needle) ||
        (o.detail?.toLowerCase().includes(needle) ?? false),
    )
      .map((o) => ({
        value: o.value,
        label: [o.label, "", ""] as const,
        detail: o.detail === null ? null : ([o.detail, "", ""] as const),
        count: o.count,
        checked: selected.includes(o.value),
        disabled: o.count === 0 && !selected.includes(o.value),
        name: `${o.label}, ${o.count}`,
        group: null,
      }))
      .sort(
        (a, b) =>
          Number(pinned.has(b.value)) - Number(pinned.has(a.value)) ||
          (b.count ?? 0) - (a.count ?? 0),
      );
  };
  return (
    <div className="w-full max-w-xs">
      <ComboboxMulti
        id="demo-combobox-multi"
        label="City"
        summary={selected.map(labelOf).join(", ")}
        selectedValues={selected}
        rows={rowsFor}
        onToggle={(value) =>
          setSelected((now) =>
            now.includes(value) ? now.filter((v) => v !== value) : [...now, value],
          )
        }
        onClear={() => setSelected([])}
        messages={{
          search: "Search for a city",
          clear: "Clear",
          selectedCount: (n) => `Selected: ${n}`,
          found: (n) => `Found: ${n}`,
          noMatch: "Nothing found",
          noMatchHint: "Only cities with animals are listed.",
          clearField: "Clear City",
        }}
      />
    </div>
  );
}

const STATIC_ROWS: MultiSelectRow[] = [
  {
    value: "a",
    label: ["Br", "ov", "ary"],
    detail: null,
    count: 3,
    checked: true,
    disabled: false,
    name: "Brovary, 3",
    group: { id: "has", label: "Has animals" },
  },
  {
    value: "b",
    label: ["Irpin", "", ""],
    detail: ["Kyiv obl.", "", ""],
    count: 8,
    checked: false,
    disabled: false,
    name: "Irpin, 8",
    group: { id: "has", label: "Has animals" },
  },
  {
    value: "c",
    label: ["Odesa", "", ""],
    detail: null,
    count: 0,
    checked: false,
    disabled: true,
    name: "Odesa, 0",
    group: { id: "none", label: "No animals yet" },
  },
];

/** The two row lists on their own: the combobox's listbox and the phone's checklist (matched part bold, empty row disabled). */
export function MultiSelectRowsDemo() {
  return (
    <div className="flex w-full flex-wrap gap-8">
      <div className="w-72">
        <MultiSelectListbox
          rows={STATIC_ROWS}
          idPrefix="demo-listbox"
          activeValue="b"
          onToggle={() => undefined}
          label="Listbox"
        />
      </div>
      <div className="w-72">
        <MultiSelectChecklist
          rows={STATIC_ROWS}
          idPrefix="demo-checklist"
          onToggle={() => undefined}
          label="Checklist"
        />
      </div>
    </div>
  );
}

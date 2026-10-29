"use client";

import { useState } from "react";
import { Button } from "../../../ui/Button";
import { Chip } from "../../../ui/Chip";
import { Icon } from "../../../ui/Icon";
import { Menu, MenuItem } from "../../../ui/Menu";
import { Modal } from "../../../ui/Modal";
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

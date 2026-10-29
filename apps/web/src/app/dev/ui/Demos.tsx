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
    </div>
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

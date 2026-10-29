import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Menu, MenuItem } from "./Menu";
import { Modal } from "./Modal";
import { Popover } from "./Popover";
import { Sheet } from "./Sheet";

afterEach(() => {
  document.body.style.overflow = "";
  window.history.replaceState(null, "", "/");
});

function ModalHarness() {
  const [open, setOpen] = useState(true);
  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Заголовок" closeLabel="Закрити">
      <button type="button">Всередині</button>
    </Modal>
  );
}

describe("Modal", () => {
  it("opens as a native modal dialog named by its title, with focus on the title", () => {
    render(<ModalHarness />);
    const dialog = screen.getByRole("dialog", { name: "Заголовок" }) as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Заголовок" }));
  });

  it("locks page scroll while open and releases it on close", () => {
    document.body.style.overflow = "auto";
    render(<ModalHarness />);
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.click(screen.getByRole("button", { name: "Закрити" }));
    expect(document.body.style.overflow).toBe("auto");
  });

  it("the close button closes the dialog", () => {
    render(<ModalHarness />);
    const dialog = screen.getByRole("dialog", { name: "Заголовок" }) as HTMLDialogElement;
    fireEvent.click(screen.getByRole("button", { name: "Закрити" }));
    expect(dialog.open).toBe(false);
  });

  it("a click on the backdrop (the dialog itself) closes it; a click inside does not", () => {
    render(<ModalHarness />);
    const dialog = screen.getByRole("dialog", { name: "Заголовок" }) as HTMLDialogElement;
    fireEvent.click(screen.getByRole("button", { name: "Всередині" }));
    expect(dialog.open).toBe(true);
    fireEvent.click(dialog);
    expect(dialog.open).toBe(false);
  });

  it("a close from the platform (Esc, Android Back) releases the scroll lock too", () => {
    render(<ModalHarness />);
    const dialog = screen.getByRole("dialog", { name: "Заголовок" }) as HTMLDialogElement;
    // The browser's close request ends in dialog.close(); that is the contract the core relies on.
    act(() => dialog.close());
    expect(document.body.style.overflow).toBe("");
  });
});

describe("Sheet", () => {
  function renderSheet() {
    render(
      <Sheet id="filters" label="Фільтри" closeLabel="Закрити" trigger="Фільтр">
        <button type="button">Застосувати</button>
      </Sheet>,
    );
    return document.getElementById("filters") as HTMLDialogElement;
  }

  it("the trigger is a plain hash link, so it opens with no JS", () => {
    renderSheet();
    const trigger = screen.getByRole("link", { name: "Фільтри" });
    expect(trigger.getAttribute("href")).toBe("#filters");
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
  });

  it("with JS it opens as a modal dialog and locks scroll; the close link closes and releases", () => {
    const dialog = renderSheet();
    expect(dialog.open).toBe(false);
    fireEvent.click(screen.getByRole("link", { name: "Фільтри" }));
    expect(dialog.open).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
    expect(
      screen.getByRole("link", { name: "Фільтри", hidden: true }).getAttribute("aria-expanded"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("link", { name: "Закрити" }));
    expect(dialog.open).toBe(false);
    expect(document.body.style.overflow).toBe("");
  });

  it("the close link falls through to href=# when the sheet was revealed by :target, not showModal", () => {
    renderSheet();
    const close = screen.getByRole("link", { name: "Закрити", hidden: true });
    expect(close.getAttribute("href")).toBe("#");
    // Not default-prevented: the browser follows the href and clears the fragment.
    expect(fireEvent.click(close)).toBe(true);
  });
});

describe("Popover", () => {
  function renderPopover() {
    render(
      <>
        <Popover label="Місто: будь-яке" trigger="МІСТО">
          <a href="/kyiv">Київ</a>
        </Popover>
        <button type="button">Поза</button>
      </>,
    );
    return screen.getByRole("button", { name: "Місто: будь-яке" });
  }

  it("opens and closes on the trigger, announcing the state", () => {
    const trigger = renderPopover();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("link", { name: "Київ" })).toBeNull();
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("link", { name: "Київ" })).toBeTruthy();
    fireEvent.click(trigger);
    expect(screen.queryByRole("link", { name: "Київ" })).toBeNull();
  });

  it("Escape closes it and returns focus to the trigger", () => {
    const trigger = renderPopover();
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("link", { name: "Київ" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("a press outside closes it; a press inside does not", () => {
    const trigger = renderPopover();
    fireEvent.click(trigger);
    fireEvent.pointerDown(screen.getByRole("link", { name: "Київ" }));
    expect(screen.getByRole("link", { name: "Київ" })).toBeTruthy();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Поза" }));
    expect(screen.queryByRole("link", { name: "Київ" })).toBeNull();
  });
});

describe("Modal locked", () => {
  it("ignores Esc, the backdrop and the close button while locked, and closes once unlocked", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Modal open onClose={onClose} title="Заголовок" closeLabel="Закрити" locked>
        <button type="button">Всередині</button>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog", { name: "Заголовок" }) as HTMLDialogElement;
    const cancel = new Event("cancel", { cancelable: true });
    dialog.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    fireEvent.click(dialog);
    fireEvent.click(screen.getByRole("button", { name: "Закрити" }));
    expect(dialog.open).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    rerender(
      <Modal open onClose={onClose} title="Заголовок" closeLabel="Закрити">
        <button type="button">Всередині</button>
      </Modal>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Закрити" }));
    expect(dialog.open).toBe(false);
  });
});

function MenuHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Menu open={open} onOpenChange={setOpen} label="Ще" triggerId="more">
        <MenuItem>
          <button type="button">Редагувати</button>
        </MenuItem>
      </Menu>
      <button type="button">Поза меню</button>
    </>
  );
}

describe("Menu", () => {
  it("is a disclosure: the trigger says whether it is open", () => {
    render(<MenuHarness />);
    const trigger = screen.getByRole("button", { name: "Ще" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: "Редагувати" })).toBeTruthy();
    fireEvent.click(trigger);
    expect(screen.queryByRole("button", { name: "Редагувати" })).toBeNull();
  });

  it("Esc closes it and focus returns to the trigger", () => {
    render(<MenuHarness />);
    const trigger = screen.getByRole("button", { name: "Ще" });
    fireEvent.click(trigger);
    screen.getByRole("button", { name: "Редагувати" }).focus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });

  it("a press outside closes it", () => {
    render(<MenuHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Ще" }));
    fireEvent.pointerDown(screen.getByRole("button", { name: "Поза меню" }));
    expect(screen.getByRole("button", { name: "Ще" }).getAttribute("aria-expanded")).toBe("false");
  });
});

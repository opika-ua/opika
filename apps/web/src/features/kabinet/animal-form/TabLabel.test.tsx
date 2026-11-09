import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Tabs } from "../../../ui/Tabs";
import { TabLabel } from "./TabLabel";

describe("TabLabel inside Tabs", () => {
  it("keeps the visible label as the tab's name with and without a status mark", () => {
    render(
      <Tabs
        label="Розділи"
        tabs={[
          { id: "a", label: <TabLabel label="Основне" status="incomplete" />, panel: null },
          { id: "b", label: <TabLabel label="Фото" status="complete" />, panel: null },
          { id: "c", label: <TabLabel label="Здоровʼя" status={null} />, panel: null },
        ]}
      />,
    );
    for (const name of ["Основне", "Фото", "Здоровʼя"]) {
      expect(screen.getByRole("tab", { name: new RegExp(`^${name}`) })).toBeTruthy();
    }
  });
});

import type { CityId } from "@opika/domain";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComboboxMessages } from "../../../ui/Combobox";
import { LocationFields } from "./LocationFields";
import type { LocationValue } from "./location-values";

const messages: ComboboxMessages = {
  placeholder: "Почніть вводити назву",
  tooShort: "Ще літера",
  loading: "Шукаю…",
  empty: "Нічого",
  error: "Помилка",
  retry: "Ще раз",
  found: (count) => `Знайдено: ${count}`,
  clear: "Очистити",
  close: "Закрити",
};

function Harness({ onChange }: { onChange: (next: LocationValue) => void }) {
  const [value, setValue] = useState<LocationValue>({ kind: "shelter_city" });
  return (
    <LocationFields
      idPrefix="t"
      shelterCityName="Київ"
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
      search={async () => ({
        kind: "options",
        options: [{ value: "c1" as CityId, label: "м. Бровари" }],
      })}
      messages={messages}
      error={null}
    />
  );
}

afterEach(cleanup);

describe("LocationFields", () => {
  it("defaults to the shelter's city, named, with no city picker", () => {
    render(<Harness onChange={() => {}} />);
    expect(screen.getByRole("radiogroup", { name: "Де зараз тварина" })).toBeTruthy();
    expect(
      (screen.getByRole("radio", { name: "У місті притулку (Київ)" }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(screen.queryByText("Населений пункт")).toBeNull();
  });

  it("«В іншому місті» offers the settlement picker", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "В іншому місті" }));
    expect(onChange).toHaveBeenLastCalledWith({ kind: "own_city", city: null });
    expect(screen.getAllByText("Населений пункт").length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("radio", { name: "У місті притулку (Київ)" }));
    expect(onChange).toHaveBeenLastCalledWith({ kind: "shelter_city" });
  });
});

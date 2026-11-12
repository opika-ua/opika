import { within } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";

/**
 * Types an ISO date into the `DateField` whose legend is `legend`, inside `scope`, part by part
 * as a person does: the day, the month picked by its value, the year. The kabinet's part labels.
 */
export async function typeDate(
  user: ReturnType<typeof userEvent.setup>,
  scope: HTMLElement,
  legend: string,
  iso: string,
): Promise<void> {
  const [year = "", month = "", day = ""] = iso.split("-");
  const group = within(within(scope).getByRole("group", { name: legend }));
  const dayInput = group.getByRole("textbox", { name: "День" });
  await user.clear(dayInput);
  await user.type(dayInput, String(Number(day)));
  await user.selectOptions(group.getByRole("combobox", { name: "Місяць" }), String(Number(month)));
  const yearInput = group.getByRole("textbox", { name: "Рік" });
  await user.clear(yearInput);
  await user.type(yearInput, year);
}

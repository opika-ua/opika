import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ListingStatusChip, VerificationStatusChip } from "./StatusChips";

describe("status chips", () => {
  it.each([
    ["draft", "Чернетка"],
    ["published", "Опубліковано"],
    ["reserved", "Домовляються"],
    ["adopted", "Удома"],
    ["withdrawn", "Знято з показу"],
  ] as const)("a %s card reads «%s»", (kind, label) => {
    render(<ListingStatusChip kind={kind} />);
    expect(screen.getByText(label)).toBeTruthy();
  });

  it.each([
    ["verified", "Перевірено"],
    ["pending", "Очікує перевірки"],
    ["paused", "На паузі"],
    ["rejected", "Відхилено"],
  ] as const)("a %s shelter reads «%s»", (status, label) => {
    render(<VerificationStatusChip status={status} />);
    expect(screen.getByText(label)).toBeTruthy();
  });
});

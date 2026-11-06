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
    ["pending", "На перевірці"],
    ["under_review", "На перевірці"],
    ["paused", "На паузі"],
    ["rejected", "Відхилено"],
  ] as const)("a %s shelter reads «%s»", (status, label) => {
    render(<VerificationStatusChip status={status} />);
    expect(screen.getByText(label)).toBeTruthy();
  });

  it.each([
    ["pending", "Очікує перевірки"],
    ["under_review", "На розгляді"],
    ["verified", "Перевірено"],
  ] as const)("the operator's view of a %s shelter reads «%s»", (status, label) => {
    render(<VerificationStatusChip status={status} audience="operator" />);
    expect(screen.getByText(label)).toBeTruthy();
  });
});

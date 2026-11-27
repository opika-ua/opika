import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WithMockRouter } from "../../../features/gallery/test-router";
import { makeShelterPageView } from "../../../features/shelters/test-fixtures";
import { renderShelterPage } from "./page";

/** The page's BreadcrumbList, read off the rendered JSON-LD script; no database. */
function breadcrumbPaths(sheltersIndexListed: boolean): string[] {
  const view = makeShelterPageView({ sheltersIndexListed });
  const { container } = render(
    <WithMockRouter>{renderShelterPage({ kind: "shelter", view }, false)}</WithMockRouter>,
  );
  const lists = [...container.querySelectorAll('script[type="application/ld+json"]')]
    .map((script) => JSON.parse(script.textContent ?? ""))
    .filter((entry) => entry["@type"] === "BreadcrumbList");
  expect(lists).toHaveLength(1);
  return lists[0].itemListElement.map((item: { item: string }) => new URL(item.item).pathname);
}

describe("the shelter page's BreadcrumbList", () => {
  it("is gallery > shelters > shelter when the list exists", () => {
    const paths = breadcrumbPaths(true);
    expect(paths.slice(0, 2)).toEqual(["/", "/prytulky"]);
    expect(paths).toHaveLength(3);
    expect(paths[2]).toMatch(/^\/prytulky\/.+/);
  });

  it("drops the list level when it would answer 404", () => {
    const paths = breadcrumbPaths(false);
    expect(paths).toHaveLength(2);
    expect(paths[0]).toBe("/");
    expect(paths[1]).toMatch(/^\/prytulky\/.+/);
  });
});

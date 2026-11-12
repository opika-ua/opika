import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LinkedText } from "./LinkedText";

describe("LinkedText", () => {
  it("opens a link in a new tab, unfollowed, named by its address without the protocol", () => {
    render(
      <p>
        <LinkedText text="Про FIV: https://hatul-madan.org/blogs/fiv." />
      </p>,
    );
    const link = screen.getByRole("link", { name: "hatul-madan.org/blogs/fiv" });
    expect(link.getAttribute("href")).toBe("https://hatul-madan.org/blogs/fiv");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")?.split(" ").sort()).toEqual([
      "nofollow",
      "noopener",
      "noreferrer",
      "ugc",
    ]);
    expect(link.closest("p")?.textContent).toBe("Про FIV: hatul-madan.org/blogs/fiv.");
  });

  it("renders two links in one paragraph", () => {
    render(
      <p>
        <LinkedText text="Фото: https://a.org/1, відео: https://b.org/2" />
      </p>,
    );
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "https://a.org/1",
      "https://b.org/2",
    ]);
  });

  it("shows javascript: and <script> as the text they are, with no link and no element", () => {
    const value = "javascript:alert(1) <script>alert(1)</script> <a href=x>y</a>";
    const { container } = render(
      <p>
        <LinkedText text={value} />
      </p>,
    );
    expect(screen.queryByRole("link")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("p")?.textContent).toBe(value);
  });
});

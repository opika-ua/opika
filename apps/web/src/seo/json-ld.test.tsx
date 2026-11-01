import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { JsonLd } from "./json-ld";
import { organizationJsonLd } from "./json-ld-builders";

describe("JsonLd", () => {
  it("renders nothing when the site is not discoverable", () => {
    const { container } = render(<JsonLd data={organizationJsonLd()} discoverable={false} />);
    expect(container.querySelector("script")).toBeNull();
  });
  it("renders a parseable ld+json script when discoverable", () => {
    const { container } = render(<JsonLd data={organizationJsonLd()} discoverable />);
    const script = container.querySelector('script[type="application/ld+json"]');
    expect(JSON.parse(script?.textContent ?? "")["@type"]).toBe("Organization");
  });
});

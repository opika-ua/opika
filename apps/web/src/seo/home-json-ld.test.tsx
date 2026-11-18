import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HomeJsonLd } from "./home-json-ld";

function emitted(container: HTMLElement): unknown[] {
  return [...container.querySelectorAll('script[type="application/ld+json"]')].map((script) =>
    JSON.parse(script.textContent ?? ""),
  );
}

describe("the home page's structured data (/tvaryny, where / redirects)", () => {
  it("emits exactly a WebSite and an Organization", () => {
    const { container } = render(<HomeJsonLd discoverable />);
    expect(emitted(container)).toEqual([
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "Opika",
        alternateName: ["Опіка", "opika.org.ua"],
        url: "https://opika.org.ua/",
      },
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "Opika",
        url: "https://opika.org.ua/",
        logo: "https://opika.org.ua/icons/icon-512.png",
        sameAs: ["https://www.instagram.com/opika.ua/"],
      },
    ]);
  });

  it("emits nothing while the site is not discoverable", () => {
    const { container } = render(<HomeJsonLd discoverable={false} />);
    expect(emitted(container)).toEqual([]);
  });
});

import { render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { servesAvif } from "../photo-format";
import { Avatar } from "./Avatar";
import { Photo } from "./Photo";

const KEY = "animals/a0000000-0000-4000-8000-000000000000/b0000000-0000-4000-8000-000000000000";
// The plain next/image path runs Next's default loader under vitest, which wants a root-relative src.
const SEED = "/seed-photos/dog-1.jpg";
const SIZES = "(max-width:599px) calc(50vw - 22px),328px";

const urlsOf = (srcset: string | null) =>
  (srcset ?? "")
    .split(",")
    .map((entry) => entry.trim().split(" ")[0] ?? "")
    .filter(Boolean);

beforeEach(() => {
  process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL = "https://cdn.opika.org.ua";
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
  delete process.env.NEXT_PUBLIC_R2_AVIF;
});

const LOGO =
  "shelters/51000000-0000-4000-8000-000000000001/logo/c2000000-0000-4000-8000-000000000002";
/** The animal page's hero (`DetailPhotoGallery`) and the gallery card, as rendered there. */
const HERO_SIZES = "(max-width: 599px) 100vw, (max-width: 1023px) 640px, 300px";
const CARD_SIZES =
  "(max-width:599px) calc(50vw - 22px),(max-width:1023px) calc(50vw - 32px),(max-width:1511px) calc(25vw - 50.5px),328px";

describe("a shelter logo", () => {
  // Every ladder width mapped to `large.webp`: the same file five times over, now once.
  it.each(["md", "identity", "xl"] as const)(
    "at size %s is one URL, its large.webp, with no srcset and the same box and alt",
    (size) => {
      const { container } = render(<Avatar kind="logo" src={LOGO} size={size} />);
      const imgs = container.querySelectorAll("img");
      expect(imgs).toHaveLength(1);
      const [img] = imgs;
      expect(img?.getAttribute("src")).toBe(`https://cdn.opika.org.ua/${LOGO}/large.webp`);
      expect(img?.getAttribute("srcset")).toBeNull();
      expect(img?.getAttribute("alt")).toBe("");
      expect(img?.getAttribute("data-nimg")).toBe("fill");
      expect(img?.getAttribute("loading")).toBe("lazy");
    },
  );
});

describe("Photo with AVIF off", () => {
  it("renders today's single <img>, no <picture>", () => {
    const { container } = render(<Photo src={SEED} alt="" sizes={SIZES} aspect="portrait" />);
    expect(container.querySelector("picture")).toBeNull();
    expect(container.querySelector("img")).not.toBeNull();
    expect(servesAvif(KEY)).toBe(false);
  });
});

describe("Photo with AVIF on", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_R2_AVIF = "1";
  });

  it("an animal photo is a <picture>: an AVIF source of the same photo, and an <img> without AVIF as the fallback", () => {
    const { container } = render(<Photo src={KEY} alt="" sizes={SIZES} aspect="portrait" />);
    const source = container.querySelector("picture > source");
    expect(source?.getAttribute("type")).toBe("image/avif");
    expect(source?.getAttribute("sizes")).toBe(SIZES);
    const avif = urlsOf(source?.getAttribute("srcset") ?? null);
    expect(avif.length).toBeGreaterThan(0);
    for (const url of avif)
      expect(url).toMatch(new RegExp(`^https://cdn\\.opika\\.org\\.ua/${KEY}/\\w+\\.avif$`));
    const img = container.querySelector("picture > img");
    expect(img?.getAttribute("alt")).toBe("");
    expect(img?.getAttribute("sizes")).toBe(SIZES);
    expect(img?.getAttribute("src")).not.toContain(".avif");
    expect(img?.getAttribute("srcset")).not.toContain(".avif");
  });

  it("keeps the loading hints: lazy by default, eager at low priority for the first row", () => {
    const lazy = render(<Photo src={KEY} alt="" sizes={SIZES} aspect="portrait" />).container;
    expect(lazy.querySelector("img")?.getAttribute("loading")).toBe("lazy");
    expect(lazy.querySelector("img")?.getAttribute("fetchpriority")).toBeNull();
    const eager = render(
      <Photo src={KEY} alt="" sizes={SIZES} aspect="portrait" eager />,
    ).container;
    expect(eager.querySelector("img")?.getAttribute("loading")).toBe("eager");
    expect(eager.querySelector("img")?.getAttribute("fetchpriority")).toBe("low");
  });

  it("the priority photo is preloaded once, as AVIF, at high priority, and never as WebP", () => {
    const html = renderToStaticMarkup(
      <Photo src={KEY} alt="" sizes={SIZES} aspect="portrait" priority />,
    );
    const preloads = html.match(/<link\b[^>]*\brel="preload"[^>]*>/g) ?? [];
    expect(preloads).toHaveLength(1);
    const [link = ""] = preloads;
    expect(link).toMatch(/\btype="image\/avif"/);
    expect(link).toMatch(/\bfetchPriority="high"/i);
    expect(link).toContain(".avif");
    expect(link).not.toContain(".webp");
    expect(html).toMatch(/<img\b[^>]*\bfetchPriority="high"/i);
  });

  it("the hero's three lists offer no thumb (176w); a gallery card's still do", () => {
    const html = renderToStaticMarkup(
      <Photo src={KEY} alt="" sizes={HERO_SIZES} aspect="portrait" priority />,
    );
    const lists = [
      html.match(/<link [^>]*imageSrcSet="([^"]*)"/i)?.[1],
      html.match(/<source [^>]*srcSet="([^"]*)"/i)?.[1],
      html.match(/<img [^>]*srcSet="([^"]*)"/i)?.[1],
    ];
    expect(lists.every((list) => list !== undefined && list.length > 0)).toBe(true);
    for (const list of lists)
      expect(urlsOf(list ?? null).some((u) => u.includes("/thumb."))).toBe(false);

    const card = render(
      <Photo src={KEY} alt="" sizes={CARD_SIZES} aspect="cardStacked" />,
    ).container;
    for (const srcset of [
      card.querySelector("source")?.getAttribute("srcset") ?? null,
      card.querySelector("img")?.getAttribute("srcset") ?? null,
    ]) {
      expect(urlsOf(srcset).some((u) => u.includes("/thumb."))).toBe(true);
    }
  });

  it("a shelter logo and a seed placeholder stay a single <img>: neither is stored as AVIF", () => {
    expect(servesAvif("shelters/51000000-0000-4000-8000-000000000001/logo/0")).toBe(false);
    const { container } = render(<Photo src={SEED} alt="" sizes={SIZES} aspect="square" />);
    expect(container.querySelector("picture")).toBeNull();
  });
});

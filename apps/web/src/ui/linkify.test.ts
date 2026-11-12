import { describe, expect, it } from "vitest";
import { linkParts, type TextPart } from "./linkify";

const FIV = "https://hatul-madan.org/blogs/fiv";
const link = (start: number, href = FIV, label = "hatul-madan.org/blogs/fiv"): TextPart => ({
  kind: "link",
  start,
  href,
  label,
});
const text = (start: number, value: string): TextPart => ({ kind: "text", start, text: value });

describe("linkParts", () => {
  it("links a plain URL, its label without the protocol", () => {
    expect(linkParts(FIV)).toEqual([link(0)]);
  });

  it("leaves the full stop at the end of a sentence outside the link", () => {
    expect(linkParts(`Більше тут: ${FIV}.`)).toEqual([
      text(0, "Більше тут: "),
      link(12),
      text(45, "."),
    ]);
  });

  it("leaves a comma, a closing bracket and «» outside the link", () => {
    expect(linkParts(`${FIV}, а ще`)).toEqual([link(0), text(33, ", а ще")]);
    expect(linkParts(`(див. ${FIV})`)).toEqual([text(0, "(див. "), link(6), text(39, ")")]);
    expect(linkParts(`Наш блог «${FIV}».`)).toEqual([
      text(0, "Наш блог «"),
      link(10),
      text(43, "»."),
    ]);
  });

  it("keeps a bracket the URL opened itself", () => {
    const wiki = "https://en.wikipedia.org/wiki/Cat_(disambiguation)";
    expect(linkParts(`${wiki}.`)).toEqual([
      link(0, wiki, "en.wikipedia.org/wiki/Cat_(disambiguation)"),
      text(wiki.length, "."),
    ]);
  });

  it("ends the link where Cyrillic is glued on, on either side", () => {
    expect(linkParts(`сайт${FIV}Дякуємо`)).toEqual([text(0, "сайт"), link(4), text(37, "Дякуємо")]);
  });

  it("links two URLs in one paragraph, http as well as https", () => {
    expect(linkParts("Фото: https://a.org/1, відео: http://b.org/2.")).toEqual([
      text(0, "Фото: "),
      link(6, "https://a.org/1", "a.org/1"),
      text(21, ", відео: "),
      link(30, "http://b.org/2", "b.org/2"),
      text(44, "."),
    ]);
  });

  it("keeps javascript:, data: and a bare domain as text", () => {
    for (const value of [
      "javascript:alert(1)",
      "data:text/html,<b>hi</b>",
      "hatul-madan.org/blogs/fiv",
    ]) {
      expect(linkParts(value)).toEqual([text(0, value)]);
    }
  });

  it("keeps markup as text and ends a link at «<»", () => {
    const markup = "<script>alert(1)</script>";
    expect(linkParts(markup)).toEqual([text(0, markup)]);
    expect(linkParts(`https://a.org/${markup}`)).toEqual([
      link(0, "https://a.org/", "a.org/"),
      text(14, markup),
    ]);
  });

  it("keeps a URL with a user name before the host as text, and a bare scheme", () => {
    for (const value of ["https://monobank.ua@other.example/pay", "https://", "Сайт: https://."]) {
      expect(linkParts(value)).toEqual([text(0, value)]);
    }
  });

  it("returns text with no link as one part, and nothing for an empty text", () => {
    expect(linkParts("Лагідний кіт")).toEqual([text(0, "Лагідний кіт")]);
    expect(linkParts("")).toEqual([]);
  });
});

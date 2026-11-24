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

  // Review of #578: trimming re-counted the brackets on every step, quadratic on a long «)» run.
  // 100,000 of them takes longer than the test timeout that way, and milliseconds when linear.
  it("trims a very long run of closing brackets and dots, keeping the one the URL opened", () => {
    const tail = ").".repeat(50_000);
    const url = "https://a.org/x(y)";
    expect(linkParts(`${url}${tail}`)).toEqual([
      link(0, url, "a.org/x(y)"),
      text(url.length, tail),
    ]);
  });

  it("links nothing in a run of brackets and dots after a host with no dot", () => {
    const value = `https://localhost/${")".repeat(10_000)}`;
    expect(linkParts(value)).toEqual([text(0, value)]);
  });

  it("ends the link where Cyrillic is glued on, on either side", () => {
    expect(linkParts(`сайт${FIV}Дякуємо`)).toEqual([text(0, "сайт"), link(4), text(37, "Дякуємо")]);
  });

  it("links two https URLs in one paragraph", () => {
    expect(linkParts("Фото: https://a.org/1, відео: https://b.org/2.")).toEqual([
      text(0, "Фото: "),
      link(6, "https://a.org/1", "a.org/1"),
      text(21, ", відео: "),
      link(30, "https://b.org/2", "b.org/2"),
      text(45, "."),
    ]);
  });

  // Audit 2026-11-24 (A-L2): the donation links' host rule. What fails it is shown as written.
  it("keeps http, a lookalike host, an IP address and a user name as text, whole", () => {
    for (const value of [
      "http://b.org/2",
      "HTTP://monobank.ua/jar",
      "https://xn--mnobank-3ya.ua/jar",
      "https://monobank.xn--j1amh/jar",
      "https://XN--80ak6aa92e.com/",
      "https://192.0.2.10/pay",
      "https://0x7f.1/pay",
      "https://2130706433/pay",
      "https://[2001:db8::1]/pay",
      "https://localhost/pay",
      "https://monobank.ua@other.example/pay",
      "https://user:pass@monobank.ua/jar",
    ]) {
      expect(linkParts(value), value).toEqual([text(0, value)]);
    }
  });

  it("keeps a refused address as text in a sentence and still links a real host beside it", () => {
    expect(linkParts("Збір: http://monobank.ua/jar або https://send.monobank.ua/jar/1.")).toEqual([
      text(0, "Збір: http://monobank.ua/jar або "),
      link(33, "https://send.monobank.ua/jar/1", "send.monobank.ua/jar/1"),
      text(63, "."),
    ]);
  });

  it("links a real host with a query and a fragment", () => {
    expect(linkParts("https://shelter.example/pay?amount=100#jar")).toEqual([
      link(0, "https://shelter.example/pay?amount=100#jar", "shelter.example/pay?amount=100#jar"),
    ]);
  });

  // Owner, 2026-11-24: the donation links' port rule reaches shelter text; the parser drops
  // `:443` and an empty port, so those must stay text rather than link without them.
  it("keeps an address with an explicit port as text, the default and an empty one included", () => {
    for (const value of [
      "https://shelter.example:8443/pay?amount=100#jar",
      "https://send.monobank.ua:443/jar/abc",
      "https://send.monobank.ua:/jar/abc",
      "HTTPS://SEND.MONOBANK.UA:8080",
    ]) {
      expect(linkParts(value), value).toEqual([text(0, value)]);
    }
    expect(linkParts("Збір: https://send.monobank.ua:443/jar, дякуємо")).toEqual([
      text(0, "Збір: https://send.monobank.ua:443/jar, дякуємо"),
    ]);
  });

  it("keeps javascript:, data: and a bare domain as text", () => {
    for (const value of [
      "javascript:alert(1)",
      "JavaScript:void(0)",
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

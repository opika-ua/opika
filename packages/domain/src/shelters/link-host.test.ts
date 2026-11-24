import { describe, expect, it } from "vitest";
import { donationUrlProblemOf } from "./donation";
import { isLiveLinkUrl, linkAddressProblemOf, linkHostProblemOf } from "./link-host";

const USERINFO = [
  "https://user@send.monobank.ua/jar",
  "https://send.monobank.ua@evil.example/jar",
  "https://user:secret@example.org/",
  "https://@example.org/",
];
const IDN = [
  "https://xn--monobank-9ve.ua/jar",
  "https://send.xn--80ak6aa92e.com/",
  "https://XN--e1afmkfd.xn--p1ai/",
  "https://%78n--e1afmkfd.com/",
  "https://send.mоnobаnk.ua/jar",
  "https://банка.укр/",
];

/** IPv4 in every spelling the parser folds to dotted decimal, and IPv6 in brackets. */
const IP_HOST = [
  "https://192.0.2.10/pay",
  "https://0x7f.1/pay",
  "https://2130706433/pay",
  "https://0177.0.0.1/pay",
  "https://192.0.2.10./pay",
  "https://192.0.2.10:8443/pay",
  "https://[2001:db8::1]/pay",
  "https://[2001:db8::1]:8443/pay",
];
/** Any explicit port, the default one and an empty one included; the parser drops both of those. */
const PORT = [
  "https://shelter.example:8443/pay?amount=100#jar",
  "https://send.monobank.ua:443/jar/abc",
  "https://send.monobank.ua:/jar/abc",
  "HTTPS://SEND.MONOBANK.UA:8080",
  "https:send.monobank.ua:8443/jar",
];

describe("linkHostProblemOf: the one host rule for donation links and shelter text", () => {
  it.each(USERINFO)("userinfo: %s", (url) => {
    expect(linkHostProblemOf(url)).toBe("userinfo");
    expect(donationUrlProblemOf(url)).toBe("userinfo");
    expect(isLiveLinkUrl(url)).toBe(false);
  });

  it.each(IDN)("idn: %s", (url) => {
    expect(linkHostProblemOf(url)).toBe("idn");
    expect(donationUrlProblemOf(url)).toBe("idn");
    expect(isLiveLinkUrl(url)).toBe(false);
  });

  it.each(IP_HOST)("ip_host, refused in shelter text as before: %s", (url) => {
    expect(linkHostProblemOf(url)).toBe("ip_host");
    expect(linkAddressProblemOf(url)).toBe("ip_host");
    expect(donationUrlProblemOf(url)).toBe("ip_host");
    expect(isLiveLinkUrl(url)).toBe(false);
  });

  // Owner, 2026-11-24: the port rule is for donation links; linkify is unchanged.
  it.each(PORT)("port, still a link in shelter text: %s", (url) => {
    expect(linkHostProblemOf(url)).toBe("port");
    expect(linkAddressProblemOf(url)).toBe("port");
    expect(donationUrlProblemOf(url)).toBe("port");
    expect(isLiveLinkUrl(url)).toBe(true);
  });

  it.each([
    "https://send.monobank.ua/jar/abc",
    "https://hatul-madan.org/blogs/fiv",
    "https://example.org/a:b?time=10:30#at:1",
    "https://www.liqpay.ua/uk/checkout/domivka",
    // `\` ends an https host as `/` does, so this colon is the path's.
    "https://send.monobank.ua\\:8443/jar",
  ])("a named host with no port has no problem: %s", (url) => {
    expect(linkHostProblemOf(url)).toBeNull();
    expect(linkAddressProblemOf(url)).toBeNull();
  });

  it("names userinfo first, and the audit's address half still sees the port behind it", () => {
    expect(linkHostProblemOf("https://user:pw@example.org:8443/")).toBe("userinfo");
    expect(linkAddressProblemOf("https://user:pw@example.org:8443/")).toBe("port");
    expect(linkAddressProblemOf("https://user:pw@example.org/")).toBeNull();
  });
});

describe("isLiveLinkUrl", () => {
  it.each([
    "https://send.monobank.ua/jar/abc",
    "https://hatul-madan.org/blogs/fiv",
    "HTTPS://Example.org/A",
    "https://shelter.example:8443/pay?amount=100#jar",
  ])("a real host over https is a link: %s", (url) => {
    expect(isLiveLinkUrl(url)).toBe(true);
  });

  it.each([
    "http://send.monobank.ua/jar",
    "https://192.0.2.10/pay",
    "https://0x7f.1/pay",
    "https://2130706433/pay",
    "https://[2001:db8::1]/pay",
    "javascript:alert(1)",
    "data:text/html,<b>hi</b>",
    "ftp://example.org/",
    "https://",
    "not a url",
  ])("anything else is not: %s", (url) => {
    expect(isLiveLinkUrl(url)).toBe(false);
  });
});

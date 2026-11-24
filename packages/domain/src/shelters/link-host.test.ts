import { describe, expect, it } from "vitest";
import { donationUrlProblemOf } from "./donation";
import { isLiveLinkUrl, linkHostProblemOf } from "./link-host";

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

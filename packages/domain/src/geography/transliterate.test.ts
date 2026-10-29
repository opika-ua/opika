import { describe, expect, it } from "vitest";
import { transliterateUk } from "./transliterate";

describe("transliterateUk (KMU 55/2010)", () => {
  it.each([
    ["Київ", "kyiv"],
    ["Бровари", "brovary"],
    ["Ірпінь", "irpin"],
    ["Буча", "bucha"],
    ["Вишгород", "vyshhorod"],
    ["Бориспіль", "boryspil"],
    ["Фастів", "fastiv"],
    ["Біла Церква", "bila tserkva"],
  ])("%s -> %s (the seeded cities)", (uk, latin) => {
    expect(transliterateUk(uk)).toBe(latin);
  });

  it("writes є, ї, й, ю, я differently at the start of a word and inside it", () => {
    expect(transliterateUk("Єнакієве")).toBe("yenakiieve");
    expect(transliterateUk("Їжакевичі")).toBe("yizhakevychi");
    expect(transliterateUk("Йосипівка")).toBe("yosypivka");
    expect(transliterateUk("Юрівка")).toBe("yurivka");
    expect(transliterateUk("Ямпіль")).toBe("yampil");
    expect(transliterateUk("Миколаївка")).toBe("mykolaivka");
    expect(transliterateUk("Олександрія")).toBe("oleksandriia");
    expect(transliterateUk("Новомиколаївка Юхнів")).toBe("novomykolaivka yukhniv");
  });

  it("treats a hyphen as a word start", () => {
    expect(transliterateUk("Івано-Франківськ")).toBe("ivano-frankivsk");
    expect(transliterateUk("Кам'яне-Єрусалим")).toBe("kamiane-yerusalym");
  });

  it("reads зг as zgh and ж as zh", () => {
    expect(transliterateUk("Згурівка")).toBe("zghurivka");
    expect(transliterateUk("Житомир")).toBe("zhytomyr");
  });

  it("distinguishes г from ґ and drops the soft sign", () => {
    expect(transliterateUk("Гадяч")).toBe("hadiach");
    expect(transliterateUk("Ґоронда")).toBe("goronda");
    expect(transliterateUk("Бориспіль")).toBe("boryspil");
  });

  it("covers every letter of the alphabet without leaving Cyrillic behind", () => {
    const alphabet = "абвгґдеєжзиіїйклмнопрстуфхцчшщьюя";
    expect(transliterateUk(alphabet)).not.toMatch(/[Ѐ-ӿ]/);
  });
});

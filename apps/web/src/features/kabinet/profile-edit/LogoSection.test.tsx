import type { KabinetShelterView } from "@opika/contracts";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CompressedPhoto } from "../photos/compress-photo";
import { tempFiles, watchReset, withheldFile } from "../photos/picked-fixtures";
import { LogoSection } from "./LogoSection";

// A set logo renders a real next/image, through ShelterLogoAvatar. next/image's
// own `loaderFile` config only applies inside Next's real build pipeline, which
// a component unit test never runs through (confirmed against `defaultLoader`
// rejecting a relative, non-root storage key even with the CDN env var stubbed)
// - so, same as every other component test in this codebase that renders a
// photo, a real image src is out of scope here; only the one import this file
// actually exercises is mocked, to a plain decorative <img>.
vi.mock("next/image", () => ({
  default: (props: { src: string; alt: string }) => <img src={props.src} alt={props.alt} />,
}));

describe("LogoSection", () => {
  // A logo key resolves to its one CDN URL before next/image (`logoPhotoUrl`), as in production.
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_R2_PUBLIC_BASE_URL", "https://cdn.opika.org.ua"));
  afterEach(() => vi.unstubAllEnvs());

  it("offers «Додати логотип» when there's no logo yet", () => {
    render(
      <LogoSection
        logo={null}
        displayName="Лапа допомоги"
        onView={() => {}}
        client={{ shelter: { logo: { set: vi.fn(), remove: vi.fn() } } } as never}
      />,
    );
    screen.getByRole("button", { name: "Додати логотип" });
    expect(screen.queryByRole("button", { name: "Змінити логотип" })).toBeNull();
    // No logo to remove yet.
    expect(screen.queryByRole("button", { name: "Прибрати логотип" })).toBeNull();
  });

  it("offers «Змінити логотип» and «Прибрати логотип» once a logo is set", () => {
    render(
      <LogoSection
        logo={{ storageKey: "shelters/s/logo/0", width: 160, height: 160 }}
        displayName="Лапа допомоги"
        onView={() => {}}
        client={{ shelter: { logo: { set: vi.fn(), remove: vi.fn() } } } as never}
      />,
    );
    screen.getByRole("button", { name: "Змінити логотип" });
    screen.getByRole("button", { name: "Прибрати логотип" });
    expect(screen.queryByRole("button", { name: "Додати логотип" })).toBeNull();
  });

  it("removing calls client.shelter.logo.remove and reports the new view", async () => {
    const nextView = { logo: null } as unknown as KabinetShelterView;
    const remove = vi.fn().mockResolvedValue(nextView);
    const onView = vi.fn();
    render(
      <LogoSection
        logo={{ storageKey: "shelters/s/logo/0", width: 160, height: 160 }}
        displayName="Лапа допомоги"
        onView={onView}
        client={{ shelter: { logo: { set: vi.fn(), remove } } } as never}
      />,
    );
    screen.getByRole("button", { name: "Прибрати логотип" }).click();
    await vi.waitFor(() => expect(remove).toHaveBeenCalledWith({}));
    await vi.waitFor(() => expect(onView).toHaveBeenCalledWith(nextView));
    await vi.waitFor(() => screen.getByText("Логотип прибрано."));
  });

  describe("a logo the device couldn't compress", () => {
    const renderWith = (
      compress: (file: File) => Promise<CompressedPhoto>,
      reportFailure: () => void,
    ) => {
      const set = vi.fn().mockResolvedValue({ logo: null });
      render(
        <LogoSection
          logo={null}
          displayName="Лапа допомоги"
          onView={() => {}}
          client={{ shelter: { logo: { set, remove: vi.fn() } } } as never}
          compress={compress}
          reportFailure={reportFailure}
        />,
      );
      fireEvent.change(screen.getByTestId("logo-file-input"), {
        target: { files: [new File(["x"], "logo.png", { type: "image/png" })] },
      });
      return set;
    };

    it("is reported once, with what compression said; nothing is sent", async () => {
      const reportFailure = vi.fn();
      const set = renderWith(async () => ({ kind: "too_large" }), reportFailure);
      await screen.findByText("Навіть після зменшення це фото завелике. Спробуйте інше.");
      expect(reportFailure).toHaveBeenCalledTimes(1);
      expect(reportFailure).toHaveBeenCalledWith({ kind: "too_large" }, "logo.png");
      expect(set).not.toHaveBeenCalled();
    });

    it("a compressor that throws is reported with what it threw", async () => {
      const reportFailure = vi.fn();
      const error = new Error("decoder crashed");
      renderWith(async () => {
        throw error;
      }, reportFailure);
      await screen.findByText("Цей файл не вдалося відкрити як фото.");
      expect(reportFailure).toHaveBeenCalledTimes(1);
      expect(reportFailure.mock.calls[0]?.[0]).toMatchObject({ kind: "threw", error });
    });

    it("a file the device won't hand over says so, is reported, and is never decoded", async () => {
      const reportFailure = vi.fn();
      const compress = vi.fn(async (): Promise<CompressedPhoto> => ({ kind: "too_large" }));
      const set = vi.fn();
      render(
        <LogoSection
          logo={null}
          displayName="Лапа допомоги"
          onView={() => {}}
          client={{ shelter: { logo: { set, remove: vi.fn() } } } as never}
          compress={compress}
          reportFailure={reportFailure}
        />,
      );
      fireEvent.change(screen.getByTestId("logo-file-input"), {
        target: { files: [withheldFile("logo.png")] },
      });
      await screen.findByText(
        "Не вдалося прочитати цей файл. Виберіть його ще раз або зробіть знімок екрана.",
      );
      expect(compress).not.toHaveBeenCalled();
      expect(set).not.toHaveBeenCalled();
      expect(reportFailure).toHaveBeenCalledTimes(1);
      expect(reportFailure.mock.calls[0]?.[0]).toMatchObject({ kind: "not_readable" });
      expect(reportFailure.mock.calls[0]?.[1]).toBe("logo.png");
    });

    it("the input is reset only once the file is copied, so the copy still compresses", async () => {
      const compress = vi.fn(async (file: File): Promise<CompressedPhoto> => {
        await file.arrayBuffer();
        return { kind: "ok", file: new Blob(["j"]), width: 160, height: 160 };
      });
      const set = vi.fn().mockResolvedValue({ logo: null });
      const reportFailure = vi.fn();
      render(
        <LogoSection
          logo={null}
          displayName="Лапа допомоги"
          onView={() => {}}
          client={{ shelter: { logo: { set, remove: vi.fn() } } } as never}
          compress={compress}
          reportFailure={reportFailure}
        />,
      );
      const input = screen.getByTestId("logo-file-input") as HTMLInputElement;
      const picked = tempFiles(["logo.jpg"]);
      let reset = false;
      watchReset(input, () => {
        reset = true;
        picked.drop();
      });
      fireEvent.change(input, { target: { files: picked.files } });
      await vi.waitFor(() => expect(set).toHaveBeenCalledTimes(1));
      expect(reset).toBe(true);
      expect(reportFailure).not.toHaveBeenCalled();
    });

    it("a logo that compressed is not reported", async () => {
      const reportFailure = vi.fn();
      const set = renderWith(
        async () => ({ kind: "ok", file: new Blob(["j"]), width: 160, height: 160 }),
        reportFailure,
      );
      await vi.waitFor(() => expect(set).toHaveBeenCalledTimes(1));
      expect(reportFailure).not.toHaveBeenCalled();
    });
  });
});

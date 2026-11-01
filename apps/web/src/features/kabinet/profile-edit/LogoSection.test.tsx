import type { KabinetShelterView } from "@opika/contracts";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
});

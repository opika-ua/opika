import type { ModeratorId, ShelterAdminId, ShelterId } from "@opika/domain";
import { uk } from "@opika/i18n";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderForSheltersPage } from "../../app/prytulkam/page";
import { RegistrationSignedIn } from "./RegistrationSignedIn";
import { RegistrationSignOut } from "./RegistrationSignOut";
import { registrationViewerFrom } from "./registration-viewer";

const s = uk.registration.signedIn;
const shelterId = "s-1" as ShelterId;
const moderatorId = "m-1" as ModeratorId;

describe("who sees the registration form (scenarios A1–A4)", () => {
  it("a shelter admin is told who they are, masked; the operator and a support view are the operator", () => {
    expect(
      registrationViewerFrom(
        { kind: "shelter_admin", shelterAdminId: "a-1" as ShelterAdminId, shelterId },
        "olena@example.org",
      ),
    ).toEqual({ kind: "shelter", maskedEmail: "o•••@example.org" });
    expect(registrationViewerFrom({ kind: "super_admin", moderatorId }, "x@y.ua")).toEqual({
      kind: "operator",
    });
    expect(registrationViewerFrom({ kind: "support_view", moderatorId, shelterId }, null)).toEqual({
      kind: "operator",
    });
  });

  it("anyone else gets the form", () => {
    for (const kind of ["anonymous", "no_role", "conflicting_roles"] as const) {
      expect(registrationViewerFrom({ kind }, "x@y.ua")).toEqual({ kind: "anonymous" });
    }
  });
});

describe("/prytulkam for someone already signed in", () => {
  it("A2: no form; the masked address, «Перейти в кабінет» as a full load, «Вийти»", () => {
    const { container } = render(
      renderForSheltersPage(true, {
        selfRegistration: true,
        registrationCard: (
          <RegistrationSignedIn viewer={{ kind: "shelter", maskedEmail: "o•••@example.org" }} />
        ),
      }),
    );
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(screen.getByText("Ви вже увійшли як o•••@example.org.")).toBeTruthy();
    expect(screen.getByRole("link", { name: s.toKabinet }).getAttribute("href")).toBe("/kabinet");
    expect(screen.getByRole("button", { name: s.signOut })).toBeTruthy();
  });

  it("A3/A4: the operator is sent to the applications, with no form and no sign-out", () => {
    const { container } = render(
      renderForSheltersPage(true, {
        selfRegistration: true,
        registrationCard: <RegistrationSignedIn viewer={{ kind: "operator" }} />,
      }),
    );
    expect(container.querySelector("form")).toBeNull();
    expect(screen.getByText(s.operator)).toBeTruthy();
    expect(screen.getByRole("link", { name: s.toApplications }).getAttribute("href")).toBe(
      "/kabinet/prytulky",
    );
    expect(screen.queryByRole("button", { name: s.signOut })).toBeNull();
  });

  it("«Вийти» reloads after a sign-out that went through, and says so when it did not", async () => {
    const reload = vi.fn();
    const { unmount } = render(
      <RegistrationSignOut
        label={s.signOut}
        failed="failed"
        signOut={async () => {}}
        reload={reload}
      />,
    );
    await act(async () => fireEvent.click(screen.getByRole("button", { name: s.signOut })));
    expect(reload).toHaveBeenCalledOnce();
    unmount();
    render(
      <RegistrationSignOut
        label={s.signOut}
        failed="failed"
        signOut={async () => {
          throw new Error("503");
        }}
        reload={reload}
      />,
    );
    await act(async () => fireEvent.click(screen.getByRole("button", { name: s.signOut })));
    expect(screen.getByRole("alert").textContent).toBe("failed");
    expect(reload).toHaveBeenCalledOnce();
  });
});

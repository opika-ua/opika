import {
  CalendarDateSchema,
  type Coordinates,
  CoordinatesSchema,
  EdrpouSchema,
  type ExactAddress,
  instantOfCalendarDate,
  isShelterDisplayNameTooLong,
  kyivCalendarDateOf,
  type ShelterLegalEntity,
} from "@opika/domain";
import { z } from "zod";
import { type ContactsCheck, type ContactsForm, contactOfForm } from "../../profile-edit/fields";
import {
  type DocumentFreeEvidenceInput,
  type EvidenceRow,
  type EvidenceRowErrors,
  evidenceOfRows,
  normalizeEdrpou,
  trimmedOrNull,
} from "../evidence-editor/evidence-rows";
import type { RegistryCreateInput } from "./registry-create-client";

/**
 * S2's form, pure half: what the operator types, and the
 * `registry.shelters.create` input it becomes. The server parses the result
 * with the contract's own schema (and the tests parse it with that same
 * schema), so this only decides which of Oleksii's messages a field gets
 * before a round trip; it never decides what is stored.
 */

export type LegalKind = ShelterLegalEntity["kind"];
export const LEGAL_KINDS = [
  "registered_ngo",
  "sole_proprietor",
  "unregistered_initiative",
] as const satisfies readonly LegalKind[];

/**
 * Every legal field's text, whichever form is picked, so switching the form
 * back and forth loses nothing typed; only the picked form's fields are sent.
 * `kind` starts null: no default, so the legal form is the operator's choice.
 */
export type LegalForm = {
  kind: LegalKind | null;
  legalName: string;
  edrpou: string;
  /** `YYYY-MM-DD`, as a date input gives it. */
  registeredAt: string;
  contactPersonName: string;
};

export type CreateShelterForm = {
  displayName: string;
  description: string;
  /** A settlement id from `registry.cities.search`, or "" before one is picked. */
  cityId: string;
  line1: string;
  line2: string;
  postalCode: string;
  /** One "lat, lng" field, pasted from a map (RU-T6). */
  coordinates: string;
  legal: LegalForm;
  contacts: ContactsForm;
  evidence: readonly EvidenceRow[];
  adminName: string;
  adminEmail: string;
};

/** The premises address as typed: S2's fields, and S4's address edit form. */
export type AddressForm = Pick<
  CreateShelterForm,
  "cityId" | "line1" | "line2" | "postalCode" | "coordinates"
>;

export const emptyCreateForm = (): CreateShelterForm => ({
  displayName: "",
  description: "",
  cityId: "",
  line1: "",
  line2: "",
  postalCode: "",
  coordinates: "",
  legal: { kind: null, legalName: "", edrpou: "", registeredAt: "", contactPersonName: "" },
  contacts: { phone: "", telegram: "", others: [] },
  evidence: [],
  adminName: "",
  adminEmail: "",
});

/** `create.errors.*` by name, plus K4's `emailFormat` for the first admin's address. */
export type CreateFieldError =
  | "required"
  | "nameTooLong"
  | "edrpouFormat"
  | "coordinatesFormat"
  | "emailFormat";

export type CreateField =
  | "displayName"
  | "description"
  | "cityId"
  | "line1"
  | "coordinates"
  | "legalKind"
  | "legalName"
  | "edrpou"
  | "registeredAt"
  | "contactPersonName"
  | "adminName"
  | "adminEmail";

export type CreateFormErrors = {
  fields: Readonly<Partial<Record<CreateField, CreateFieldError>>>;
  /** K4's contact check (`contactOfForm`), when it found something. */
  contacts: Extract<ContactsCheck, { kind: "invalid" }> | null;
  /** By evidence row id. */
  evidence: Readonly<Record<string, EvidenceRowErrors>>;
};

export type CreateInputCheck =
  | { kind: "ok"; input: RegistryCreateInput }
  | { kind: "invalid"; errors: CreateFormErrors };

/**
 * Two decimal numbers, latitude first, separated by a comma or spaces
 * («50.4501, 30.5234», what a map's "copy coordinates" gives), each in range.
 */
const COORDINATES = /^\s*([+-]?\d+(?:\.\d+)?)\s*[,\s]\s*([+-]?\d+(?:\.\d+)?)\s*$/;

export function coordinatesOf(raw: string): Coordinates | null {
  const match = COORDINATES.exec(raw);
  if (match === null) return null;
  const parsed = CoordinatesSchema.safeParse({ lat: Number(match[1]), lng: Number(match[2]) });
  return parsed.success ? parsed.data : null;
}

const EmailSchema = z.email();

type LegalResult =
  | { kind: "ok"; legalEntity: RegistryCreateInput["legalEntity"] }
  | { kind: "invalid" };

type AddressResult =
  | { kind: "ok"; exactAddress: RegistryCreateInput["exactAddress"] }
  | { kind: "invalid" };

/** The address fields as the contract's `ExactAddress`; the district is never collected (RU-T6). */
export function exactAddressOf(
  form: AddressForm,
  errors: Partial<Record<CreateField, CreateFieldError>>,
): AddressResult {
  if (form.cityId === "") errors.cityId = "required";
  const line1 = trimmedOrNull(form.line1);
  if (line1 === null) errors.line1 = "required";
  let coordinates: Coordinates | null = null;
  if (form.coordinates.trim() === "") errors.coordinates = "required";
  else {
    coordinates = coordinatesOf(form.coordinates);
    if (coordinates === null) errors.coordinates = "coordinatesFormat";
  }
  if (form.cityId === "" || line1 === null || coordinates === null) return { kind: "invalid" };
  return {
    kind: "ok",
    exactAddress: {
      line1,
      line2: trimmedOrNull(form.line2),
      postalCode: trimmedOrNull(form.postalCode),
      cityId: form.cityId,
      district: null,
      coordinates,
    },
  };
}

/** A stored legal entity as S4's edit form starts: every field the picked form has, filled in. */
export function legalFormOf(legal: ShelterLegalEntity): LegalForm {
  const empty = { legalName: "", edrpou: "", registeredAt: "", contactPersonName: "" };
  switch (legal.kind) {
    case "registered_ngo":
      return {
        ...empty,
        kind: legal.kind,
        legalName: legal.legalName,
        edrpou: legal.edrpou,
        registeredAt: kyivCalendarDateOf(legal.registeredAt),
      };
    case "sole_proprietor":
      return { ...empty, kind: legal.kind, legalName: legal.legalName, edrpou: legal.edrpou };
    case "unregistered_initiative":
      return { ...empty, kind: legal.kind, contactPersonName: legal.contactPersonName };
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled kind; unreachable at runtime */
    default: {
      const unreachable: never = legal;
      return unreachable;
    }
  }
}

/** A stored premises address as S4's edit form starts; the district is kept by the caller. */
export const addressFormOf = (address: ExactAddress): AddressForm => ({
  cityId: address.cityId,
  line1: address.line1,
  line2: address.line2 ?? "",
  postalCode: address.postalCode ?? "",
  coordinates: `${address.coordinates.lat}, ${address.coordinates.lng}`,
});

export function legalEntityOf(
  legal: LegalForm,
  errors: Partial<Record<CreateField, CreateFieldError>>,
): LegalResult {
  if (legal.kind === null) {
    errors.legalKind = "required";
    return { kind: "invalid" };
  }
  if (legal.kind === "unregistered_initiative") {
    const contactPersonName = trimmedOrNull(legal.contactPersonName);
    if (contactPersonName === null) {
      errors.contactPersonName = "required";
      return { kind: "invalid" };
    }
    return { kind: "ok", legalEntity: { kind: legal.kind, contactPersonName } };
  }
  const legalName = trimmedOrNull(legal.legalName);
  if (legalName === null) errors.legalName = "required";
  const edrpou = normalizeEdrpou(legal.edrpou);
  if (edrpou === "") errors.edrpou = "required";
  else if (!EdrpouSchema.safeParse(edrpou).success) errors.edrpou = "edrpouFormat";
  if (legal.kind === "sole_proprietor") {
    if (legalName === null || errors.edrpou !== undefined) return { kind: "invalid" };
    return { kind: "ok", legalEntity: { kind: legal.kind, legalName, edrpou } };
  }
  const registeredAt = CalendarDateSchema.safeParse(legal.registeredAt);
  if (!registeredAt.success) errors.registeredAt = "required";
  if (legalName === null || errors.edrpou !== undefined || !registeredAt.success) {
    return { kind: "invalid" };
  }
  return {
    kind: "ok",
    legalEntity: {
      kind: legal.kind,
      legalName,
      edrpou,
      // A calendar date, stored as UTC midnight of that date like every stored day.
      registeredAt: instantOfCalendarDate(registeredAt.data),
    },
  };
}

/**
 * The form as `registry.shelters.create`'s input, or every field's message.
 * `now` is the moment of submitting: it decides "today" for a site visit.
 *
 * The district is never collected and goes as null (RU-T6). The description
 * is Ukrainian only; English goes as null, the shape every operator-entered
 * text takes until a translation exists. The freshness sentence is the
 * shelter's own voice and the contract allows none: null, set later from
 * the shelter's side.
 */
export function createInputOf(form: CreateShelterForm, now: Date): CreateInputCheck {
  const fields: Partial<Record<CreateField, CreateFieldError>> = {};

  const displayName = trimmedOrNull(form.displayName);
  if (displayName === null) fields.displayName = "required";
  // RUI4-F2: the contract's cap, checked here so the field says so before a round trip.
  else if (isShelterDisplayNameTooLong(displayName)) fields.displayName = "nameTooLong";
  const description = trimmedOrNull(form.description);
  if (description === null) fields.description = "required";
  const address = exactAddressOf(form, fields);
  const legal = legalEntityOf(form.legal, fields);
  const contacts = contactOfForm(form.contacts);
  const evidence = evidenceOfRows(form.evidence, now);
  const adminName = trimmedOrNull(form.adminName);
  if (adminName === null) fields.adminName = "required";
  const adminEmail = form.adminEmail.trim();
  if (adminEmail === "") fields.adminEmail = "required";
  else if (!EmailSchema.safeParse(adminEmail).success) fields.adminEmail = "emailFormat";

  if (
    displayName === null ||
    description === null ||
    address.kind !== "ok" ||
    legal.kind !== "ok" ||
    contacts.kind !== "ok" ||
    evidence.kind !== "ok" ||
    adminName === null ||
    Object.keys(fields).length > 0
  ) {
    return {
      kind: "invalid",
      errors: {
        fields,
        contacts: contacts.kind === "invalid" ? contacts : null,
        evidence: evidence.kind === "invalid" ? evidence.errors : {},
      },
    };
  }

  const items: readonly DocumentFreeEvidenceInput[] = evidence.items;
  return {
    kind: "ok",
    input: {
      displayName,
      description: { uk: description, en: null },
      legalEntity: legal.legalEntity,
      exactAddress: address.exactAddress,
      contact: contacts.contact,
      freshnessSentence: null,
      evidence: items,
      firstAdmin: { name: adminName, email: adminEmail },
    },
  };
}

/** No field, contact or evidence message at all. */
export const noCreateErrors = (): CreateFormErrors => ({
  fields: {},
  contacts: null,
  evidence: {},
});

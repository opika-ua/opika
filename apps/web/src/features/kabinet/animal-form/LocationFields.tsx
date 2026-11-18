import type { CityId } from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import { useId } from "react";
import { Combobox, type ComboboxMessages, type ComboboxResult } from "../../../ui/Combobox";
import { Radio } from "../../../ui/form";
import { Heading } from "../../../ui/Heading";
import type { LocationValue } from "./location-values";

const t = uk.kabinet.location;

/**
 * «Де зараз тварина» (§12.2): the shelter's city by default, or «В іншому місті» with the existing
 * settlement combobox. The kit's radio rows and combobox only; `search` is the kabinet's city
 * search, the server stays the authority on which id exists.
 */
export function LocationFields({
  idPrefix,
  shelterCityName,
  value,
  onChange,
  search,
  messages,
  error,
  disabled = false,
}: {
  idPrefix: string;
  shelterCityName: string;
  value: LocationValue;
  onChange: (next: LocationValue) => void;
  search: (query: string, signal: AbortSignal) => Promise<ComboboxResult<CityId>>;
  messages: ComboboxMessages;
  /** `cityPicker.mustPick` while «В іншому місті» has no city. */
  error: string | null;
  disabled?: boolean;
}) {
  const headingId = useId();
  const name = `${idPrefix}-location`;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Heading level={3} look="title" id={headingId}>
        {t.title}
      </Heading>
      <div role="radiogroup" aria-labelledby={headingId} className="flex min-w-0 flex-col gap-2">
        <Radio
          label={fillTemplate(t.shelter, { city: shelterCityName })}
          name={name}
          value="shelter_city"
          checked={value.kind === "shelter_city"}
          disabled={disabled}
          onChange={() => onChange({ kind: "shelter_city" })}
        />
        <Radio
          label={t.other}
          name={name}
          value="own_city"
          checked={value.kind === "own_city"}
          disabled={disabled}
          onChange={() =>
            onChange({ kind: "own_city", city: value.kind === "own_city" ? value.city : null })
          }
        />
      </div>
      {value.kind === "own_city" ? (
        <Combobox<CityId>
          id={`${idPrefix}-location-city`}
          label={uk.kabinet.operator.create.city}
          value={value.city}
          onChange={(city) => onChange({ kind: "own_city", city })}
          search={search}
          messages={messages}
          error={error}
          required
          disabled={disabled}
        />
      ) : null}
    </div>
  );
}

"use client";

import type { FilterSelection } from "@opika/domain";
import { isExplicitlySelected } from "@opika/domain";
import { fillTemplate, ukPublic as uk } from "@opika/i18n/public";
import { type ReactNode, useState } from "react";
import { Button } from "../../ui/Button";
import { TextField } from "../../ui/form";
import { Text } from "../../ui/Text";
import { CITY_LIST_COLLAPSED, type FacetOption, narrowedCityOptions } from "./facet-options";

/**
 * The city options of a filter, for a list that grows with the number of cities holding an animal:
 * the first dozen, a «Показати всі (N)» button, and, once the list is longer than a dozen, a field
 * that narrows the loaded options locally (no request). The field is not part of the URL state,
 * and chosen cities stay drawn whatever it says.
 */
export function CityFacetChoices<T extends string>({
  idPrefix,
  options,
  selection,
  renderOption,
}: {
  /** Distinguishes the field's id where the filter is drawn twice (the desktop panel and the sheet). */
  idPrefix: string;
  options: readonly FacetOption<T>[];
  selection: FilterSelection<T>;
  renderOption: (option: FacetOption<T>) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const long = options.length > CITY_LIST_COLLAPSED;
  const visible = narrowedCityOptions(options, selection, { expanded, query });
  const searching = long && query.trim() !== "";
  const matches = searching
    ? visible.filter((option) => !isExplicitlySelected(selection, option.value)).length
    : visible.length;
  const hiddenByCollapse = long && !expanded && !searching;

  return (
    <>
      {long ? (
        <div className="w-full">
          <TextField
            id={`${idPrefix}-find-city`}
            label={uk.filters.findCity}
            type="search"
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            // Inside the sheet's GET form, Enter would submit it; the field only narrows the list.
            onKeyDown={(event) => {
              if (event.key === "Enter") event.preventDefault();
            }}
          />
        </div>
      ) : null}
      {visible.map(renderOption)}
      {hiddenByCollapse ? (
        <Button variant="secondary" onClick={() => setExpanded(true)}>
          {fillTemplate(uk.filters.showAllOptions, { count: String(options.length) })}
        </Button>
      ) : null}
      {searching && matches === 0 ? (
        <Text look="hint" className="w-full">
          {uk.filters.cityNoMatch}
        </Text>
      ) : null}
      {/* The result count for a screen reader; a sighted user sees the list change. */}
      <p role="status" className="sr-only">
        {searching ? fillTemplate(uk.filters.cityFound, { count: String(matches) }) : ""}
      </p>
    </>
  );
}

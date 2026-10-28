import { formatHits, type Hit } from "./scan";

/**
 * Compares per-file match counts against a ceiling table. A ceiling can only go
 * down: more matches than the ceiling fails (a new violation), fewer fails too,
 * with the number to lower it to, so a migration PR has to record its progress
 * in the same diff that earns it.
 */
export function ratchetProblems(
  rule: string,
  actual: Map<string, Hit[]>,
  ceilings: Readonly<Record<string, number>>,
): string[] {
  const problems: string[] = [];
  for (const [file, hits] of actual) {
    const ceiling = ceilings[file] ?? 0;
    if (hits.length > ceiling) {
      problems.push(
        `${rule}: ${hits.length} in ${file}, allowed ${ceiling}. ` +
          `Use the kit/tokens instead, or (arbitrary values, hex only) add a reasoned entry.\n${formatHits(hits)}`,
      );
    } else if (hits.length < ceiling) {
      problems.push(
        `${rule}: ${file} is down to ${hits.length}; lower its ceiling from ${ceiling}.`,
      );
    }
  }
  for (const [file, ceiling] of Object.entries(ceilings)) {
    if (!actual.has(file) && ceiling > 0) {
      problems.push(`${rule}: ${file} has no matches left; delete its entry (was ${ceiling}).`);
    }
  }
  return problems;
}

/** An allowance that has to say why it exists. */
export interface Reasoned {
  readonly max: number;
  readonly reason: string;
}

export function ceilingsOf(table: Readonly<Record<string, Reasoned>>): Record<string, number> {
  return Object.fromEntries(Object.entries(table).map(([file, { max }]) => [file, max]));
}

/** A property of a value of unknown shape, or undefined: for reading request bodies and errors. */
export const field = (source: unknown, name: string): unknown =>
  typeof source === "object" && source !== null
    ? (source as Record<string, unknown>)[name]
    : undefined;

/** A string property of a value of unknown shape, or null. */
export const stringField = (source: unknown, name: string): string | null => {
  const value = field(source, name);
  return typeof value === "string" ? value : null;
};

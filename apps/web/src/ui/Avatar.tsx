import { cx } from "./cx";
import { Photo } from "./Photo";

/**
 * A shelter's logo, or - with none - the initials of its name. Decorative either way: the name is
 * always shown as text beside it, so it is hidden from assistive tech.
 */
const SIZE = {
  sm: { box: "size-8 text-caption", sizes: "32px" },
  md: { box: "size-10 text-label", sizes: "40px" },
  lg: { box: "size-14 text-title tablet:size-20", sizes: "80px" },
  xl: { box: "size-24 text-title tablet:size-40", sizes: "160px" },
} as const;

const FIRST_LETTER = /[A-Za-zА-ЩЬЮЯЄІЇҐа-щьюяєіїґ]/;

/** First letter of each of the first two words, skipping leading punctuation («Домівка» starts with a guillemet). */
export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.match(FIRST_LETTER)?.[0]?.toUpperCase() ?? "")
    .join("");
}

export type AvatarProps = {
  size?: keyof typeof SIZE;
  className?: string;
} & ({ kind: "logo"; src: string } | { kind: "initials"; name: string });

export function Avatar(props: AvatarProps) {
  const { box, sizes } = SIZE[props.size ?? "md"];
  if (props.kind === "logo") {
    return (
      <span
        aria-hidden="true"
        className={cx("shrink-0 overflow-clip rounded-pill", box, props.className)}
      >
        <Photo src={props.src} alt="" sizes={sizes} aspect="square" className="size-full" />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-pill bg-line font-semibold text-ink",
        box,
        props.className,
      )}
    >
      {initialsOf(props.name)}
    </span>
  );
}

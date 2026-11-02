/**
 * The kabinet's page frame, one source for the header row and the body row under it, so the logo
 * and the sidebar's left edge sit on the same gutter line. Swap these two for the shared header
 * frame token when it lands (header-frame PR); nothing else in the kabinet names a width.
 */
export const FRAME_INNER = "mx-auto w-full max-w-400";
export const FRAME_GUTTER = "px-4 tablet:px-6 desktop:px-8";

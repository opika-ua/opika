import { registrationLinkHandler } from "../../../../kabinet/registration/email-link-runtime";

/** «Підтвердити email» from the confirmation email: a GET shows the button, its POST confirms. */
const handle = registrationLinkHandler("confirm_email");

export const GET = handle;
export const POST = handle;

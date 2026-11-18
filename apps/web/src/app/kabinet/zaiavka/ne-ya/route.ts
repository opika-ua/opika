import { registrationLinkHandler } from "../../../../kabinet/registration/email-link-runtime";

/** «Це не я» from the confirmation email: a GET shows the button, its POST withdraws the application. */
const handle = registrationLinkHandler("not_me");

export const GET = handle;
export const POST = handle;

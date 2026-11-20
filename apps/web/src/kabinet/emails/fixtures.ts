import { OPERATOR_CONTACT, SITE_ORIGIN } from "../../brand";
import type { EmailTemplate, EmailTemplateInput } from "./templates";

/**
 * One fictional input per template, for the preview and the kit's tests: a made-up shelter,
 * example.org addresses and links whose tokens mean nothing. No real shelter data (repo is public).
 */
const site = (path: string) => new URL(path, SITE_ORIGIN).toString();
const shelterName = "Тестовий хвіст";
const operatorName = "Олексій";
const expiresAt = new Date("2026-12-04T10:00:00Z");

export const EMAIL_FIXTURES: {
  [K in EmailTemplate]: Extract<EmailTemplateInput, { template: K }>;
} = {
  application_confirm: {
    template: "application_confirm",
    name: shelterName,
    confirmUrl: site("/kabinet/zaiavka/pidtverdyty?token=TEST-confirm-0000"),
    notMeUrl: site("/kabinet/zaiavka/ne-ya?token=TEST-not-me-0000"),
  },
  application_approved: {
    template: "application_approved",
    name: shelterName,
    kabinetUrl: site("/kabinet"),
  },
  application_rejected: {
    template: "application_rejected",
    name: shelterName,
    reason: { code: "identity_unverifiable", note: null },
  },
  sign_in: {
    template: "sign_in",
    url: site("/kabinet/vkhid/pidtverdzhennia?token=TEST-sign-in-0000"),
    ttlMinutes: 15,
    operatorName,
  },
  invite: {
    template: "invite",
    url: site("/kabinet/vkhid?zaproshennia=TEST-invite-0000"),
    shelterName,
    operatorName,
    shelterVerification: "not_yet_verified",
    ttlHours: 72,
  },
  password_reset: {
    template: "password_reset",
    url: site("/kabinet/vkhid/novyi-parol?token=TEST-reset-0000"),
    ttlMinutes: 60,
    operatorName,
  },
  password_changed: {
    template: "password_changed",
    contact: OPERATOR_CONTACT.email,
    operatorName,
  },
  shelter_verified: {
    template: "shelter_verified",
    shelterName,
    kabinetUrl: site("/kabinet"),
    operatorName,
  },
  early_listing_allowed: {
    template: "early_listing_allowed",
    shelterName,
    expiresAt,
    animalsUrl: site("/kabinet/tvaryny"),
    operatorName,
  },
  donation_approved: {
    template: "donation_approved",
    host: "send.example.org",
    shownNow: true,
    profileUrl: site("/kabinet/prytulok"),
    operatorName,
  },
  donation_rejected: {
    template: "donation_rejected",
    host: "send.example.org",
    profileUrl: site("/kabinet/prytulok"),
    operatorName,
  },
  freshness_reminder: {
    template: "freshness_reminder",
    shelterName,
    staleCards: 3,
    animalsUrl: site("/kabinet/tvaryny"),
    operatorName,
  },
  review_requested: {
    template: "review_requested",
    shelterName,
    shelterUrl: site("/kabinet/prytulky/TEST-shelter"),
  },
  donation_proposed: {
    template: "donation_proposed",
    shelterName,
    host: "send.example.org",
    shelterUrl: site("/kabinet/prytulky/TEST-shelter"),
  },
  early_listing_ending: {
    template: "early_listing_ending",
    shelterName,
    expiresAt,
    period: 1,
    shelterUrl: site("/kabinet/prytulky/TEST-shelter"),
  },
  operator_new_application: {
    template: "operator_new_application",
    name: shelterName,
    cityName: "Київ",
    link: "https://www.instagram.com/example",
    contact: "Telegram: @example",
    email: "olena@example.org",
    queueUrl: site("/kabinet/prytulky"),
  },
  registration_cap_hit: {
    template: "registration_cap_hit",
    count: 300,
    queueUrl: site("/kabinet/prytulky"),
  },
  notification_cap_warning: { template: "notification_cap_warning", count: 240, cap: 300 },
};

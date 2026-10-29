/**
 * Every file that starts with a `"use client"` directive, and why. A new client file has to be added
 * here with a one-line reason; `SERVER CANDIDATE` marks the five that could shrink or go server-side
 * (`docs/ui/inventory-2026-10.md`, section 4). Remove an entry when the directive goes.
 */
export const CLIENT_FILES: Readonly<Record<string, string>> = {
  "app/dev/ui/Demos.tsx": "showcase state for Modal, Popover and the toggle chip (dev only)",
  "app/dev/ui/SegmentedDemo.tsx": "showcase state for SegmentedControl (dev only)",
  "ui/dialog-core.ts": "hook: showModal, scroll lock, backdrop click on the native dialog",
  "ui/PhotoSlider.tsx": "scroll position state and ResizeObserver for the prev/next buttons",
  "ui/Tabs.tsx": "selected-tab state and roving focus",
  "ui/Toast.tsx": "toast queue state, timers and context",
  "ui/Menu.tsx": "controlled open state, outside-press and Esc listeners",
  "ui/Modal.tsx": "controlled dialog; refs and the dialog core",
  "ui/ErrorSummary.tsx":
    "item buttons focus their field (click handler); ref is the form's focus target",
  "ui/Popover.tsx": "open state, outside-press and Esc listeners",
  "ui/StickyActionBar.tsx":
    "VisualViewport listeners (keyboard lift), ResizeObserver and a focus listener for scroll padding",
  "ui/Sheet.tsx": "open state and hash-link upgrade to showModal; no-JS :target path stays",
  "app/tvaryny/error.tsx": "Next error boundary (must be client); retry button, focus on mount",
  "app/tvaryny/gortaty/error.tsx": "Next error boundary (must be client); retry button",
  "features/animal-detail/CircleButton.tsx":
    "SERVER CANDIDATE (directive removable (callers that pass handlers are client files anyway)): none found: no hooks or handlers of its own, only forwards button props",
  "features/animal-detail/DetailPhotoGallery.tsx":
    "scroll-snap slider tracks active slide, prev/next scrolling",
  "features/animal-detail/PillButton.tsx":
    "SERVER CANDIDATE (directive removable): none found: forwards button props only",
  "features/animal-detail/RevealFlow.tsx":
    "contact-reveal button + dialog open state, calls reveal",
  "features/animal-detail/ShareButton.tsx": "navigator.share / clipboard on click",
  "features/animal-overlay/AnimalOverlay.tsx":
    "intercepted-route modal: router.back, Esc, focus trap, scroll lock, entrance animation",
  "features/chrome/SiteAnalytics.tsx": "Vercel Analytics component",
  "features/controls/ModalDialog.tsx": "focus trap/restore, Esc, backdrop click (useModalFocus)",
  "features/controls/useModalFocus.ts": "hook: focus trap and restore",
  "features/controls/useScrollingClass.ts": "hook: scroll listener toggling a class",
  "features/discovery/DeckScreen.tsx": "swipe deck page shell: feed hook, keyboard, router",
  "features/discovery/SwipeCard.tsx":
    "Low value to change (always inside client SwipeDeck, no bundle saving): only forwards onTap to the card; no own state",
  "features/discovery/SwipeDeck.tsx":
    "pointer-event gesture engine, fetch of swipes, transform animation",
  "features/discovery/use-feed-deck.ts": "hook: feed paging through the browser oRPC client",
  "features/filters/use-feed-filters.ts": "hook: filter state persisted via window",
  "features/gallery/ArrowKeyGrid.tsx": "2D arrow-key navigation over the card grid",
  "features/gallery/FilterSheet.tsx": "dialog.showModal(), form submit to router, scroll lock",
  "features/gallery/GalleryControlBlock.tsx":
    "filter-row disclosure: open state, matchMedia, outside click",
  "features/gallery/GalleryFilterDropdowns.tsx": "popover state, pointer-outside, keyboard",
  "features/gallery/ReplaceNav.tsx": "router.replace on filter link click (no history entry)",
  "features/kabinet/SignInCard.tsx": "sign-in form, fetch, resend timer",
  "features/kabinet/SignOutButton.tsx": "POST sign-out then navigate",
  "features/kabinet/SupportBanner.tsx": "exit-support POST button",
  "features/kabinet/animal-form/AnimalForm.tsx":
    "large form: state, submit, browser client, unsaved-changes guard",
  "features/kabinet/animal-form/FormSections.tsx":
    "Low value to change (only used inside client AnimalForm): controlled inputs (onChange props)",
  "features/kabinet/animal-form/PhotoSection.tsx":
    "photo upload with pointer drag-reorder, browser client",
  "features/kabinet/animal-list/AnimalList.tsx": "row menus, dialogs, browser-client mutations",
  "features/kabinet/animal-list/AnimalListRow.tsx": "row menu toggle and keyboard",
  "features/kabinet/animal-list/ListDialogs.tsx": "three confirm dialogs with local state",
  "features/kabinet/operator/HistoryList.tsx":
    'SERVER CANDIDATE (server list + small load-more island): "load more" through the browser client',
  "features/kabinet/operator/ShelterRows.tsx":
    "SERVER CANDIDATE (server rows + island for the filter): row list with status filter and browser-client paging",
  "features/kabinet/operator/actions/AdminsManager.tsx": "invite/remove admins form + dialog",
  "features/kabinet/operator/actions/DecisionPanel.tsx": "verification decision controls + dialogs",
  "features/kabinet/operator/actions/DonationDecision.tsx": "approve/reject donation link buttons",
  "features/kabinet/operator/actions/OperatorActionsRoot.tsx":
    "router.refresh wrapper around the provider",
  "features/kabinet/operator/actions/ReasonDialog.tsx": "reason textarea inside ModalDialog",
  "features/kabinet/operator/actions/RenameForm.tsx": "inline rename form, focus management",
  "features/kabinet/operator/actions/ResubmitPanel.tsx": "resubmit evidence panel with state",
  "features/kabinet/operator/actions/SupportEntry.tsx": "start-support-view button",
  "features/kabinet/operator/actions/operator-actions.tsx":
    "React context + pending/outcome state for operator actions",
  "features/kabinet/operator/actions/use-router-reread.ts":
    "hook: router.refresh after a mutation, transition",
  "features/kabinet/operator/create/CreateShelterForm.tsx": "create-shelter form",
  "features/kabinet/operator/create/CreatedShelter.tsx": "copy-to-clipboard success state",
  "features/kabinet/operator/evidence-editor/EvidenceEditor.tsx": "dynamic evidence rows",
  "features/kabinet/password/ChangePasswordSection.tsx": "password-change form",
  "features/kabinet/password/ForgotPasswordCard.tsx": "forgot-password form",
  "features/kabinet/password/InviteUnusableCard.tsx":
    "uses useTokenOutOfAddressBar (strips token from URL)",
  "features/kabinet/password/NewPasswordFields.tsx": "two controlled password inputs",
  "features/kabinet/password/PasswordField.tsx": "show/hide toggle state",
  "features/kabinet/password/ResetPasswordCard.tsx": "reset form, token strip",
  "features/kabinet/password/SetPasswordCard.tsx": "set-password form, token strip",
  "features/kabinet/password/use-token-out-of-address-bar.ts":
    "hook: history.replaceState to drop the token",
  "features/kabinet/profile-edit/ContactFields.tsx": "controlled contact inputs",
  "features/kabinet/profile-edit/ContactsSection.tsx": "section form with save state",
  "features/kabinet/profile-edit/DonationSection.tsx": "donation link form",
  "features/kabinet/profile-edit/LogoSection.tsx": "logo upload via browser client",
  "features/kabinet/profile-edit/PauseControl.tsx": "pause/unpause dialog",
  "features/kabinet/profile-edit/ProfileEditor.tsx": "editor shell: section states, browser client",
  "features/kabinet/profile-edit/SaveBar.tsx":
    "Low value to change (only used inside client sections): save/cancel/reload buttons (props-driven)",
  "features/kabinet/profile-edit/VoiceSection.tsx": "sentence form with live announce",
  "features/likes/SaveButton.tsx": "toggles saved state in localStorage",
  "features/likes/SavedNavLink.tsx": "reads saved count from localStorage after hydration",
  "features/likes/SavedPageScreen.tsx":
    "SERVER CANDIDATE (server shell (header, footer, skeletons) + one client list island): whole /zberezheni screen reads localStorage and renders from it",
  "features/reveal/ContactRevealDialog.tsx": "own modal: focus, Esc, scroll lock, reveal call",
  "features/reveal/useReveal.ts": "hook: reveal call via the browser client",
  "image-loader.ts":
    "next/image custom loader; directive is deliberate (next.config.ts comment: a function prop from a Server Component into next/image fails at request time)",
};

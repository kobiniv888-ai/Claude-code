import type { Permission } from "@/lib/auth/permissions";

/**
 * The endpoint registry (SECURITY_REPORT 4.8.a/b, 12.6.a): EVERY server action (each export of a
 * "use server" module) and EVERY route handler (each HTTP method a route.ts exports), with who may
 * call it. tests/unit/endpoints/endpoint-registry.test.ts walks src/ and fails when:
 *
 *   - an endpoint is missing here (a new action or route needs its rule first), or an entry here
 *     names an endpoint that no longer exists;
 *   - the code does not carry the guard its rule asks for (read from the source: the permission
 *     string of runStaffAction / runContentAction / requireStaffForAction, requireUserForAction,
 *     the cron secret check, the webhook signature check, a rate limit on every open endpoint, a
 *     2-step check wherever getCurrentUser() is used);
 *   - and, called for real with each staff role (and signed out, as a regular account, with the
 *     2-step code still pending), a staff endpoint lets through a role that lacks its permission,
 *     or a signed-in endpoint answers anyone but a fully signed-in account.
 *
 * Access kinds:
 *   staff(p)   staff with permission p (src/lib/auth/permissions.ts), 2-step login done, the
 *              staff cookie and the 12-hour idle rule (runStaffAction / requireStaffForAction);
 *              adminOnly(p) also an ADMIN-only check inside (canRevealReporter, canSetVisited…);
 *   USER       a signed-in account with its 2-step code entered when it has 2-step login
 *              (requireUserForAction); ownership is checked by each endpoint on the object;
 *   pending2fa the 2-step login itself: a session whose code is not entered yet may call it;
 *   public     anyone, signed out too: validated and rate-limited (or `noRateLimit` says why not);
 *              when it reads the session, a 2-step-pending session counts as signed out;
 *   token      a secret token in the link is the key (calendar feeds, unsubscribe links);
 *   cron       Vercel Cron with CRON_SECRET;
 *   webhook    a signed call from a provider;
 *   dev        test mode on a development host only (404 on the real site);
 *   auth       Better Auth's own handler (its endpoints and hooks: src/lib/auth/server.ts).
 */

export type Access =
  /** `adminOnly`: the endpoint also checks for an ADMIN in its body (a founder's decision). */
  | { kind: "staff"; permission: Permission; adminOnly?: string }
  | { kind: "user" }
  | { kind: "pending2fa"; why: string; noRateLimit?: string }
  | { kind: "public"; why: string; noRateLimit?: string }
  | { kind: "token"; why: string }
  | { kind: "cron" }
  | { kind: "webhook"; why: string }
  | { kind: "dev"; why: string }
  | { kind: "auth"; why: string };

const USER: Access = { kind: "user" };
const CRON: Access = { kind: "cron" };
const staff = (permission: Permission): Access => ({ kind: "staff", permission });
const adminOnly = (permission: Permission, why: string): Access => ({ kind: "staff", permission, adminOnly: why });
const pending2fa = (why: string, noRateLimit?: string): Access => ({ kind: "pending2fa", why, ...(noRateLimit ? { noRateLimit } : {}) });
const publicAccess = (why: string, noRateLimit?: string): Access => ({ kind: "public", why, ...(noRateLimit ? { noRateLimit } : {}) });
const token = (why: string): Access => ({ kind: "token", why });

/** Server actions: module (from the repository root) → export → access. */
export const SERVER_ACTIONS: Record<string, Record<string, Access>> = {
  "src/lib/account/actions.ts": {
    runListingAction: USER,
    submitIdVerification: USER,
    submitOwnershipVerification: USER,
    submitBusinessVerification: USER,
    updateProfile: USER,
    removeAvatar: USER,
    updateContactEmail: USER,
    updatePreferences: USER,
    updateNotifications: USER,
    unlinkSocialAccount: USER,
    deleteMyAccount: USER,
  },
  "src/lib/account/compare-actions.ts": {
    getCompareItems: USER,
  },
  "src/lib/admin/actions/flags.ts": {
    markBookingFlagReviewedAction: staff("moderation"),
    markHostFlagReviewedAction: staff("moderation"),
    clearNoShowAction: staff("moderation"),
    markLongStayReviewedAction: staff("moderation"),
    markGuestFlagReviewedAction: staff("moderation"),
  },
  "src/lib/admin/actions/moderation.ts": {
    approveListingAction: staff("moderation"),
    requestChangesAction: staff("moderation"),
    rejectListingAction: staff("moderation"),
    restoreListingAction: staff("moderation"),
  },
  "src/lib/admin/actions/outbox.ts": {
    resendOutboxEmailAction: staff("settings"),
  },
  "src/lib/admin/actions/reference-prices.ts": {
    saveReferencePriceAction: staff("moderation"),
    setReferencePriceActiveAction: staff("moderation"),
  },
  "src/lib/admin/actions/reports.ts": {
    resolveReport: staff("reports"),
    dismissReport: staff("reports"),
    warnReportedUser: staff("reports"),
    hideHostListings: staff("reports"),
    removeReportedHost: staff("reports"),
    revealReporter: adminOnly("reports", "telling a host who reported is the founder's decision (PLAN.md answer 10, Q12)"),
    saveReportNote: staff("reports"),
    hideReportedListing: staff("reports"),
    restoreReportedListing: staff("reports"),
  },
  "src/lib/admin/actions/tickets.ts": {
    staffReplyAction: staff("tickets"),
    setTicketStatusAction: staff("tickets"),
    assignTicketAction: staff("tickets"),
  },
  "src/lib/admin/actions/users.ts": {
    setIdVerified: staff("users.manage"),
    warnUserAction: staff("users.manage"),
    suspendUserAction: staff("users.manage"),
    banUserAction: staff("users.manage"),
    reactivateUserAction: staff("users.manage"),
    changeRole: staff("roles"),
    addAdminNote: staff("users.view"),
  },
  "src/lib/admin/actions/verifications.ts": {
    approveVerification: staff("verifications"),
    rejectVerification: staff("verifications"),
  },
  "src/lib/admin/badges/actions.ts": {
    setVisitedAction: adminOnly("moderation", "the \"we visited\" badge (brief 8.3): moderators see the page read-only"),
    clearVisitedAction: adminOnly("moderation", "the \"we visited\" badge (brief 8.3): moderators see the page read-only"),
  },
  "src/lib/admin/content/actions/banned-words.ts": {
    saveBannedWord: staff("content"),
    addBannedWordsBulk: staff("content"),
    deleteBannedWord: staff("content"),
    testBannedWords: staff("content"),
    setScamBannerEnabled: staff("content"),
  },
  "src/lib/admin/content/actions/cities.ts": {
    saveCity: staff("content"),
    deleteCity: staff("content"),
    saveNeighborhood: staff("content"),
    deleteNeighborhood: staff("content"),
    uploadCityPhoto: staff("content"),
  },
  "src/lib/admin/content/actions/editorial.ts": {
    saveArticle: staff("content"),
    deleteArticle: staff("content"),
    saveFaqItem: staff("content"),
    deleteFaqItem: staff("content"),
    reorderFaqItems: staff("content"),
    saveScamAlert: staff("content"),
    deleteScamAlert: staff("content"),
  },
  "src/lib/admin/content/actions/home.ts": {
    saveHomeSections: staff("content"),
    searchListingsToFeature: staff("content"),
    addFeaturedListing: staff("content"),
    removeFeaturedListing: staff("content"),
    removeEndedFeatured: staff("content"),
  },
  "src/lib/admin/content/actions/places.ts": {
    savePlace: staff("content"),
    deletePlace: staff("content"),
  },
  "src/lib/admin/content/actions/roles.ts": {
    assignStaffRole: staff("roles"),
    removeStaffRole: staff("roles"),
    findUsersForRole: staff("roles"),
  },
  "src/lib/admin/content/actions/saved-replies.ts": {
    saveSavedReply: staff("tickets"),
    deleteSavedReply: staff("tickets"),
  },
  "src/lib/admin/content/actions/settings.ts": {
    saveSettings: staff("settings"),
    saveEmergencyContacts: staff("settings"),
    deleteAllDemoData: staff("settings"),
  },
  "src/lib/admin/content/actions/translations.ts": {
    saveTranslationOverride: staff("content"),
    resetTranslationOverride: staff("content"),
  },
  "src/lib/admin/maintenance/actions.ts": {
    createBackupAction: staff("settings"),
    dryRunCleanupAction: staff("settings"),
    runCleanupAction: staff("settings"),
  },
  // Incident tools (SECURITY_REPORT 12.5.c, 17.1): ADMIN only (canUseIncidentTools).
  "src/lib/admin/maintenance/incident-actions.ts": {
    setMaintenanceModeAction: adminOnly("settings", "maintenance mode takes the whole site offline: the founder's incident tool"),
    endAllSessionsAction: adminOnly("settings", "signs every account out, staff included: the founder's incident tool"),
  },
  "src/lib/alerts/actions.ts": {
    setAlertChannelAction: USER,
    connectTelegramAction: USER,
    telegramLinkStatusAction: USER,
    disconnectTelegramAction: USER,
    savePushSubscriptionAction: USER,
    removePushDeviceAction: USER,
    sendTestAlertAction: USER,
  },
  "src/lib/alerts/unsubscribe-actions.ts": {
    submitUnsubscribe: token("the signed unsubscribe link from an email; works signed out"),
  },
  "src/lib/auth/actions.ts": {
    startTotpEnrollment: USER,
    confirmTotpEnrollment: USER,
    verifyTotpForSession: pending2fa("the 2-step code step itself: a signed-in session whose code is not entered yet"),
    verifyRecoveryCodeForSession: pending2fa("a recovery code instead of the authenticator, at the 2-step step"),
    disableTotp: USER,
    regenerateRecoveryCodes: USER,
    getLoginState: pending2fa("tells the login dialog what the session still needs", "read-only state of the caller's own session"),
  },
  "src/lib/auth/contact-email-actions.ts": {
    sendContactEmailCode: USER,
    confirmContactEmailChange: USER,
    removeContactEmail: USER,
  },
  "src/lib/auth/fresh-proof-actions.ts": {
    getProofOptions: USER,
    sendProofCode: USER,
    confirmProof: USER,
    sendUnlockCode: pending2fa("a staff account locked by the daily 2-step limit asks for the email code that resets the counter (decision 5)"),
    confirmUnlockCode: pending2fa("confirms that email code; it only resets the counter (decision 5)"),
  },
  "src/lib/auth/logout-actions.ts": {
    logOutHere: publicAccess("signs the caller out of this session", "only ends the caller's own session"),
    logOutEverywhere: USER,
  },
  "src/lib/auth/phone-check-actions.ts": {
    sendPhoneCheckCode: USER,
    confirmPhoneCheckCode: USER,
  },
  "src/lib/auth/profile-actions.ts": {
    saveFirstName: USER,
  },
  // The founder's SMS controls (SECURITY_REPORT 3.2.c/d): "settings" is ADMIN only; fresh code, audited.
  "src/lib/auth/sms-control-actions.ts": {
    resumeSmsCountryAction: staff("settings"),
    resetSmsBudgetAction: staff("settings"),
  },
  "src/lib/booking/actions.ts": {
    quoteBookingAction: publicAccess("the price of a stay for signed-out visitors too"),
    createBookingAction: USER,
    cancelBookingAsGuestAction: USER,
    cancelBookingAsHostAction: USER,
    reportNoShowAction: USER,
  },
  "src/lib/booking/alert-actions.ts": {
    hostAlertStatusAction: USER,
  },
  "src/lib/booking/date-price-actions.ts": {
    saveDatePriceAction: USER,
    deleteDatePriceAction: USER,
  },
  "src/lib/booking/host-actions.ts": {
    saveHostBlocksAction: USER,
    saveRoomBlocksAction: USER,
    saveIcalImportsAction: USER,
    syncIcalNowAction: USER,
    replaceCalendarLinkAction: USER,
  },
  "src/lib/contact/actions.ts": {
    revealContact: USER,
    recordContactTap: USER,
    markSafetyTipSeen: USER,
    sendContactEmail: USER,
  },
  "src/lib/currency/actions.ts": {
    setDisplayCurrency: publicAccess("the display currency cookie"),
    clearDisplayCurrency: publicAccess("clears the display currency cookie (and the signed-in account's choice)"),
  },
  "src/lib/home/actions.ts": {
    getHomeRecommendedAction: publicAccess("public listing cards for a home tab"),
  },
  "src/lib/listing/card-actions.ts": {
    getListingCardsAction: publicAccess("public listing cards by public id"),
  },
  "src/lib/listing/favorites.ts": {
    toggleFavorite: USER,
    updateFavoriteNote: USER,
    getFavoriteIds: publicAccess("the caller's own saved ids; empty when signed out", "read-only, the caller's own rows"),
  },
  "src/lib/listing/mistake-check-actions.ts": {
    loadMistakeCheck: USER,
  },
  "src/lib/listing-page/actions.ts": {
    trackListingView: publicAccess("counts a listing view (no personal data)"),
  },
  "src/lib/lists/actions.ts": {
    getSaveTargetsAction: USER,
    getMyListsAction: USER,
    saveToListAction: USER,
    createListAction: USER,
    renameListAction: USER,
    deleteListAction: USER,
    setListSharingAction: USER,
    copySharedListAction: USER,
    mergeDeviceListsAction: USER,
    getDeviceCardsAction: publicAccess("cards for the lists kept on a signed-out device"),
  },
  "src/lib/pledge/actions.ts": {
    acceptPledge: USER,
  },
  "src/lib/pricing/actions.ts": {
    loadListingPriceGuide: USER,
  },
  "src/lib/recently-viewed/actions.ts": {
    syncRecentlyViewedAction: USER,
    clearRecentlyViewedAction: USER,
  },
  "src/lib/reports/actions.ts": {
    createReport: USER,
    createTurnedAwayReport: USER,
    blockUser: USER,
    unblockUser: USER,
  },
  "src/lib/reviews/actions.ts": {
    createReview: USER,
    replyToReview: USER,
    reportReview: USER,
    setReviewRequests: USER,
  },
  "src/lib/reviews/admin-actions.ts": {
    hideReviewAction: staff("reports"),
    showReviewAction: staff("reports"),
  },
  "src/lib/saved-searches/actions.ts": {
    saveSearchAction: USER,
    renameSavedSearchAction: USER,
    setSavedSearchActiveAction: USER,
    deleteSavedSearchAction: USER,
    setAlertEmailAction: USER,
  },
  "src/lib/search/actions.ts": {
    countSearchResults: publicAccess("search counts"),
    getSearchPriceHistogram: publicAccess("search price histogram"),
    getLoosenFixes: publicAccess("search suggestions"),
    getSearchMapPoints: publicAccess("public map points (approximate locations)"),
  },
  "src/lib/tickets/actions.ts": {
    lookupTicketListing: USER,
    createTicket: USER,
    submitContactForm: publicAccess("the contact form, behind the CAPTCHA"),
    replyToTicket: USER,
    rateTicket: USER,
    closeTicket: USER,
  },
  "src/lib/wizard/actions.ts": {
    createDraft: USER,
    deleteDraft: USER,
    updateDraft: USER,
    saveWizardStep: USER,
    loadWizardSnapshot: USER,
    loadListingCalendar: USER,
    reorderPhotos: USER,
    setCoverPhoto: USER,
    deletePhoto: USER,
    updatePhotoAlt: USER,
    updatePhotoRoom: USER,
    saveRoomType: USER,
    deleteRoomType: USER,
    setAvailability: USER,
    saveTranslations: USER,
    generateTranslations: USER,
    deleteTranslation: USER,
    acceptRulesAndPublish: USER,
    saveChanges: USER,
  },
};

/** Route handlers: route.ts (from the repository root) → HTTP method → access. */
export const ROUTE_HANDLERS: Record<string, Record<string, Access>> = {
  "src/app/[locale]/(site)/buy/route.ts": { GET: publicAccess("a redirect to the search page", "reads nothing, only redirects") },
  "src/app/[locale]/(site)/hotels/route.ts": { GET: publicAccess("a redirect to the search page", "reads nothing, only redirects") },
  "src/app/[locale]/(site)/rent/route.ts": { GET: publicAccess("a redirect to the search page", "reads nothing, only redirects") },
  "src/app/api/account/avatar/route.ts": { POST: USER },
  "src/app/api/account/export/route.ts": { GET: USER },
  "src/app/api/admin/documents/[requestId]/[index]/route.ts": { GET: staff("verifications") },
  "src/app/api/admin/reports/[reportId]/[index]/route.ts": { GET: staff("reports") },
  "src/app/api/auth/[...all]/route.ts": {
    GET: { kind: "auth", why: "Better Auth" },
    POST: { kind: "auth", why: "Better Auth" },
    PATCH: { kind: "auth", why: "Better Auth" },
    PUT: { kind: "auth", why: "Better Auth" },
    DELETE: { kind: "auth", why: "Better Auth" },
  },
  "src/app/api/cron/booking-reminders/route.ts": { GET: CRON },
  "src/app/api/cron/cleanup/route.ts": { GET: CRON },
  "src/app/api/cron/complete-bookings/route.ts": { GET: CRON },
  "src/app/.well-known/security.txt/route.ts": {
    GET: publicAccess("RFC 9116 security contact file (SECURITY_REPORT 18.1)", "a few lines of text built from settings: no database, nothing to protect"),
  },
  "src/app/api/cron/daily-summary/route.ts": { GET: CRON },
  "src/app/api/cron/exchange-rates/route.ts": { GET: CRON },
  "src/app/api/cron/expire-listings/route.ts": { GET: CRON },
  "src/app/api/cron/offsite-backup/route.ts": { GET: CRON },
  "src/app/api/cron/ical-sync/route.ts": { GET: CRON },
  "src/app/api/cron/saved-alerts/route.ts": { GET: CRON },
  "src/app/api/cron/security-alerts/route.ts": { GET: CRON },
  "src/app/api/cron/weekly-host-stats/route.ts": { GET: CRON },
  "src/app/api/csp-report/route.ts": { POST: publicAccess("browser CSP violation reports (rate-limited per IP and site-wide; SECURITY_REPORT 10.2.c)") },
  "src/app/api/dev/last-otp/route.ts": { GET: { kind: "dev", why: "the last login code, for the test-mode screens only" } },
  "src/app/api/geocode/route.ts": { GET: USER },
  "src/app/api/health/route.ts": {
    GET: publicAccess("the uptime monitor's health check (ok / database / maintenance; nothing else)", "answers from a 10-second cache: at most one database ping per 10 s per server"),
  },
  "src/app/api/ical/[token]/route.ts": { GET: token("the listing's private calendar export link (256-bit, replaceable)") },
  "src/app/api/ical/booking/[code]/route.ts": { GET: USER },
  "src/app/api/jewish-life/calendar/route.ts": { GET: publicAccess("Shabbat and holiday times") },
  "src/app/api/map/community/route.ts": { GET: publicAccess("community places on the map") },
  "src/app/api/media/[...key]/route.ts": {
    GET: publicAccess("public photos (private files answer 404)", "served from the public bucket, cached by the CDN"),
    HEAD: publicAccess("public photos (private files answer 404)", "served from the public bucket, cached by the CDN"),
  },
  "src/app/api/places/search/route.ts": { GET: publicAccess("the gazetteer search") },
  "src/app/api/tickets/attachment/route.ts": { GET: USER },
  "src/app/api/unsubscribe/route.ts": {
    GET: publicAccess("redirects to the unsubscribe page with the token; checks and changes nothing", "reads nothing, only redirects"),
    POST: token("the signed one-click unsubscribe link (RFC 8058)"),
  },
  "src/app/api/uploads/listing-photo/route.ts": { POST: USER },
  "src/app/api/uploads/private/route.ts": { POST: USER },
  "src/app/api/webhooks/resend/route.ts": { POST: { kind: "webhook", why: "Resend email events, Svix signature" } },
  "src/app/api/webhooks/telegram/route.ts": { POST: { kind: "webhook", why: "Telegram updates, the secret-token header" } },
  // Metadata routes (their default export answers GET; registry-incomplete-1).
  "src/app/[locale]/opengraph-image.tsx": { default: publicAccess("the site's share image", "a static brand image, reads nothing") },
  "src/app/[locale]/(site)/listing/[id]/opengraph-image.tsx": {
    default: publicAccess("a listing's share image: public listings only (no viewer)", "public listing data, cached like the listing page"),
  },
  "src/app/[locale]/(site)/lists/[token]/opengraph-image.tsx": { default: token("the shared list's secret link token (rate-limited per IP)") },
  "src/app/manifest.ts": { default: publicAccess("the web app manifest", "static, reads nothing") },
  "src/app/robots.ts": { default: publicAccess("robots.txt", "reads only the request host") },
  "src/app/sitemap.ts": { default: publicAccess("the sitemap: live non-demo listings, published articles, city pages", "public data only") },
};

/**
 * Layouts under /account, /post and /admin that call no sign-in check themselves: each only wraps
 * its children and reads nothing, and every page below it calls requireUser / requireStaff itself
 * (a layout's check does not stop its pages from rendering: they run in parallel).
 */
export const UNGUARDED_LAYOUTS: Record<string, string> = {
  "src/app/[locale]/(site)/post/layout.tsx": "passes the wizard messages to its client components; reads nothing",
  "src/app/[locale]/(site)/post/[id]/layout.tsx": "hides the site footer; reads nothing",
  "src/app/[locale]/(site)/account/listings/[id]/edit/layout.tsx": "hides the site footer; reads nothing",
};

/**
 * SECURITY_REPORT 5.d / 5.h: server action results that carry a phone, email or address field
 * (tests/unit/endpoints/action-result-keys.test.ts reads every action's result TYPE). Each one is
 * listed with why it is not another user's contact detail, or why this caller may see it. Any
 * other such field in a result fails the test.
 */
export const RESULT_CONTACT_KEYS: Record<string, { keys: string[]; why: string }> = {
  "src/lib/account/actions.ts#updateContactEmail": { keys: ["data.contactEmail"], why: "the caller's own contact address, as saved" },
  "src/lib/auth/contact-email-actions.ts#confirmContactEmailChange": { keys: ["data.contactEmail"], why: "the caller's own new contact address" },
  "src/lib/auth/fresh-proof-actions.ts#getProofOptions": { keys: ["data.email"], why: "the caller's own login address, masked (da***@…)" },
  "src/lib/auth/phone-check-actions.ts#sendPhoneCheckCode": { keys: ["data.phoneNumber"], why: "the number the caller typed, normalized" },
  "src/lib/auth/phone-check-actions.ts#confirmPhoneCheckCode": { keys: ["data.phoneNumber"], why: "the caller's own number just verified" },
  "src/lib/booking/alert-actions.ts#hostAlertStatusAction": { keys: ["data.address"], why: "the caller's own paused notification address (email_failing), for their own view" },
  "src/lib/contact/actions.ts#revealContact": {
    keys: ["data.sender.email"],
    why: "the signed-in guest's own address, to fill in the email form (the host's channels are the purpose of the action, after its caps)",
  },
  "src/lib/wizard/actions.ts#loadWizardSnapshot": { keys: ["data.values.address"], why: "the owner's own listing (ownership checked), as the form edits it" },
  "src/lib/admin/content/actions/roles.ts#findUsersForRole": {
    keys: ["data[].email", "data[].phone"],
    why: 'staff permission "roles" is ADMIN-only: phone numbers and search by phone are for ADMIN only (founder\'s answer c)',
  },
};

/**
 * Session helpers in src/lib that may count a 2-step-pending session as signed in, with why that
 * reveals nothing (every other helper that reads the session must check twoFactorVerified).
 */
export const SESSION_HELPERS_WITHOUT_2FA: Record<string, string> = {
  "src/lib/lists/redirect.ts#redirectSignedOutFromSaved": "only chooses between the login page and the device lists; returns no data",
};

/**
 * Staff actions that change nothing (searches, previews, a dry run): every OTHER staff action must
 * write the audit log (SECURITY_REPORT 12.6.d; tests/unit/endpoints/staff-audit.test.ts).
 */
export const READ_ONLY_STAFF_ACTIONS: Record<string, string> = {
  "src/lib/admin/content/actions/banned-words.ts#testBannedWords": "tries phrases against the filter, saves nothing",
  "src/lib/admin/content/actions/home.ts#searchListingsToFeature": "a search for the feature picker",
  "src/lib/admin/content/actions/roles.ts#findUsersForRole": "a search for the role picker",
};

/**
 * Destructive staff actions (founder's decision Q13): their audit row is written with
 * auditOrThrow, in the same transaction as the change or before it, so the action stops when the
 * row cannot be written (src/lib/audit.ts).
 */
export const DESTRUCTIVE_STAFF_ACTIONS: readonly string[] = [
  "src/lib/admin/actions/users.ts#setIdVerified",
  "src/lib/admin/actions/users.ts#warnUserAction",
  "src/lib/admin/actions/users.ts#suspendUserAction",
  "src/lib/admin/actions/users.ts#banUserAction",
  "src/lib/admin/actions/users.ts#changeRole",
  "src/lib/admin/actions/reports.ts#warnReportedUser",
  "src/lib/admin/actions/reports.ts#hideHostListings",
  "src/lib/admin/actions/reports.ts#removeReportedHost",
  "src/lib/admin/actions/reports.ts#revealReporter",
  "src/lib/admin/actions/reports.ts#hideReportedListing",
  "src/lib/admin/actions/moderation.ts#rejectListingAction",
  "src/lib/admin/actions/verifications.ts#approveVerification",
  "src/lib/admin/actions/verifications.ts#rejectVerification",
  "src/lib/admin/actions/flags.ts#markBookingFlagReviewedAction",
  "src/lib/admin/actions/flags.ts#markHostFlagReviewedAction",
  "src/lib/admin/actions/flags.ts#clearNoShowAction",
  "src/lib/admin/actions/flags.ts#markLongStayReviewedAction",
  "src/lib/admin/actions/flags.ts#markGuestFlagReviewedAction",
  "src/lib/admin/actions/reference-prices.ts#setReferencePriceActiveAction",
  "src/lib/admin/badges/actions.ts#clearVisitedAction",
  "src/lib/admin/content/actions/banned-words.ts#deleteBannedWord",
  "src/lib/admin/content/actions/cities.ts#deleteCity",
  "src/lib/admin/content/actions/cities.ts#deleteNeighborhood",
  "src/lib/admin/content/actions/editorial.ts#deleteArticle",
  "src/lib/admin/content/actions/editorial.ts#deleteFaqItem",
  "src/lib/admin/content/actions/editorial.ts#deleteScamAlert",
  "src/lib/admin/content/actions/places.ts#deletePlace",
  "src/lib/admin/content/actions/saved-replies.ts#deleteSavedReply",
  "src/lib/admin/content/actions/settings.ts#deleteAllDemoData",
  "src/lib/admin/content/actions/roles.ts#assignStaffRole",
  "src/lib/admin/content/actions/roles.ts#removeStaffRole",
  "src/lib/reviews/admin-actions.ts#hideReviewAction",
  // Its "started" row is written with auditOrThrow before the run (src/lib/admin/maintenance/cleanups.ts).
  "src/lib/admin/maintenance/actions.ts#runCleanupAction",
  // The full dump: its "started" row is written with auditOrThrow before the backup runs.
  "src/lib/admin/maintenance/actions.ts#createBackupAction",
  // Closing a report: the claim and its audit row in one transaction.
  "src/lib/admin/actions/reports.ts#resolveReport",
  "src/lib/admin/actions/reports.ts#dismissReport",
  // Removals: the audit row first (featured), or in the same transaction (translation override).
  "src/lib/admin/content/actions/home.ts#removeFeaturedListing",
  "src/lib/admin/content/actions/home.ts#removeEndedFeatured",
  "src/lib/admin/content/actions/translations.ts#resetTranslationOverride",
  // Incident tools: the switch and the audit row in one transaction; the sessions deleted with their audit row.
  "src/lib/admin/maintenance/incident-actions.ts#setMaintenanceModeAction",
  "src/lib/admin/maintenance/incident-actions.ts#endAllSessionsAction",
];

/**
 * Staff actions that change something but are NOT destructive (they add, edit, restore or send,
 * and can be undone by another staff action): they write the audit log with audit(), which never
 * stops the action. Every other staff action that changes something must reach auditOrThrow
 * (founder's decision Q13; tests/unit/endpoints/staff-audit.test.ts): a NEW staff action fails that
 * test until it uses auditOrThrow or is listed here with a reason.
 */
export const NON_DESTRUCTIVE_STAFF_ACTIONS: Record<string, string> = {
  "src/lib/admin/actions/moderation.ts#approveListingAction": "publishes a listing (undone by hide/reject); the lifecycle audits it",
  "src/lib/admin/actions/moderation.ts#restoreListingAction": "puts a hidden listing back online (undone by hide)",
  "src/lib/admin/actions/outbox.ts#resendOutboxEmailAction": "sends an existing email again; deletes nothing",
  "src/lib/admin/actions/reference-prices.ts#saveReferencePriceAction": "adds or edits a reference price (switching it off is the destructive one)",
  "src/lib/admin/actions/reports.ts#saveReportNote": "an internal note on a report",
  "src/lib/admin/actions/reports.ts#restoreReportedListing": "puts a hidden listing back online (undone by hide)",
  "src/lib/admin/actions/tickets.ts#staffReplyAction": "adds a reply to a ticket",
  "src/lib/admin/actions/tickets.ts#setTicketStatusAction": "changes a ticket's status (reversible)",
  "src/lib/admin/actions/tickets.ts#assignTicketAction": "assigns a ticket to a staff member (reversible)",
  "src/lib/admin/actions/users.ts#reactivateUserAction": "lifts a suspension or ban (the opposite of a destructive action)",
  "src/lib/admin/actions/users.ts#addAdminNote": "an internal note on an account",
  "src/lib/admin/badges/actions.ts#setVisitedAction": "gives the 'we visited' badge (clearing it is the destructive one)",
  "src/lib/admin/content/actions/banned-words.ts#saveBannedWord": "adds or edits a filter phrase (deleting is the destructive one)",
  "src/lib/admin/content/actions/banned-words.ts#addBannedWordsBulk": "adds filter phrases",
  "src/lib/admin/content/actions/banned-words.ts#setScamBannerEnabled": "switches the scam-alert banner on or off (reversible)",
  "src/lib/admin/content/actions/cities.ts#saveCity": "adds or edits a city (deleting is the destructive one)",
  "src/lib/admin/content/actions/cities.ts#saveNeighborhood": "adds or edits a neighborhood (deleting is the destructive one)",
  "src/lib/admin/content/actions/cities.ts#uploadCityPhoto": "stores a new photo file; the editor saves it with the city",
  "src/lib/admin/content/actions/editorial.ts#saveArticle": "adds or edits an article (deleting is the destructive one)",
  "src/lib/admin/content/actions/editorial.ts#saveFaqItem": "adds or edits a question (deleting is the destructive one)",
  "src/lib/admin/content/actions/editorial.ts#reorderFaqItems": "changes the order of the questions",
  "src/lib/admin/content/actions/editorial.ts#saveScamAlert": "adds or edits a scam alert (deleting is the destructive one)",
  "src/lib/admin/content/actions/home.ts#saveHomeSections": "turns home page sections on or off (reversible)",
  "src/lib/admin/content/actions/home.ts#addFeaturedListing": "features a listing (removing is the destructive one)",
  "src/lib/admin/content/actions/places.ts#savePlace": "adds or edits a community place (deleting is the destructive one)",
  "src/lib/admin/content/actions/saved-replies.ts#saveSavedReply": "adds or edits a saved reply (deleting is the destructive one)",
  "src/lib/admin/content/actions/settings.ts#saveSettings": "edits site settings (reversible; every change is logged)",
  "src/lib/admin/content/actions/settings.ts#saveEmergencyContacts": "edits the emergency numbers (reversible)",
  "src/lib/admin/content/actions/translations.ts#saveTranslationOverride": "adds or edits a text override (resetting it is the destructive one)",
  "src/lib/admin/maintenance/actions.ts#dryRunCleanupAction": "changes nothing; who looked is audited with audit()",
  "src/lib/reviews/admin-actions.ts#showReviewAction": "shows a hidden review again (hiding is the destructive one)",
};

/**
 * Staff actions that delete or remove something, or change who may do what (SECURITY_REPORT 3.6.c,
 * 12.6.c; checklist 3.6/12.6): they pass `freshProof` to runStaffAction / runContentAction and
 * answer "fresh_proof_required" without a fresh AUTHENTICATOR code (an emailed code never counts:
 * founder's decision 5; src/lib/admin/server/staff-proof.ts). "consume": one code, one action;
 * "window": one code covers 5 minutes of queue work. endpoint-registry.test.ts checks the code
 * carries it and calls each one without a proof.
 */
export const FRESH_PROOF_STAFF_ACTIONS: Record<string, "consume" | "window"> = {
  "src/lib/auth/sms-control-actions.ts#resumeSmsCountryAction": "consume",
  "src/lib/auth/sms-control-actions.ts#resetSmsBudgetAction": "consume",
  "src/lib/admin/actions/users.ts#suspendUserAction": "consume",
  "src/lib/admin/actions/users.ts#banUserAction": "consume",
  "src/lib/admin/actions/users.ts#changeRole": "consume",
  "src/lib/admin/actions/reports.ts#removeReportedHost": "consume",
  "src/lib/admin/actions/reports.ts#revealReporter": "consume",
  "src/lib/admin/actions/reports.ts#hideHostListings": "window",
  "src/lib/admin/actions/reports.ts#hideReportedListing": "window",
  "src/lib/admin/actions/moderation.ts#rejectListingAction": "window",
  "src/lib/admin/badges/actions.ts#clearVisitedAction": "window",
  "src/lib/reviews/admin-actions.ts#hideReviewAction": "window",
  "src/lib/admin/content/actions/roles.ts#assignStaffRole": "consume",
  "src/lib/admin/content/actions/roles.ts#removeStaffRole": "consume",
  "src/lib/admin/content/actions/settings.ts#deleteAllDemoData": "consume",
  "src/lib/admin/content/actions/banned-words.ts#deleteBannedWord": "window",
  "src/lib/admin/content/actions/cities.ts#deleteCity": "window",
  "src/lib/admin/content/actions/cities.ts#deleteNeighborhood": "window",
  "src/lib/admin/content/actions/editorial.ts#deleteArticle": "window",
  "src/lib/admin/content/actions/editorial.ts#deleteFaqItem": "window",
  "src/lib/admin/content/actions/editorial.ts#deleteScamAlert": "window",
  "src/lib/admin/content/actions/places.ts#deletePlace": "window",
  "src/lib/admin/content/actions/saved-replies.ts#deleteSavedReply": "window",
  "src/lib/admin/content/actions/home.ts#removeFeaturedListing": "window",
  "src/lib/admin/content/actions/home.ts#removeEndedFeatured": "window",
  "src/lib/admin/maintenance/actions.ts#createBackupAction": "window",
  "src/lib/admin/maintenance/actions.ts#runCleanupAction": "consume",
  "src/lib/admin/maintenance/incident-actions.ts#setMaintenanceModeAction": "consume",
  "src/lib/admin/maintenance/incident-actions.ts#endAllSessionsAction": "consume",
};

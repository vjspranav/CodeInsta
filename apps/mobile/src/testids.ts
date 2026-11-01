/**
 * Test IDs for every interactive element. Maestro flows (E7) and the UI tests select by these:
 * `tapOn: id: <value>`. Key and value are identical (TID["reel-like"] === "reel-like").
 *
 * Dynamic ids: `reel-page` and `inbox-thread` are prefixes. Use reelPageId(i) and
 * inboxThreadId(creatorId) in hot paths. TID["reel-page-3"] and TID[`inbox-thread-${id}`] also work.
 */
const ids = [
  // auth
  "login-google",
  "login-email",
  "login-password",
  "login-submit",
  "login-toggle",
  "login-error",
  "join-code",
  "join-submit",
  "join-error",
  "onboarding-save",
  // tabs
  "tab-feed",
  "tab-explore",
  "tab-inbox",
  "tab-profiles",
  "inbox-badge",
  // reel feed
  "reel-page",
  "reel-like",
  "reel-dislike",
  "reel-ask",
  "reel-sound",
  "reel-pause",
  "reel-undo",
  "reel-glossary",
  "reel-share",
  "reel-next-part",
  "reel-retry",
  "reel-empty",
  "streak-chip",
  // ask sheet and glossary
  "ask-input",
  "ask-send",
  "ask-limit",
  "ask-close",
  "glossary-close",
  // explore and profiles
  "explore-search",
  "explore-tile",
  "profile-row",
  "profile-reel",
  // inbox and DMs
  "inbox-thread",
  "dm-input",
  "dm-send",
  // requests, interests, owner
  "request-input",
  "request-area",
  "request-send",
  "interests-save",
  "review-approve",
  "review-approve-existing",
  "review-reject",
  "pending-badge",
  "owner-requests",
  "owner-invites",
  "invite-create",
  "invite-copy",
  // settings and info
  "settings-signout",
  "settings-notifications",
  "settings-requests",
  "settings-interests",
  "settings-about",
  "settings-privacy",
] as const;

export type TestIdName = (typeof ids)[number];

type Dynamic = { [K in `reel-page-${string}` | `inbox-thread-${string}`]: string };

const base = Object.fromEntries(ids.map((id) => [id, id])) as { readonly [K in TestIdName]: K };

/** Static ids come from `base`; `reel-page-<n>` and `inbox-thread-<id>` resolve to themselves. */
export const TID = new Proxy(base, {
  get(target, key) {
    if (typeof key === "string" && !(key in target) && /^(reel-page|inbox-thread)-/.test(key)) return key;
    return Reflect.get(target, key);
  },
}) as typeof base & Dynamic;

export const reelPageId = (index: number): string => `${TID["reel-page"]}-${index}`;
export const inboxThreadId = (creatorId: string): string => `${TID["inbox-thread"]}-${creatorId}`;

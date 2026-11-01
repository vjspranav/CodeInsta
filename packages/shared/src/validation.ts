export function validInvite(
  invite: { max_uses: number; uses: number; expires_at: string | null } | null,
  now = Date.now(),
) {
  return !!invite && invite.uses < invite.max_uses &&
    (invite.expires_at === null || Date.parse(invite.expires_at) > now);
}

/** Format Lab experiments stay out of regular feed and catalog lists. */
export const isLabReel = (reel: { topic: string }) => /^(lab|lab-v3)\//.test(reel.topic);

export const DAILY_ASKS = 3;

export const isValidSlug = (s: string) => /^[a-z0-9-]{2,40}$/.test(s);

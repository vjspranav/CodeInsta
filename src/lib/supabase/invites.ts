export function validInvite(invite: { max_uses: number; uses: number; expires_at: string | null } | null, now = Date.now()) {
  return !!invite && invite.uses < invite.max_uses &&
    (invite.expires_at === null || Date.parse(invite.expires_at) > now);
}

export function safeReturnPath(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") && !/[\u0000-\u0020\u007f]/.test(value) && !value.includes("\\") && !value.startsWith("/auth/") ? value : "/";
}

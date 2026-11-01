import { isOwnerUser } from "../../src/lib/supabase/allowlist";

type AuthUser = { id: string; email?: string; app_metadata?: { providers?: string[] } };
type Page = { users: AuthUser[] };

/** Members rows for owner-sync: the SAME predicate as the app's owner check (allowlisted email AND a google provider). */
export function ownerRows(users: AuthUser[]): { user_id: string; email: string; role: "owner" }[] {
  return users.filter((u) => isOwnerUser(u)).map((u) => ({ user_id: u.id, email: u.email as string, role: "owner" as const }));
}

/** Walk every page of auth users (the API caps perPage, so a single call silently drops the rest). */
export async function listAllUsers(
  fetchPage: (page: number, perPage: number) => Promise<Page>,
  perPage = 1000,
  maxPages = 1000,
): Promise<AuthUser[]> {
  const all: AuthUser[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const { users } = await fetchPage(page, perPage);
    all.push(...users);
    if (users.length < perPage) return all;
  }
  throw new Error(`listUsers did not terminate after ${maxPages} pages`);
}

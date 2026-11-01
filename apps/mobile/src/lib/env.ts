/**
 * Public runtime config. Only EXPO_PUBLIC_* values (inlined by Metro, so each must be read as a
 * literal `process.env.EXPO_PUBLIC_X`). The Supabase anon key is public by design; the service
 * key must never appear in apps/mobile. Values are read lazily so a missing one fails with a
 * clear message where it is used, not at import time in unrelated tests.
 */
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing ${name}. Copy apps/mobile/.env.example to .env.local and fill it in.`);
  }
  return value;
}

export const env = {
  get supabaseUrl(): string {
    return required("EXPO_PUBLIC_SUPABASE_URL", process.env.EXPO_PUBLIC_SUPABASE_URL);
  },
  get supabaseAnonKey(): string {
    return required("EXPO_PUBLIC_SUPABASE_ANON_KEY", process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
  },
  /** Android Credential Manager server client id (the Google web client). */
  get googleWebClientId(): string {
    return required("EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID", process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID);
  },
  get apiBase(): string {
    return (process.env.EXPO_PUBLIC_API_BASE || "https://codeinsta.vjspranav.dev").replace(/\/+$/, "");
  },
};

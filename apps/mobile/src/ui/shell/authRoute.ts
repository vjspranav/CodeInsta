import type { AuthStatus } from "@/auth/useAuth";

export type AuthRoute = "login" | "join" | "onboarding" | "(tabs)";

/** The one route group each auth status may see. `loading` has none: the splash stays up. */
export function routeForStatus(status: AuthStatus): AuthRoute | null {
  switch (status) {
    case "signedOut":
      return "login";
    case "needsInvite":
      return "join";
    case "needsOnboarding":
      return "onboarding";
    case "ready":
      return "(tabs)";
    default:
      return null;
  }
}

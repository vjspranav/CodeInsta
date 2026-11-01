/**
 * Notification tap routing. The push payload is relayed through Expo's servers and arrives as
 * untrusted data, so only a fixed set of in-app routes is accepted. Anything else returns null
 * and the tap is ignored (a hostile payload cannot navigate to /admin or an external URL).
 */
const INBOX_ROUTE = /^\/inbox\/[a-z0-9-]+$/;

export function routeFromNotification(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const route = (data as { route?: unknown }).route;
  if (typeof route !== "string") return null;
  if (route === "/" || route === "/requests" || INBOX_ROUTE.test(route)) return route;
  return null;
}

import { routeFromNotification } from "./routing";

describe("routeFromNotification", () => {
  it.each(["/", "/requests", "/inbox/claude", "/inbox/a1-b2"])("accepts %s", (route) => {
    expect(routeFromNotification({ route })).toBe(route);
  });

  it.each([
    "/admin/requests",
    "https://evil.test",
    "//evil.test",
    "/inbox/",
    "/inbox/Claude",
    "/inbox/a/b",
    "/inbox/../admin",
    "/requests/",
    "",
  ])("rejects %s", (route) => {
    expect(routeFromNotification({ route })).toBeNull();
  });

  it("rejects non-object and non-string payloads", () => {
    for (const data of [null, undefined, "/", 5, [], {}, { route: 1 }, { route: null }]) {
      expect(routeFromNotification(data)).toBeNull();
    }
  });
});

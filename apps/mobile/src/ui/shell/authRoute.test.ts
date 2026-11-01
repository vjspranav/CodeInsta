import { routeForStatus } from "./authRoute";

describe("routeForStatus", () => {
  it("maps each auth status to its single route group", () => {
    expect(routeForStatus("signedOut")).toBe("login");
    expect(routeForStatus("needsInvite")).toBe("join");
    expect(routeForStatus("needsOnboarding")).toBe("onboarding");
    expect(routeForStatus("ready")).toBe("(tabs)");
  });
  it("has none while loading (the splash stays up)", () => {
    expect(routeForStatus("loading")).toBeNull();
  });
});

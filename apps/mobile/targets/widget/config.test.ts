import fs from "fs";
import path from "path";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const targetConfig = require("./expo-target.config.js");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const appLoaded = require("../../app.config");

const APP_GROUP = "group.dev.vjspranav.codeinsta";
const appConfig = (appLoaded.default ?? appLoaded)({ config: {} }) as Record<string, any>;
const target = targetConfig({ ios: { bundleIdentifier: appConfig.ios.bundleIdentifier } });

describe("iOS widget target", () => {
  it("is a widget with the widget bundle id", () => {
    expect(target.type).toBe("widget");
    expect(target.bundleIdentifier).toBe("dev.vjspranav.codeinsta.widget");
  });

  it("uses the shared App Group in the target and in the app", () => {
    expect(target.entitlements["com.apple.security.application-groups"]).toEqual([APP_GROUP]);
    expect(appConfig.ios.entitlements["com.apple.security.application-groups"]).toEqual([APP_GROUP]);
  });

  it("registers the apple-targets plugin", () => {
    expect(appConfig.plugins).toContain("@bacons/apple-targets");
  });

  it("reads the snapshot key from the same App Group in Swift", () => {
    const swift = fs.readFileSync(path.join(__dirname, "SnapshotReader.swift"), "utf8");
    expect(swift).toContain(`"${APP_GROUP}"`);
    expect(swift).toContain('key = "snapshot"');
  });
});

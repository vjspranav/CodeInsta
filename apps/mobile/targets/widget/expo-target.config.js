/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: "widget",
  name: "widget",
  displayName: "CodeInsta",
  bundleIdentifier: `${config.ios?.bundleIdentifier ?? "dev.vjspranav.codeinsta"}.widget`,
  // iOS 17 is needed for containerBackground(for: .widget); the lock screen accessory families need 16.
  deploymentTarget: "17.0",
  frameworks: ["WidgetKit", "SwiftUI"],
  // No App Group on a free Apple ID build (CODEINSTA_IOS_FREE=1): the widget shows its empty state.
  entitlements:
    process.env.CODEINSTA_IOS_FREE === "1"
      ? {}
      : { "com.apple.security.application-groups": ["group.dev.vjspranav.codeinsta"] },
});

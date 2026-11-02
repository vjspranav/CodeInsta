// A free Apple ID (personal team) cannot provision Push Notifications or Sign In with Apple.
// With CODEINSTA_IOS_FREE=1 this drops those entitlements so Xcode can sign the app; push is
// then unavailable on iOS, which the app already tolerates (registration is skipped).
const { withEntitlementsPlist } = require("expo/config-plugins");

const FREE_UNSUPPORTED = ["aps-environment", "com.apple.developer.applesignin"];

function stripFreeUnsupported(entitlements) {
  const next = { ...entitlements };
  for (const key of FREE_UNSUPPORTED) delete next[key];
  return next;
}

const withFreeIosSigning = (config) => {
  if (process.env.CODEINSTA_IOS_FREE !== "1") return config;
  return withEntitlementsPlist(config, (c) => {
    c.modResults = stripFreeUnsupported(c.modResults);
    return c;
  });
};

module.exports = withFreeIosSigning;
module.exports.stripFreeUnsupported = stripFreeUnsupported;

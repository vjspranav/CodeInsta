// eslint-disable-next-line @typescript-eslint/no-require-imports
const { stripFreeUnsupported } = require("./index");

describe("with-free-ios-signing", () => {
  it("drops push and Sign In with Apple, keeps everything else", () => {
    const out = stripFreeUnsupported({
      "aps-environment": "development",
      "com.apple.developer.applesignin": ["Default"],
      "keychain-access-groups": ["x"],
    });
    expect(out).toEqual({ "keychain-access-groups": ["x"] });
  });
});

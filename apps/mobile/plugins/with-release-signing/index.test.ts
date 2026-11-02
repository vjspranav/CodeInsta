import fs from "node:fs";
import path from "node:path";
import withReleaseSigning, { KEYSTORE_RELATIVE_PATH, addReleaseSigning } from "./index";

const fixture = fs.readFileSync(path.join(__dirname, "fixtures", "app.build.gradle"), "utf8");
const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

/** Text of one braces block starting at `header` (first occurrence at or after `from`). */
function block(source: string, header: string, from = 0): string {
  const start = source.indexOf(header, from);
  if (start < 0) throw new Error(`no ${header}`);
  let depth = 0;
  for (let i = source.indexOf("{", start); i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error("unbalanced");
}

describe("with-release-signing plugin", () => {
  it("is a config plugin function", () => {
    expect(typeof withReleaseSigning).toBe("function");
  });

  it("adds a release signing config that reads the keystore and passwords from the environment", () => {
    const out = addReleaseSigning(fixture);
    const signing = block(out, "signingConfigs {");
    expect(signing).toContain("debug {");
    const release = block(signing, "release {");
    expect(release).toContain("System.getenv('ANDROID_KEYSTORE_PASSWORD')");
    expect(release).toContain("System.getenv('ANDROID_KEY_ALIAS')");
    expect(release).toContain(KEYSTORE_RELATIVE_PATH);
    expect(release).toContain("exists()");
  });

  it("never writes a literal password or alias into the Gradle text", () => {
    const out = addReleaseSigning(fixture);
    const release = block(block(out, "signingConfigs {"), "release {");
    for (const line of release.split("\n").filter((l) => /storePassword|keyPassword|keyAlias/.test(l))) {
      expect(line).not.toMatch(/['"][^'"]{6,}['"]\s*$/);
    }
  });

  it("makes the release build type use the release key when configured, else the debug key", () => {
    const out = addReleaseSigning(fixture);
    const buildTypes = block(out, "buildTypes {");
    expect(block(buildTypes, "debug {")).toContain("signingConfig signingConfigs.debug");
    const release = block(buildTypes, "release {");
    expect(release).toContain("signingConfigs.release.storeFile != null ? signingConfigs.release : signingConfigs.debug");
    expect(release).not.toMatch(/signingConfig signingConfigs\.debug/);
  });

  it("is idempotent: running twice equals running once", () => {
    const once = addReleaseSigning(fixture);
    expect(addReleaseSigning(once)).toBe(once);
    expect(count(once, "release {")).toBe(count(fixture, "release {") + 1);
  });

  it("changes nothing else in the file", () => {
    const out = addReleaseSigning(fixture);
    expect(out).toContain("proguardFiles getDefaultProguardFile");
    expect(out).toContain("storeFile file('debug.keystore')");
  });

  it("throws a clear error when the Gradle layout is not recognised", () => {
    expect(() => addReleaseSigning("android { }")).toThrow(/with-release-signing/);
  });
});

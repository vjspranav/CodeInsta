import fs from "fs";
import path from "path";

const root = path.resolve(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const eas = JSON.parse(fs.readFileSync(path.join(root, "eas.json"), "utf8"));

describe("package.json", () => {
  it("pins every dependency to an exact version", () => {
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    const bad = Object.entries(all).filter(
      ([, v]) => !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(String(v)),
    );
    expect(bad).toEqual([]);
  });
});

describe("app.config.ts", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const loaded = require("../app.config");
  const resolve = loaded.default ?? loaded;
  const config = (typeof resolve === "function" ? resolve({ config: {} }) : resolve) as Record<
    string,
    any
  >;

  it("has identity, scheme and package ids", () => {
    expect(config.name).toBe("CodeInsta");
    expect(config.slug).toBe("codeinsta");
    expect(config.scheme).toBe("codeinsta");
    expect(config.ios.bundleIdentifier).toBe("dev.vjspranav.codeinsta");
    expect(config.android.package).toBe("dev.vjspranav.codeinsta");
  });

  it("reads ios.appleTeamId from APPLE_TEAM_ID", () => {
    const prev = process.env.APPLE_TEAM_ID;
    try {
      delete process.env.APPLE_TEAM_ID;
      const without = resolve({ config: {} });
      expect(without.ios.appleTeamId).toBeUndefined();
      process.env.APPLE_TEAM_ID = "ABCDE12345";
      const withTeam = resolve({ config: {} });
      expect(withTeam.ios.appleTeamId).toBe("ABCDE12345");
    } finally {
      if (prev === undefined) delete process.env.APPLE_TEAM_ID;
      else process.env.APPLE_TEAM_ID = prev;
    }
  });

  it("enables the New Architecture", () => {
    expect(config.newArchEnabled).toBe(true);
  });

  it("exposes only EXPO_PUBLIC values through extra", () => {
    expect(config.extra).toBeDefined();
    expect(JSON.stringify(config.extra)).not.toMatch(/service[_-]?role/i);
  });
});

describe("eas.json", () => {
  it.each(["development", "preview", "production"])("has profile and channel %s", (name) => {
    expect(eas.build[name]).toBeDefined();
    expect(eas.build[name].channel).toBe(name);
  });
});

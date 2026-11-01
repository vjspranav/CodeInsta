import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AndroidConfig } from "expo/config-plugins";
import withAndroidWidget, {
  COVER_RECEIVER,
  GLANCE_VERSION,
  KOTLIN_FALLBACK_VERSION,
  PROVIDER_META,
  SAMSUNG_PROVIDER_META,
  WIDGET_RECEIVER,
  addComposeClasspath,
  addGlanceToAppGradle,
  addWidgetReceivers,
  copyWidgetFiles,
} from "./index";

const ROOT = path.resolve(__dirname, "../..");
const fixture = (name: string) => fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");
const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

describe("with-android-widget plugin", () => {
  it("is a config plugin function", () => {
    expect(typeof withAndroidWidget).toBe("function");
  });

  describe("manifest", () => {
    async function runOn(manifestPath: string) {
      const manifest = await AndroidConfig.Manifest.readAndroidManifestAsync(manifestPath);
      addWidgetReceivers(manifest as any);
      return manifest;
    }
    const receivers = (m: any) => m.manifest.application[0].receiver as any[];
    const byName = (m: any, name: string) => receivers(m).find((r) => r.$["android:name"] === name);
    const metaOf = (r: any) => Object.fromEntries(r["meta-data"].map((d: any) => [d.$["android:name"], d.$["android:resource"]]));

    it("adds both receivers, the provider meta-data and the Samsung cover meta-data", async () => {
      const m = await runOn(path.join(__dirname, "fixtures", "AndroidManifest.xml"));
      const home = byName(m, WIDGET_RECEIVER);
      const cover = byName(m, COVER_RECEIVER);
      expect(home.$["android:exported"]).toBe("true");
      expect(home["intent-filter"][0].action[0].$["android:name"]).toBe("android.appwidget.action.APPWIDGET_UPDATE");
      expect(metaOf(home)).toEqual({ [PROVIDER_META]: "@xml/codeinsta_widget_info" });
      expect(cover.$["android:exported"]).toBe("true");
      expect(cover["intent-filter"][0].action[0].$["android:name"]).toBe("android.appwidget.action.APPWIDGET_UPDATE");
      expect(metaOf(cover)).toEqual({
        [PROVIDER_META]: "@xml/codeinsta_widget_cover_info",
        [SAMSUNG_PROVIDER_META]: "@xml/codeinsta_widget_samsung_cover",
      });
      expect(SAMSUNG_PROVIDER_META).toBe("com.samsung.android.appwidget.provider");
    });

    it("keeps the existing activity and does not duplicate receivers when run twice", async () => {
      const m = await runOn(path.join(__dirname, "fixtures", "AndroidManifest.xml"));
      addWidgetReceivers(m as any);
      expect(receivers(m).filter((r) => r.$["android:name"] === WIDGET_RECEIVER)).toHaveLength(1);
      expect(receivers(m).filter((r) => r.$["android:name"] === COVER_RECEIVER)).toHaveLength(1);
      expect((m as any).manifest.application[0].activity[0].$["android:name"]).toBe(".MainActivity");
    });

    it("serializes to XML containing the Samsung entry exactly once", async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "widget-manifest-"));
      const file = path.join(dir, "AndroidManifest.xml");
      fs.copyFileSync(path.join(__dirname, "fixtures", "AndroidManifest.xml"), file);
      const m = await runOn(file);
      addWidgetReceivers(m as any);
      await AndroidConfig.Manifest.writeAndroidManifestAsync(file, m);
      const xml = fs.readFileSync(file, "utf8");
      expect(count(xml, SAMSUNG_PROVIDER_META)).toBe(1);
      expect(count(xml, `android:name="${PROVIDER_META}"`)).toBe(2);
      fs.rmSync(dir, { recursive: true, force: true });
    });
  });

  describe("gradle", () => {
    it("adds the Glance dependency and applies the Compose compiler plugin once", () => {
      const once = addGlanceToAppGradle(fixture("app.build.gradle"));
      const twice = addGlanceToAppGradle(once);
      expect(twice).toBe(once);
      expect(count(once, `androidx.glance:glance-appwidget:${GLANCE_VERSION}`)).toBe(1);
      expect(count(once, "org.jetbrains.kotlin.plugin.compose")).toBe(1);
      expect(once.indexOf("org.jetbrains.kotlin.android")).toBeLessThan(once.indexOf("org.jetbrains.kotlin.plugin.compose"));
      expect(once.indexOf("dependencies {")).toBeLessThan(once.indexOf("androidx.glance"));
    });

    it("pins Glance to an exact version", () => {
      expect(GLANCE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it("adds the Compose compiler classpath to the root build.gradle once", () => {
      const once = addComposeClasspath(fixture("root.build.gradle"));
      expect(addComposeClasspath(once)).toBe(once);
      expect(count(once, "org.jetbrains.kotlin.plugin.compose.gradle.plugin")).toBe(1);
      expect(once).toContain(`'${KOTLIN_FALLBACK_VERSION}'`);
    });

    it("the Kotlin fallback equals the version React Native in this SDK builds with", () => {
      const toml = fs.readFileSync(path.join(ROOT, "node_modules/react-native/gradle/libs.versions.toml"), "utf8");
      expect(/^kotlin = "([^"]+)"/m.exec(toml)?.[1]).toBe(KOTLIN_FALLBACK_VERSION);
    });

    it("fails loudly when an anchor line is missing", () => {
      expect(() => addGlanceToAppGradle("// empty")).toThrow(/could not find/);
      expect(() => addComposeClasspath("// empty")).toThrow(/could not find/);
    });
  });

  describe("copy", () => {
    it("copies the Kotlin sources and res/ into the generated project, repeatably", () => {
      const platform = fs.mkdtempSync(path.join(os.tmpdir(), "widget-android-"));
      copyWidgetFiles(ROOT, platform);
      copyWidgetFiles(ROOT, platform);
      const kt = path.join(platform, "app/src/main/java/dev/vjspranav/codeinsta/widget");
      for (const f of ["CodeInstaWidget.kt", "CodeInstaWidgetReceiver.kt", "SnapshotReader.kt"]) {
        expect(fs.existsSync(path.join(kt, f))).toBe(true);
      }
      const xml = path.join(platform, "app/src/main/res/xml");
      for (const f of ["codeinsta_widget_info.xml", "codeinsta_widget_cover_info.xml", "codeinsta_widget_samsung_cover.xml"]) {
        expect(fs.existsSync(path.join(xml, f))).toBe(true);
      }
      fs.rmSync(platform, { recursive: true, force: true });
    });
  });

  describe("native sources", () => {
    const widgetDir = path.join(ROOT, "native/android/widget");
    const read = (f: string) => fs.readFileSync(path.join(widgetDir, f), "utf8");

    it("Kotlin files declare the package the manifest receivers resolve to", () => {
      for (const f of ["CodeInstaWidget.kt", "CodeInstaWidgetReceiver.kt", "SnapshotReader.kt"]) {
        expect(read(f)).toMatch(/^package dev\.vjspranav\.codeinsta\.widget$/m);
      }
      expect(read("CodeInstaWidgetReceiver.kt")).toContain("class CodeInstaWidgetReceiver");
      expect(read("CodeInstaWidgetReceiver.kt")).toContain("class CodeInstaCoverWidgetReceiver");
    });

    it("the widget provider info follows the plan and the Samsung Flex Window requirements", () => {
      const home = read("res/xml/codeinsta_widget_info.xml");
      for (const a of [
        'android:minWidth="110dp"',
        'android:minHeight="40dp"',
        'android:targetCellWidth="2"',
        'android:targetCellHeight="1"',
        'android:resizeMode="horizontal|vertical"',
        'android:widgetCategory="home_screen|keyguard"',
        'android:updatePeriodMillis="0"',
      ]) {
        expect(home).toContain(a);
      }
      const cover = read("res/xml/codeinsta_widget_cover_info.xml");
      for (const a of ['android:minWidth="352dp"', 'android:minHeight="339dp"', 'android:resizeMode="horizontal|vertical"', 'android:widgetCategory="keyguard"']) {
        expect(cover).toContain(a);
      }
      expect(read("res/xml/codeinsta_widget_samsung_cover.xml")).toContain('<samsung-appwidget-provider display="sub_screen"');
    });

    it("SharedPreferences names match between the bridge module and the reader", () => {
      const bridge = fs.readFileSync(
        path.join(ROOT, "modules/widget-bridge/android/src/main/java/dev/vjspranav/codeinsta/widgetbridge/CodeInstaWidgetBridgeModule.kt"),
        "utf8",
      );
      const reader = read("SnapshotReader.kt");
      expect(bridge).toContain('PREFS_NAME = "codeinsta_widget"');
      expect(bridge).toContain('KEY_SNAPSHOT = "snapshot"');
      expect(reader).toContain('PREFS_NAME = "codeinsta_widget"');
      expect(reader).toContain('KEY_SNAPSHOT = "snapshot"');
      expect(bridge).toContain("dev.vjspranav.codeinsta.widget.CodeInstaWidgetReceiver");
      expect(bridge).toContain("dev.vjspranav.codeinsta.widget.CodeInstaCoverWidgetReceiver");
    });
  });
});

import fs from "node:fs";
import path from "node:path";
import {
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
  withProjectBuildGradle,
  type ConfigPlugin,
} from "expo/config-plugins";

/**
 * Android Glance widget plumbing:
 *  - Glance dependency and the Compose compiler Gradle plugin (Kotlin 2.x needs it for @Composable)
 *  - copies native/android/widget (Kotlin sources and res/) into the generated android project
 *  - registers the home/lock-screen receiver and the Galaxy Z Flip FlexWindow cover-screen receiver
 * Every step is idempotent, so `expo prebuild` with or without --clean gives the same result.
 */

/** Pinned. Checked against Expo SDK 58 (Kotlin 2.2.0, compileSdk 37, AGP 9.2.1); Glance 1.2.0 was built with Kotlin 2.0.21. */
export const GLANCE_VERSION = "1.2.0";
/**
 * Used only when `android.kotlinVersion` is not set in gradle.properties. Must equal React Native's
 * catalog Kotlin version (apps/mobile/node_modules/react-native/gradle/libs.versions.toml); the test pins it.
 */
export const KOTLIN_FALLBACK_VERSION = "2.2.0";

export const WIDGET_PACKAGE = "dev.vjspranav.codeinsta.widget";
export const WIDGET_RECEIVER = ".widget.CodeInstaWidgetReceiver";
export const COVER_RECEIVER = ".widget.CodeInstaCoverWidgetReceiver";
export const PROVIDER_META = "android.appwidget.provider";
/** Samsung Developers, "Flex Window": a second meta-data on the receiver pointing at a samsung-appwidget-provider xml. */
export const SAMSUNG_PROVIDER_META = "com.samsung.android.appwidget.provider";

const MARK = "codeinsta-widget";
const GLANCE_LINE = `implementation("androidx.glance:glance-appwidget:${GLANCE_VERSION}")`;
const COMPOSE_PLUGIN_ID = "org.jetbrains.kotlin.plugin.compose";

function insertAfterLine(source: string, anchor: RegExp, insertion: string, what: string): string {
  const m = anchor.exec(source);
  if (!m) throw new Error(`with-android-widget: could not find ${what} in the generated Gradle file`);
  const end = m.index + m[0].length;
  return source.slice(0, end) + "\n" + insertion + source.slice(end);
}

/** Root android/build.gradle: puts the Compose compiler plugin on the buildscript classpath. */
export function addComposeClasspath(gradle: string): string {
  if (gradle.includes(MARK)) return gradle;
  const line = `    classpath("org.jetbrains.kotlin.plugin.compose:org.jetbrains.kotlin.plugin.compose.gradle.plugin:\${findProperty('android.kotlinVersion') ?: '${KOTLIN_FALLBACK_VERSION}'}") // ${MARK}`;
  return insertAfterLine(gradle, /^[ \t]*classpath\(['"]com\.facebook\.react:react-native-gradle-plugin['"]\)[ \t]*$/m, line, "the react-native-gradle-plugin classpath line");
}

/** android/app/build.gradle: applies the Compose compiler plugin and adds the Glance dependency. */
export function addGlanceToAppGradle(gradle: string): string {
  let out = gradle;
  if (!out.includes(COMPOSE_PLUGIN_ID)) {
    out = insertAfterLine(out, /^apply plugin: ["']com\.facebook\.react["'][ \t]*$/m, `apply plugin: "${COMPOSE_PLUGIN_ID}" // ${MARK}`, 'the `apply plugin: "com.facebook.react"` line');
  }
  if (!out.includes("androidx.glance:glance-appwidget")) {
    out = insertAfterLine(out, /^dependencies \{[ \t]*$/m, `    ${GLANCE_LINE} // ${MARK}`, "the dependencies block");
  }
  return out;
}

type Entry = Record<string, any>;

function receiver(name: string, resource: string, extraMeta: { name: string; resource: string }[] = []): Entry {
  return {
    $: { "android:name": name, "android:exported": "true", "android:label": "@string/app_name" },
    "intent-filter": [{ action: [{ $: { "android:name": "android.appwidget.action.APPWIDGET_UPDATE" } }] }],
    "meta-data": [
      { $: { "android:name": PROVIDER_META, "android:resource": resource } },
      ...extraMeta.map((m) => ({ $: { "android:name": m.name, "android:resource": m.resource } })),
    ],
  };
}

/** Adds (or replaces, never duplicates) the two widget receivers on the manifest's <application>. */
export function addWidgetReceivers(manifest: { manifest: { application?: Entry[] } }): void {
  const app = manifest.manifest.application?.[0];
  if (!app) throw new Error("with-android-widget: AndroidManifest.xml has no <application>");
  const ours = new Set([WIDGET_RECEIVER, COVER_RECEIVER]);
  const kept = ((app.receiver as Entry[] | undefined) ?? []).filter((r) => !ours.has(r.$?.["android:name"]));
  app.receiver = [
    ...kept,
    receiver(WIDGET_RECEIVER, "@xml/codeinsta_widget_info"),
    receiver(COVER_RECEIVER, "@xml/codeinsta_widget_cover_info", [
      { name: SAMSUNG_PROVIDER_META, resource: "@xml/codeinsta_widget_samsung_cover" },
    ]),
  ];
}

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

/** Copies the Kotlin sources into the widget package and merges res/ into the app's res/. */
export function copyWidgetFiles(projectRoot: string, platformProjectRoot: string): void {
  const source = path.join(projectRoot, "native", "android", "widget");
  if (!fs.existsSync(source)) throw new Error(`with-android-widget: missing ${source}`);
  const main = path.join(platformProjectRoot, "app", "src", "main");
  const kotlinDest = path.join(main, "java", ...WIDGET_PACKAGE.split("."));
  fs.mkdirSync(kotlinDest, { recursive: true });
  for (const file of fs.readdirSync(source)) {
    if (file.endsWith(".kt")) fs.copyFileSync(path.join(source, file), path.join(kotlinDest, file));
  }
  const res = path.join(source, "res");
  if (fs.existsSync(res)) copyDir(res, path.join(main, "res"));
}

const withAndroidWidget: ConfigPlugin = (config) => {
  config = withProjectBuildGradle(config, (c) => {
    c.modResults.contents = addComposeClasspath(c.modResults.contents);
    return c;
  });
  config = withAppBuildGradle(config, (c) => {
    c.modResults.contents = addGlanceToAppGradle(c.modResults.contents);
    return c;
  });
  config = withAndroidManifest(config, (c) => {
    addWidgetReceivers(c.modResults as any);
    return c;
  });
  config = withDangerousMod(config, [
    "android",
    (c) => {
      copyWidgetFiles(c.modRequest.projectRoot, c.modRequest.platformProjectRoot);
      return c;
    },
  ]);
  return config;
};

export default withAndroidWidget;

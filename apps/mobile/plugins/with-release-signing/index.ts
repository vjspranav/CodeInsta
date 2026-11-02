import { withAppBuildGradle, type ConfigPlugin } from "expo/config-plugins";

/**
 * Release signing for the Android release build type (plan Task 7.4).
 *
 * At prebuild this edits android/app/build.gradle so that, at Gradle build time:
 *  - when ANDROID_KEYSTORE_PASSWORD and ANDROID_KEY_ALIAS are set and the keystore exists, the release build
 *    type is signed with apps/mobile/credentials/codeinsta-release.keystore (ANDROID_KEY_PASSWORD optional,
 *    defaults to the store password; ANDROID_KEYSTORE_PATH optional override);
 *  - otherwise it falls back to the debug key, exactly like the Expo template.
 * Secrets are read from the environment by Gradle: nothing sensitive is written into the generated file.
 * Idempotent, so prebuild with or without --clean gives the same result.
 */

/** Relative to apps/mobile (the parent of the generated android/ project). */
export const KEYSTORE_RELATIVE_PATH = "credentials/codeinsta-release.keystore";

const MARK = "codeinsta-release-signing";

const RELEASE_SIGNING = `        release { // ${MARK}
            def ksPassword = System.getenv('ANDROID_KEYSTORE_PASSWORD')
            def ksAlias = System.getenv('ANDROID_KEY_ALIAS')
            def ksFile = new File(System.getenv('ANDROID_KEYSTORE_PATH') ?: new File(rootDir.getAbsoluteFile().getParentFile(), '${KEYSTORE_RELATIVE_PATH}').getAbsolutePath())
            if (ksPassword && ksAlias && ksFile.exists()) {
                storeFile ksFile
                storePassword ksPassword
                keyAlias ksAlias
                keyPassword System.getenv('ANDROID_KEY_PASSWORD') ?: ksPassword
            }
        }`;

/** Pure text transform on android/app/build.gradle. */
export function addReleaseSigning(gradle: string): string {
  if (gradle.includes(MARK)) return gradle;

  const signingAnchor = /^([ \t]*)signingConfigs \{[ \t]*$/m.exec(gradle);
  if (!signingAnchor) throw new Error("with-release-signing: could not find the signingConfigs block in android/app/build.gradle");
  const afterSigning = signingAnchor.index + signingAnchor[0].length;
  const withConfig = gradle.slice(0, afterSigning) + "\n" + RELEASE_SIGNING + gradle.slice(afterSigning);

  // The first `signingConfig signingConfigs.debug` after `release {` inside buildTypes is the release build type's.
  const releaseUse = /(buildTypes \{[\s\S]*?^[ \t]*release \{[^\n]*\n(?:(?![ \t]*\}[ \t]*$)[^\n]*\n)*?[ \t]*)signingConfig signingConfigs\.debug([ \t]*)$/m;
  if (!releaseUse.test(withConfig)) {
    throw new Error("with-release-signing: could not find `signingConfig signingConfigs.debug` in the release build type");
  }
  return withConfig.replace(
    releaseUse,
    `$1signingConfig(signingConfigs.release.storeFile != null ? signingConfigs.release : signingConfigs.debug) // ${MARK}$2`,
  );
}

const withReleaseSigning: ConfigPlugin = (config) =>
  withAppBuildGradle(config, (c) => {
    c.modResults.contents = addReleaseSigning(c.modResults.contents);
    return c;
  });

export default withReleaseSigning;

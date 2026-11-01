import type { ConfigContext, ExpoConfig } from "expo/config";

const ID = "dev.vjspranav.codeinsta";

// `newArchEnabled` is no longer in the ExpoConfig type (the New Architecture is the only mode in
// current SDKs) but the plan and config test keep it explicit, hence the cast.
export default ({ config }: ConfigContext): ExpoConfig =>
  ({
  ...config,
  name: "CodeInsta",
  slug: "codeinsta",
  scheme: "codeinsta",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    supportsTablet: false,
    bundleIdentifier: ID,
    entitlements: { "com.apple.security.application-groups": ["group.dev.vjspranav.codeinsta"] },
  },
  android: {
    package: ID,
    adaptiveIcon: {
      backgroundColor: "#F7F4EC",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
    ...(process.env.GOOGLE_SERVICES_JSON
      ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON }
      : {}),
  },
  runtimeVersion: { policy: "appVersion" },
  updates: process.env.EAS_PROJECT_ID
    ? { url: `https://u.expo.dev/${process.env.EAS_PROJECT_ID}` }
    : undefined,
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-video",
    "expo-notifications",
    "expo-background-task",
    "react-native-credentials-manager",
    "./plugins/with-android-widget",
    "@bacons/apple-targets",
  ],
  experiments: { typedRoutes: true },
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    apiBase: process.env.EXPO_PUBLIC_API_BASE ?? "https://codeinsta.vjspranav.dev",
    eas: process.env.EAS_PROJECT_ID ? { projectId: process.env.EAS_PROJECT_ID } : undefined,
  },
}) as ExpoConfig;

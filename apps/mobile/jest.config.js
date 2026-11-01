module.exports = {
  preset: "jest-expo",
  // packages/shared lives outside this package: resolve its imports (babel helpers) from here, like metro.config.js.
  // Reanimated 4 / Worklets: run their JS implementations in jest (no native module).
  resolver: "react-native-reanimated/jest/resolver",
  modulePaths: ["<rootDir>/node_modules"],
  testPathIgnorePatterns: ["/node_modules/", "/android/", "/ios/", "/.maestro/"],
  moduleNameMapper: {
    "^@shared/(.*)$": "<rootDir>/../../packages/shared/src/$1",
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  transformIgnorePatterns: [
    "/node_modules/(?!(.pnpm/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|lucide-react-native|@shopify/flash-list))",
  ],
};

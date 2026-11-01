import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // jest-expo tests under apps/** run with their own runner.
    exclude: [...configDefaults.exclude, "apps/**"],
  },
});

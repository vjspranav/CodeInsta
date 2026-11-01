const mockRequire = jest.fn();
jest.mock("expo", () => ({ requireOptionalNativeModule: (...a: unknown[]) => mockRequire(...a) }));

function load(native: unknown) {
  mockRequire.mockReturnValue(native);
  let mod: typeof import("./index");
  jest.isolateModules(() => {
    mod = require("./index");
  });
  return mod!;
}

describe("widget-bridge wrapper", () => {
  it("looks up the native module by its Expo name", () => {
    load(null);
    expect(mockRequire).toHaveBeenCalledWith("CodeInstaWidgetBridge");
  });

  it("is a no-op returning false when the native module is missing", () => {
    const m = load(null);
    expect(m.setSnapshot("{}")).toBe(false);
    expect(m.clearSnapshot()).toBe(false);
    expect(m.reloadWidgets()).toBe(false);
  });

  it("forwards calls to the native module", () => {
    const native = { setSnapshot: jest.fn(), clearSnapshot: jest.fn(), reloadWidgets: jest.fn() };
    const m = load(native);
    expect(m.setSnapshot('{"v":1}')).toBe(true);
    expect(m.clearSnapshot()).toBe(true);
    expect(m.reloadWidgets()).toBe(true);
    expect(native.setSnapshot).toHaveBeenCalledWith('{"v":1}');
    expect(native.clearSnapshot).toHaveBeenCalledTimes(1);
    expect(native.reloadWidgets).toHaveBeenCalledTimes(1);
  });

  it("swallows native errors", () => {
    const boom = () => {
      throw new Error("native");
    };
    const m = load({ setSnapshot: boom, clearSnapshot: boom, reloadWidgets: boom });
    expect(m.setSnapshot("{}")).toBe(false);
    expect(m.clearSnapshot()).toBe(false);
    expect(m.reloadWidgets()).toBe(false);
  });
});

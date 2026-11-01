import { fadeScreenOptions, modalScreenOptions, sheetScreenOptions, stackScreenOptions } from "./screenOptions";

describe("screenOptions presets", () => {
  it("iOS push uses the native default slide with the swipe-back gesture on", () => {
    const o = stackScreenOptions({ os: "ios" });
    expect(o).toMatchObject({ animation: "default", gestureEnabled: true, headerShown: false });
  });
  it("Android push uses ios_from_right", () => {
    expect(stackScreenOptions({ os: "android" })).toMatchObject({ animation: "ios_from_right", gestureEnabled: true });
  });
  it("modals slide up on iOS and fade from the bottom on Android", () => {
    expect(modalScreenOptions({ os: "ios" })).toMatchObject({ presentation: "modal", animation: "default" });
    expect(modalScreenOptions({ os: "android" })).toMatchObject({ presentation: "modal", animation: "fade_from_bottom" });
  });
  it("sheets are a form sheet with a grabber on iOS and a transparent modal on Android", () => {
    expect(sheetScreenOptions({ os: "ios" })).toMatchObject({ presentation: "formSheet", sheetGrabberVisible: true });
    expect(sheetScreenOptions({ os: "android" })).toMatchObject({
      presentation: "transparentModal",
      animation: "fade_from_bottom",
    });
  });
  it("Reduce Motion turns every preset into a short fade", () => {
    for (const os of ["ios", "android"] as const) {
      for (const make of [stackScreenOptions, modalScreenOptions, sheetScreenOptions]) {
        expect(make({ os, reduced: true })).toMatchObject({ animation: "fade", animationDuration: 160 });
      }
    }
  });
  it("auth swaps fade and are not swipeable", () => {
    expect(fadeScreenOptions()).toMatchObject({ animation: "fade", gestureEnabled: false });
  });
});

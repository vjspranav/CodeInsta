# iOS performance check

Targets are the same as Android: cold start to first frame playing under 1.5 s, swipe to next reel
playing under 150 ms, scrolling with hitch time ratio under 5 ms per second. Measure the release
build on the iPhone, not the simulator and not a dev client.

## 1. Build with the probe on

```
cd apps/mobile
EXPO_PUBLIC_PERF=1 npx expo run:ios --configuration Release --device
```

The probe prints `CI_PERF <name> <ms>` lines and is a no-op in builds without
`EXPO_PUBLIC_PERF=1`. Never ship a probe build.

## 2. Hitches (scrolling)

1. Xcode, Open Developer Tool, Instruments. Choose the **Animation Hitches** template.
2. Pick the connected iPhone and the CodeInsta app as the target, press Record.
3. Open the Feed tab and swipe through 30 reels at a normal pace (about one per second).
4. Stop. In the Hitches track read **Hitch Time Ratio** for the whole run.
5. Pass: under **5 ms per second**. Note the worst hitch and which swipe it was.

## 3. Cold start and swipe latency

1. Xcode, Window, Devices and Simulators, select the iPhone, Open Console.
2. Filter the console on `CI_PERF`, press Clear.
3. Force quit CodeInsta, then launch it from the home screen. Repeat 10 times; each launch prints one
   `first_frame_playing` line (JS bundle start to the first reel playing).
4. After a launch, swipe 30 reels; each swipe prints one `swipe_to_play` line.
5. Cold start is `first_frame_playing` plus the native launch time. Measure the launch time with
   Instruments, App Launch template, on the same release build, and record both numbers.
6. Pass: median cold start under 1500 ms, `swipe_to_play` 95th percentile under 150 ms.

To get p50 and p95, copy the console lines into a text file and run the same parser as Android
(add the cold start total yourself as `CI_PERF cold_start_to_first_frame <ms>` lines, and a
`JANKY <pct>` line from the hitch run, since iOS has no gfxinfo):

```
npx tsx apps/mobile/perf/parse-perf.ts <capture.txt>
```

## 4. Record

Add date, device, iOS version, hitch ratio, cold start p50 and swipe p95 to
`docs/mobile/perf-results.md` (Task 6.1 adds the iPhone numbers).

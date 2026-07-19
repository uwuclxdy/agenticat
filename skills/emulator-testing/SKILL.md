---
name: emulator-testing
description: "Boots and drives Android AVDs and iOS simulators from the CLI (adb, `xcrun simctl`, Flutter `integration_test`, Alchemist goldens). Use when running headless app tests, verifying screenshots, or debugging emulator boot/GPU issues."
metadata:
  author: uwuclxdy
  version: "1.5"
---

# Emulator Testing

Drive a booted Android emulator or iOS simulator from the CLI for agent-in-the-loop testing:
launch it headless, wait for a real boot, act on it with `adb`/`simctl`, verify with a real
file parser (not a vibe check), shut it down clean.

**Out of scope**: installing the Android SDK, creating AVDs, or setting up Xcode/simulators.
Assume `$ANDROID_HOME`/`PATH` and an existing AVD, or Xcode + simulator runtimes, are already
in place. This skill is about driving them.

§2's `adb` primitives work unmodified against a real physical device over USB (same commands,
target it with `adb -s <device_serial>`). §1's boot/lifecycle flags and §4's `simctl` lane are
emulator/simulator-only and don't apply to physical hardware.

## Decision Tree

```
Target platform?
├─ Android → live on this host → §1 boot the emulator → §2 drive it → §3 Flutter tests
└─ iOS     → needs a Mac → run over ssh to your macOS host → §4 simctl lane → §3 Flutter tests
```

---

## 1. Android Emulator Lifecycle

### Headless Boot

```bash
emulator -avd <avd_name> \
  -no-window -no-audio -no-boot-anim \
  -gpu swiftshader_indirect \
  -no-snapshot-save \
  -read-only &
```

| Flag | Effect |
|---|---|
| `-no-window` | no graphical window; drive it purely over `adb`/console. Standard flag for a headless/CI box |
| `-gpu swiftshader_indirect` | software GLES/Vulkan rendering on the CPU; the only reliable renderer with no display server |
| `-gpu host` | passes through the host GPU (faster), but fails with "OpenGLES emulation failed to initialize" unless a real X/Wayland session (or Xvfb) is present. Don't use it headless |
| `-no-audio` | skip audio backend init; some Linux/Windows audio drivers otherwise block emulator startup |
| `-no-boot-anim` | skip the boot animation, faster startup |
| `-read-only` | don't write back to the AVD's userdata image; several emulator processes can share one base AVD without corrupting it. Standard pattern for parallel instances |
| `-port <n>` | pick the console/adb port pair explicitly (default range 5554-5682, even numbers only). Required alongside `-read-only` to run more than one instance side by side |
| `-no-snapshot-save` | quick-boot from a snapshot if one exists, skip saving state on exit |
| `-no-snapshot-load` | force a full cold boot, ignoring any saved snapshot |
| `-no-snapshot` | disable Quick Boot entirely: neither load nor save |
| `-wipe-data` | factory-reset the userdata partition before boot (last resort, destroys all AVD state; not for routine use on every run) |

Match the system image ABI to the host arch (`x86_64` image on an `x86_64` host); an ARM image
on x86 needs per-instruction translation and is dramatically slower.

### Boot-Completion Detection

`adb wait-for-device` only confirms the adb bridge is up, **not** that Android finished
booting:

```bash
adb -s emulator-5554 wait-for-device
until [[ "$(adb -s emulator-5554 shell getprop sys.boot_completed | tr -d '\r')" == "1" ]]; do
  sleep 2
done
adb -s emulator-5554 shell input keyevent 82   # KEYCODE_MENU, dismiss the lock screen
```

### Clean Shutdown

```bash
adb -s emulator-5554 emu kill
```

If the console doesn't respond (auth-token mismatch, hung boot), fall back to killing the host
process: `pkill -f "qemu.*-avd <avd_name>"`.

---

## 2. Driving It: adb Primitives

Works against any installed app, Flutter or not.

| Action | Command |
|---|---|
| Tap | `adb shell input tap <x> <y>` |
| Swipe | `adb shell input swipe <x1> <y1> <x2> <y2> <duration_ms>` |
| Text | `adb shell input text "hello"` (spaces don't survive; replace them with `%s` as in `input text hello%sworld`, or send a literal space via `input keyevent 62`) |
| Key event | `adb shell input keyevent <code>` (e.g. `4`=back, `82`=menu/unlock, `3`=home) |
| Screenshot | `adb exec-out screencap -p > shot.png` |
| Screen record | `adb shell screenrecord /sdcard/demo.mp4` (Ctrl-C to stop, then `adb pull`) |
| View hierarchy | `adb shell uiautomator dump /sdcard/window_dump.xml && adb pull /sdcard/window_dump.xml` |
| Filtered logs | `adb logcat --pid=$(adb shell pidof -s com.example.app)` or `adb logcat -s <tag>` |
| Install / uninstall | `adb install -r app.apk` / `adb uninstall com.example.app` |

No simulator equivalent: iOS's `simctl` (§4) has no touch/text input-injection primitive.
Use `integration_test`/XCUITest-level tooling for iOS UI instead (see §4).

### Verify Screenshots with a Real Parser, Not Prose

A vision-model "looks correct" read on a screenshot is not verification. Decode the file:

```bash
file shot.png   # expect: PNG image data, <W> x <H>, ...
```

To confirm an action actually changed the UI (not just that a file exists), diff two captures
instead of trusting a description of them:

```bash
sha256sum before.png after.png   # identical hash = nothing changed on screen
```

---

## 3. Flutter Test Layers

| Layer | Tool | Command |
|---|---|---|
| Unit / widget | `flutter_test` (SDK built-in) | `flutter test` |
| Golden | **Alchemist** (successor to the unmaintained `golden_toolkit`) | `flutter test` via Alchemist's `goldenTest`/`--update-goldens` |
| In-app, on a live emulator/simulator | `integration_test` package | `flutter test integration_test/ -d <device_id>` |
| E2E, native-layer | Maestro / Patrol | out of scope here (higher-level frameworks sitting on top of the primitives in §2) |

Prefer `integration_test` over the legacy `flutter drive`: `flutter drive` runs a separate
driver process against the app process and can't share `flutter_test` APIs, while
`integration_test` runs in the app's own isolate and compiles the tests into the binary itself.

### Screenshots from `integration_test`

```dart
await binding.convertFlutterSurfaceToImage(); // Android ONLY, before the first screenshot
await tester.pumpAndSettle();
await binding.takeScreenshot('screen-1');
```

Skipping `convertFlutterSurfaceToImage()` on Android produces blank/black captures. Not
needed on iOS or web.

Persistence caveat (verified empirically): under plain `flutter test integration_test/`,
`takeScreenshot()` only buffers the PNG bytes in the binding; nothing writes them to disk.
Persisting needs the `flutter drive` path with a driver that consumes them
(`integration_test`'s `flutter_driver` extension + a `responseDataCallback` writing files).
Without that wiring, capture independently via `adb exec-out screencap -p` instead.

### Dart & Flutter MCP Server (Dev-Loop Tooling, Not a Test Runner)

For live inspection while iterating against a running `flutter run` session: hot reload,
widget-tree/selected-widget introspection, runtime errors, static-analysis fixes, pub.dev
search. It complements `integration_test`, it doesn't replace it: there's no repeatable CI
suite here, just a tight feedback loop for an agent driving development.

Requires Dart SDK 3.9 / Flutter 3.35 or later.

```bash
dart mcp-server                                          # runs stdio, start it directly to check it launches
claude mcp add --transport stdio dart -- dart mcp-server # register it for Claude Code
```

---

## 4. iOS Simulator Lane (Your macOS Host over ssh)

No Mac locally? Run everything in this section over ssh on your macOS host; the simulator is
still driven from a Linux/CI box's shell, only the `xcrun`/`simctl` calls run remotely.

```bash
xcrun simctl list devicetypes                     # find a device type id
xcrun simctl list runtimes                          # find an iOS runtime id
xcrun simctl create MyTestPhone "iPhone 15" "iOS-17-5"
xcrun simctl boot MyTestPhone                        # or boot by UDID
xcrun simctl install booted /path/to/App.app
xcrun simctl launch booted com.example.app
xcrun simctl io booted screenshot --type=jpeg out.jpg
xcrun simctl io booted recordVideo out.mp4            # Ctrl-C to stop
xcrun simctl terminate booted com.example.app
xcrun simctl shutdown MyTestPhone
```

`simctl` has no touch/text input-injection primitive (no `adb input tap`/`swipe`/`text`
equivalent, see §2). Use `integration_test`/XCUITest-level tooling (or `idb`) for iOS UI input,
not raw `simctl` calls.

Flutter on the same host: `flutter build ios --simulator --debug` needs no code signing;
`flutter test integration_test/ -d <simulator_udid>` runs directly against a booted sim.
Physical-device builds need a Team ID + provisioning profile. Always target the simulator
for agent-driven testing to sidestep signing entirely.

### The ssh-Headless Gotcha (Load-Bearing, Verify Before Relying on This)

The iOS Simulator is a GUI app at heart and needs an active macOS **GUI session** to function,
even when every command driving it arrives over ssh:

- someone logged into the graphical console (even locked) → ssh-driven `simctl`/test-runner
  commands work fine.
- **nobody** logged into the GUI → the simulator driver fails to start, surfacing as a
  driver-startup timeout or a hung `simctl`/`xcodebuild` call.
- **fix**: enable automatic login for a user on your macOS host (System Settings → Users &
  Groups) so a GUI session always exists after boot/reboot, independent of ssh activity.

First-run gotcha: `sudo xcodebuild -license accept` is an interactive prompt the first time;
accept it once by hand before handing the host to an agent.

---

## Gotchas

| # | Area | Gotcha | Fix |
|---|---|---|---|
| 1 | adb server | two adb binaries on `PATH` (platform-tools + a copy bundled with another tool) → `adb server version doesn't match this client; killing...` | `adb kill-server`, make sure only one adb binary (matching platform-tools) resolves on `PATH`, retry |
| 2 | Boot timing | cold boot ≈30-90s vs Quick Boot snapshot restore ≈5-10s | prefer snapshot restore for repeated runs; `-no-snapshot-load` forces a fresh cold boot when snapshot state is suspect |
| 3 | GPU mode | `-gpu host` fails ("OpenGLES emulation failed to initialize") with no display/GPU context | `-gpu swiftshader_indirect` on headless boxes; `-gpu host` only with a real display session |
| 4 | KVM (Linux) | emulator silently falls back to software TCG emulation (~10x slower) without hardware-accel access | confirm `/dev/kvm` exists and is accessible before assuming acceleration is active |
| 5 | Boot detection | `adb wait-for-device` confirms only the adb bridge, not that Android finished booting | poll `adb shell getprop sys.boot_completed` until it prints `1` |
| 6 | Flaky boot recovery | an AVD repeatedly fails to boot or hangs mid-boot | retry with `-no-snapshot-load` (bypass a possibly-corrupt snapshot); `-wipe-data` as the last resort (destroys all AVD state) |
| 7 | `input text` | literal spaces get dropped | replace spaces with `%s`, or send them via `input keyevent 62` |
| 8 | Flutter screenshots | forgetting `convertFlutterSurfaceToImage()` before the first `takeScreenshot()` on Android → blank capture | call it once before the first screenshot; Android only |
| 9 | Screenshot verification | a vision-model "looks right" read is not verification | parse the file for real (`file`/PNG header), diff two captures to confirm the UI changed |
| 10 | iOS + ssh | simulator driver fails to start with nobody logged into the macOS GUI console | enable auto-login on the macOS host |
| 11 | iOS code signing | device builds need a Team + provisioning profile; simulator builds need none | target the simulator for agent-driven testing |
| 12 | GPU cold start | the first app to render after a fresh headless swiftshader boot can sit 60-90s on the splash at 0 rendered frames, no error, process idle | check `dumpsys gfxinfo <pkg> \| grep 'Total frames'`; force-stop and relaunch once before calling it a hang |
| 13 | First android build | AGP auto-downloads NDK/build-tools/CMake on the first `flutter build`/`test` (~3+ min); a short command timeout kills the download mid-flight and leaves a corrupt `$ANDROID_HOME/ndk/<ver>` stub | run first builds backgrounded or with a generous timeout; on `source.properties` errors delete the stub dir and rebuild |
| 14 | Xcode first run | `xcodebuild -license accept` is interactive, blocks headless automation | accept it once by hand before automating |
| 15 | Physical device | §2's `adb` primitives assume an emulator serial (`emulator-5554`) | works unmodified on a real USB device too, target it with `adb -s <device_serial>`; §1/§4 boot-lifecycle content stays emulator/simulator-only |
| 16 | iOS input injection | `simctl` (§4) has no touch/text input-injection primitive, unlike `adb input tap`/`swipe`/`text` (§2) | use `integration_test`/XCUITest-level tooling (or `idb`) for iOS UI input |

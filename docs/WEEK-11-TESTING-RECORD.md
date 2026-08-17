# Week 11 — Stability, Testing & Crash Fixes

**Project:** FORMA Mobile (React Native / Expo SDK 57)
**Focus:** Diagnosing and fixing the live-tracking crash, then a whole-app stability pass.

---

## Part 1 — The live tracking crash

### Symptom

Using GPS Live Tracking for a run on a **real Android phone**, the app crashed suddenly
part-way through the workout. The same feature ran without incident in Expo Go on the
emulator, which is what made it hard to pin down.

### Root causes found

Five separate defects were found in the live-tracking path. They are ranked below by how
likely each is to be *the* crash the phone was hitting. Nos. 1 and 2 are the ones that
produce a hard, immediate crash; 3–5 make it far more likely and much harder to recover
from.

#### 1. Unvalidated GPS coordinates reaching the native map — *primary suspect*

`handleLocation` took whatever `expo-location` handed it and put it straight into React
state and then into `react-native-maps`:

```ts
const { latitude, longitude, accuracy } = loc.coords
// …no validation…
setRoute((r) => [...r, { latitude, longitude, timestamp: loc.timestamp }])
```

Android's fused location provider can emit a fix whose coordinates are `NaN`,
`undefined`, or out of range — when it switches between cell/wifi and satellite sources,
on a mocked location, or on a hardware glitch. This is rare per-fix, which is exactly why
it shows up as "crashes after a while" on a long run and never in a short emulator test.

Two things then happen, and the second one is fatal:

- **The numbers are permanently poisoned.** Verified by running the original maths:

  ```
  segment from a NaN fix     : NaN
  running distance after it  : NaN     ← and stays NaN for the rest of the run
  displayed distance         : NaN km
  pace / calories            : NaN
  ```

  `NaN` survives every subsequent `+`, `toFixed()` and `Math.round()`, so one bad fix
  corrupts distance, pace and calories for the remainder of the workout — and that is
  what would have been written to Firestore.

- **A `NaN` latitude is passed to `<Polyline>` and to the map `region`.** The Google Maps
  Android SDK throws on a non-finite `LatLng`. That happens **inside native code**, so it
  is not catchable by a JS `try/catch` *or* by a React error boundary — it takes the
  process down. This is the crash mechanism that matches the reported symptom.

**Fix:** `isValidCoordinate()` in `src/utils/geo.ts` gates every coordinate at three
points — before it enters state, before distance is accumulated, and again in `RouteMap`
immediately before the native layer. `haversineDistance()` now returns `0` rather than
`NaN` for bad input, and clamps before `Math.sqrt` so floating-point error can't produce
a `NaN` for near-antipodal points either.

#### 2. Unbounded memory and render growth over a long run

- `route` grew without limit — one point per ~5 m, so ~1,200/hour, with **no cap**.
- Every new point rebuilt the array *and* re-serialised the **entire** polyline across the
  JS↔native bridge. Cost per update grew with the length of the run: O(n²) overall.
- `RouteMap` was **not memoised** and received `style={{ flex: 1 }}` — a fresh object on
  every render — so it re-rendered whenever its parent did.
- The parent re-rendered **four times a second** for the whole workout, because the timer
  tick stored a fresh `Date.now()` in state on every 250 ms tick.
- `region` was passed as a **controlled prop**, so the map was commanded to re-position on
  every GPS fix, on top of all the above.

The combination is a steadily worsening memory and main-thread load — consistent with a
crash that happens *later* in a run rather than at the start, and worse on a real phone
than on a desktop-backed emulator.

**Fix:**
- Stored route capped at **1,000 points**; past that the route halves its resolution
  (keep every other point, always keep the newest), so a 3-hour run costs the same memory
  as a 30-minute one. Distance accumulates separately, so thinning loses no accuracy.
- Rendered polyline decimated to **300 points** — more is invisible on a phone screen.
- `RouteMap` is now `memo()`-wrapped, and the style object is a module-level constant.
- The timer now writes state only when the displayed second actually changes, so React
  bails out of the re-render: **4 re-renders/sec → at most 1/sec**.
- The map region is applied **imperatively** (`animateToRegion` on a ref) with
  `initialRegion` for the first camera, instead of as a controlled prop.

#### 3. No error handling on any GPS operation

`Location.watchPositionAsync` rejects when location services are switched off mid-run,
when the provider is unavailable, or when the OS revokes permission while backgrounded.
There was no `try/catch` anywhere, and `beginTracking` was invoked as a bare
`setTimeout(beginTracking, 3600)` — an **unhandled promise rejection**.

This matters much more on the phone than on the emulator: **in a release build there is no
redbox**, so an uncaught error or unhandled rejection is a fatal error rather than a
dismissible dev overlay.

**Fix:** every GPS call is wrapped; failures become a friendly, actionable banner
(`gpsErrorMessage()` maps the raw native message to something readable). The timer keeps
running, the workout stays saveable, and a **Retry GPS** control re-subscribes without
ending the session.

#### 4. Permission granted ≠ GPS usable

The code checked only `permission.granted`. A user can hold the location permission while
the device's **location services toggle is off** — `watchPositionAsync` then rejects a few
seconds into the countdown.

**Fix:** `Location.hasServicesEnabledAsync()` is checked up-front in `handleStart`, so the
problem is reported before the countdown instead of mid-workout.

#### 5. Missing Google Maps API key for real-device builds

This one only affects builds, not Expo Go, and is very likely part of why the bug was
"real phone only".

`react-native-maps` needs `com.google.android.geo.API_KEY` in the Android manifest. **Expo
Go supplies its own key**, which is why the map works on the emulator. In an EAS build
there was none configured — and worse, react-native-maps' own config plugin does not
merely skip the key when unset, it **actively removes** the manifest entry
(`node_modules/react-native-maps/plugin/build/android.js`). The result is a Maps SDK that
cannot authorise, and map operations against an uninitialised map surface are a known
native-crash path.

**Fix:** `app.config.js` injects the key from the `GOOGLE_MAPS_API_KEY` environment
variable and prints a loud warning when it is absent, so a key-less build can't ship
silently.

> ⚠️ **Action required before the next device build:** create a Google Maps Android API
> key and set it. See the header comment in `app.config.js` for the exact steps.

### Also fixed in the tracker

| Issue | Fix |
|---|---|
| State updates from the GPS callback after unmount | `mountedRef` gates every setState; the callback runs outside React's lifecycle so it can fire once more after teardown |
| GPS "teleport" jumps inflating distance | Segments implying > 30 m/s (108 km/h) are rejected; the point still becomes the new anchor |
| `subscription.remove()` throwing if the OS already tore it down | Wrapped in `try/catch` |
| A whole run lost if the tracking screen errored | Workout state is mirrored to a ref owned by `LogScreen`; the error boundary offers **"Recover this workout"**, which remounts the tracker on the summary screen with the data intact |
| Degenerate single-point polyline | Skipped; markers carry it until there's a real segment |

---

## Part 2 — App-wide stability audit

### Firestore listeners

All eight `onSnapshot` listeners audited — `sessionsStore`, `useWeeklyPlan` (×2),
`useProgressData`, `useConflicts`, `useConflictHistory`. **All were already correctly
unsubscribed** on unmount (returned directly from the effect). No changes needed.

### Timers and subscriptions — issues found and fixed

| Location | Problem | Fix |
|---|---|---|
| `LogScreen` ×3 | `setTimeout(goBackToPlannerOrReset, 700–1000)` with no cleanup — switching tabs inside that window navigated and setState on a torn-down screen | New `useSafeTimeout()` hook clears pending timers on unmount |
| `OnboardingScreen` | 2.6 s profile-commit timer, uncleaned | `useSafeTimeout()` |
| `LogScreen` | `setState` after the awaited Firestore write, when the user leaves mid-save | Guarded with `useIsMounted()` |
| `DashboardScreen` | `setRefreshing(false)` after a 400 ms delay, when the tab is switched mid-pull | Guarded with `useIsMounted()` |
| `SettingsScreen` | `setSaving(false)` after the flush-on-unmount write | Guarded with `useIsMounted()` |

`Toast`, `networkStore` and `SettingsScreen`'s debounce timer were already clean.

### Error boundaries (new)

There were **none** in the app before this week. In a release build an uncaught React error
unmounts the whole tree with no redbox — the app blanks out, indistinguishable from a
native crash.

- `ErrorBoundary` component — friendly message, the error text in small print for bug
  reports, a retry that remounts, and an optional secondary action.
- **Per-screen** boundaries on all five tabs plus Conflict History
  (`withScreenBoundary`), so a crash is contained: the tab bar keeps working, other tabs
  keep their state, and retry remounts only the broken screen.
- A **dedicated** boundary around `LiveTracker` with the workout-recovery action.
- A **root** boundary in `App.tsx` for the navigator itself and the auth/onboarding
  screens, which sit outside the tab navigator.

### Unhandled promise rejections on Firestore writes — fixed

Five write paths were invoked as `void promise(...)` with no `catch`. A failed write (offline,
permissions) was an unhandled rejection, and the user got no feedback — a dismiss button
that silently did nothing.

| Location | Action |
|---|---|
| `useConflicts.dismissConflict` | dashboard banner dismiss |
| `useConflictHistory.dismiss` | history card dismiss |
| `PlannerScreen.handleDelete` | swipe-to-delete a session |
| `PlannerScreen` conflict sheet | dismiss from the planner |
| `SettingsScreen.handleClearData` | clear all training data |

All now catch, and show an offline-aware error toast.

`SessionDetailModal` (edit/delete) and `LogScreen`'s save path already handled failure
correctly — no change.

### Performance

- **`ConflictHistoryScreen` converted from `ScrollView` + `.map()` to `FlatList`.** This
  list is unbounded — the "All" filter includes every conflict ever recorded — so it would
  have mounted every card at once and grown heavier with account age. Now windowed
  (`initialNumToRender={8}`, `removeClippedSubviews`), with the entry-animation stagger
  capped so the 40th card doesn't wait 1.6 s to appear.
- Every other `.map()` in the app was checked and is **bounded** by construction — fixed
  option lists, the 7 planner days, `RecentActivity`'s 7-row cap, or SVG chart internals.
  No further conversions needed.
- Live tracking re-render rate cut from **4/sec to ≤1/sec** (see above).

---

## Part 3 — Test results

### Automated: GPS maths edge cases — **37/37 passing**

Run against the compiled `src/utils/geo.ts`.

**Coordinate validation (11 cases)** — `NaN` lat, `NaN` lon, `undefined`, `null`,
`Infinity`, lat 91, lon −181, string coords all correctly **rejected**; London, (0,0) and
the poles correctly **accepted**.

**Distance, never `NaN` (6 cases)** — identical points → `0` (no division-by-zero);
`NaN`/`undefined` input → `0`, not `NaN`; antipodal points finite; 1° latitude = 111 km
(correct); a 5 m step is still measurable.

**Pace / speed extremes (9 cases)** — zero distance, zero duration, `NaN` distance and
`NaN` duration all return the `--:-- /km` placeholder; a **sub-minute** session (30 s,
100 m) formats correctly; a **3-hour** marathon (10,800 s, 42.2 km) → `4:16 /km`; a
1,000,000 km distance stays finite.

**Route decimation (6 cases)** — 5,000 points → capped at 300, first and last preserved;
short routes untouched; empty and single-point routes safe.

**Simulated 3-hour run (5 cases)** — 3,600 GPS fixes fed through the real accumulation
logic:

| Check | Result |
|---|---|
| Stored points stay bounded | ✅ never exceeded 1,000 |
| Distance still accurate | ✅ 18 km (expected 18 km) |
| Distance finite after 3,600 fixes | ✅ |
| Points handed to the map | ✅ 300 |

### Build verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ clean, no errors |
| `npx expo export --platform android` | ✅ bundled, 1,663 modules |
| `npx expo config` without a Maps key | ✅ warns loudly, config still valid |
| `npx expo config` with a Maps key | ✅ plugin injected with `androidGoogleMapsApiKey` |

### Edge cases reviewed

| Case | Status |
|---|---|
| No sessions / no conflicts / no network | Empty states already present from Week 10; verified unchanged |
| Very long session (3 h+) | ✅ tested — memory bounded, distance accurate |
| Very short session (< 1 min) | ✅ pace formats; summary shows the "under a minute" note; duration floors at 1 min on save |
| Extreme values (RPE limits, huge distances) | ✅ RPE slider is bounded 1–10 by construction; huge distances stay finite |
| Rapid navigation between tabs | ✅ fixed — deferred navigation and post-await setState are now unmount-safe |
| Logging out mid-operation | ✅ fixed — in-flight writes complete; UI updates are skipped rather than applied to a dead screen |
| Offline | Firestore memory cache + offline banner from Week 10; failed writes now all report to the user |

---

## Files changed

**New**
- `src/components/ui/ErrorBoundary.tsx`
- `src/components/ui/withScreenBoundary.tsx`
- `src/hooks/useSafeTimeout.ts` (`useSafeTimeout`, `useIsMounted`)
- `app.config.js`

**Modified**
- `src/components/log/LiveTracker.tsx` — the crash fix
- `src/components/session/RouteMap.tsx` — validation, memo, imperative camera, decimation
- `src/utils/geo.ts` — `isValidCoordinate`, `decimateRoute`, `NaN`-safe maths
- `src/screens/LogScreen.tsx` — boundary, workout recovery, safe timers
- `src/screens/ConflictHistoryScreen.tsx` — `FlatList`
- `src/screens/PlannerScreen.tsx`, `SettingsScreen.tsx`, `DashboardScreen.tsx`,
  `OnboardingScreen.tsx` — unmount safety, write-failure handling
- `src/hooks/useConflicts.ts`, `useConflictHistory.ts` — write-failure handling
- `src/navigation/MainTabs.tsx`, `AppStack.tsx`, `App.tsx` — error boundaries

---

## Known limitations

- **The Google Maps API key still needs to be supplied** before the next EAS build —
  see `app.config.js`. Until then the map will not render in a standalone build (Expo Go
  is unaffected).
- Root cause #1 is identified by code inspection and reproduction of the `NaN`
  propagation, not by a captured crash log from the affected phone. If a crash recurs,
  `adb logcat -b crash -d` during a run would confirm which of the five paths was hit;
  the `ErrorBoundary` console tags (`[ErrorBoundary: LiveTracker]`) now make JS-side
  failures attributable.
- Live tracking remains **foreground-only** (`useForegroundPermissions` + keep-awake).
  Tracking with the screen off would need background location permission and a foreground
  service — out of scope for this project.

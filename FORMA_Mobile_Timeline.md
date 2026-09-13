# FORMA Mobile — Development Plan
### 12 Weeks · July 6 → September 26, 2026
### React Native pivot · Weekly advisor check-ins
### Deliverable: working Android app on Sep 26

---

## The Numbers

- **Start:** Monday, July 6, 2026
- **Deadline:** Friday, September 26, 2026
- **Total time:** 12 weeks (84 days)
- **Team:** 2 developers, ~2–4 hours/day
- **Advisor check-ins:** every Friday — must show tangible progress

---

## Overview

| Phase | Week | Advisor sees |
|---|---|---|
| Phase 0: Pivot Prep | Week 1 (Jul 6–12) | Environment ready, plan approved, web app demonstrated as validation of concept |
| Phase 1: Foundation | Week 2 (Jul 13–19) | Auth + navigation on real Android emulator |
| Phase 2: Log Sessions | Week 3 (Jul 20–26) | Full session logging on phone syncing to Firestore |
| Phase 3: Dashboard | Week 4 (Jul 27–Aug 2) | Live dashboard with real metrics |
| Phase 4: Session Editing | Week 5 (Aug 3–9) | Full CRUD, session detail modal, Settings |
| Phase 5: Weekly Planner | Week 6 (Aug 10–16) | Native planner with swipe gestures |
| Phase 6: Progress Analytics | Week 7 (Aug 17–23) | Charts on mobile |
| Phase 7: Conflict Detection | Week 8 (Aug 24–30) | Warning system fully working |
| Phase 8: Push Notifications | Week 9 (Aug 31–Sep 6) | Native reminders + weekly summaries |
| Phase 9: Polish & Native Feel | Week 10 (Sep 7–13) | Haptics, animations, splash, icon |
| Phase 10: Testing & APK | Week 11 (Sep 14–20) | APK on real phone, bulletproof |
| Phase 11: Buffer + Submission | Week 12 (Sep 21–26) | Final polish, package, submit |

---

## Week 1 — July 6–12 · Pivot Prep + Advisor Alignment

**Focus:** Don't code the app yet. Prepare the ground and get buy-in.

| Day | Task |
|---|---|
| Mon Jul 6 | Announce pivot to advisor via short written message. Frame as a strategic upgrade responding to his feedback. Attach this timeline. |
| Tue Jul 7 | Install Android Studio + Android emulator (Pixel 7 device). Verify emulator boots. |
| Wed Jul 8 | Install Expo CLI. Create the forma-mobile project. Get a blank React Native app running on the emulator. |
| Thu Jul 9 | Install NativeWind + Firebase + React Navigation. Confirm all packages install cleanly. |
| Fri Jul 10 | Advisor check-in: show him the emulator running, explain the tech stack pivot, share the 12-week timeline. Get his buy-in before writing more code. |
| Weekend | Copy from web project: /algorithms, /types, /utils, /constants, /config/firebase.ts, Zustand stores, /services, /hooks. Everything non-UI. |

**Advisor sees Friday:** working Android emulator + 12-week plan + reused business logic from the web project (shows continuity, not starting from zero).

---

## Week 2 — July 13–19 · Foundation & Auth

**Focus:** Login, register, onboarding, navigation.

| # | Task | Est. Time |
|---|---|---|
| 2.1 | Set up React Navigation: AuthStack + MainTabs | 2 hrs |
| 2.2 | Build LoginScreen (email/password, error states) | 2 hrs |
| 2.3 | Build RegisterScreen (name, email, password) | 2 hrs |
| 2.4 | Wire authStore to Firebase Auth — reuse from web | 1 hr |
| 2.5 | Auth state routing (logged in → tabs, logged out → auth) | 1.5 hrs |
| 2.6 | Rebuild 4-step onboarding as native screens | 4 hrs |
| 2.7 | Bottom tab bar with 5 tabs (Dashboard, Log, Planner, Progress, Settings) — placeholder screens for now | 2 hrs |
| 2.8 | FORMA branding across auth screens | 1.5 hrs |

**Advisor check-in Fri Jul 17:** register a new user, complete onboarding, land on empty dashboard tab. Full auth flow on the phone.

---

## Week 3 — July 20–26 · Log Session Screen

**Focus:** The most-used screen. Must feel great on mobile.

| # | Task | Est. Time |
|---|---|---|
| 3.1 | Sport selector — horizontal scrolling card list with sport icons | 2 hrs |
| 3.2 | Duration input with native number pad + big number display | 1.5 hrs |
| 3.3 | RPE slider — native slider, color changes by zone (green/amber/red) | 3 hrs |
| 3.4 | Distance input (conditional on running/swimming/cycling) | 1 hr |
| 3.5 | Live load display — reuse sRPE algorithm | 1 hr |
| 3.6 | Notes textarea | 30 min |
| 3.7 | Save button → Firestore via existing sessionService | 1 hr |
| 3.8 | Success animation + haptic feedback (Expo Haptics) | 1.5 hrs |
| 3.9 | Show conflict modal after save if any conflict was detected | 2 hrs |

**Advisor check-in Fri Jul 24:** log a session on the phone, open the still-running web app on laptop, show the session appearing there in real time. **Proves the mobile app is real, not a mock.**

---

## Week 4 — July 27 – August 2 · Dashboard Screen

**Focus:** The screen your advisor will linger on. Must impress.

| # | Task | Est. Time |
|---|---|---|
| 4.1 | Header: time-aware greeting, date, floating "+ Log" button | 1.5 hrs |
| 4.2 | FormScoreCard — big score, gradient by state, animated pulse on mount | 4 hrs |
| 4.3 | MetricGrid — 2×3 or 2×2 stat cards (weekly load, budget bar, sessions, streak, calories) | 3 hrs |
| 4.4 | HR Zone distribution chart (custom flexbox bar for simplicity) | 3 hrs |
| 4.5 | Recent Activity list — tappable rows with sport icons, calorie + zone badges | 3 hrs |
| 4.6 | Pull-to-refresh gesture | 1 hr |
| 4.7 | Conflict banner at top when active conflicts exist | 1.5 hrs |
| 4.8 | Empty state for brand new users | 1.5 hrs |

**Advisor check-in Fri Jul 31:** live dashboard with real numbers. Log a session in front of him and watch the dashboard update instantly.

---

## Week 5 — August 3–9 · Session Detail + Edit + Settings

**Focus:** Full CRUD lifecycle. Prove it's a real app, not just a data logger.

| # | Task | Est. Time |
|---|---|---|
| 5.1 | Session detail as full-screen modal (native presentation) | 2 hrs |
| 5.2 | View mode — all stats displayed with icons and visual polish | 2 hrs |
| 5.3 | Edit mode — inputs replace read-only fields, calories/zone recalculate live | 4 hrs |
| 5.4 | Save updates Firestore — dashboard and lists update via listeners | 1.5 hrs |
| 5.5 | Delete flow with native confirmation Alert | 1.5 hrs |
| 5.6 | Verify real-time sync across screens | 1 hr |
| 5.7 | Settings screen: edit profile, sports, budget, conflict sensitivity, weight, notifications | 4 hrs |

**Advisor check-in Fri Aug 7:** create, edit, delete sessions on the phone. Change settings and watch defaults update.

---

## Week 6 — August 10–16 · Weekly Planner

**Focus:** Native gestures make it feel premium.

| # | Task | Est. Time |
|---|---|---|
| 6.1 | Week header with date range, prev/today/next arrows, budget bar | 2 hrs |
| 6.2 | Vertical stack of 7 day cards (natural on mobile) | 3 hrs |
| 6.3 | Session chips inside each day, sport-colored | 2 hrs |
| 6.4 | "+ Add session" button per day → LogScreen with date pre-filled | 1.5 hrs |
| 6.5 | Tap chip → SessionDetailModal (reused from Week 5) | 1 hr |
| 6.6 | Swipe left on chip to delete (native gesture) | 3 hrs |
| 6.7 | Swipe left/right on header to change week | 2 hrs |
| 6.8 | Conflict indicator on days with conflicts | 1.5 hrs |
| 6.9 | Today column visually highlighted | 30 min |

**Advisor check-in Fri Aug 14:** navigate weeks by swiping, add sessions to specific days, delete with swipe. This is a "wow" moment — feels like a real app.

---

## Week 7 — August 17–23 · Progress Analytics

**Focus:** Charts on mobile. The analytical payoff.

| # | Task | Est. Time |
|---|---|---|
| 7.1 | Install Victory Native (Recharts doesn't work in React Native) | 30 min |
| 7.2 | Date range selector (4/8/12 weeks) as pill buttons | 1 hr |
| 7.3 | Stats row — sessions, load, calories, avg form, top sport, fitness | 2 hrs |
| 7.4 | CTL/ATL/Form multi-line chart | 5 hrs |
| 7.5 | Sport breakdown bar chart | 2.5 hrs |
| 7.6 | Weekly load bar chart | 2.5 hrs |
| 7.7 | Calorie area chart | 2 hrs |
| 7.8 | Consistency heatmap (grid of colored squares) | 3.5 hrs |
| 7.9 | Empty state when insufficient data | 1 hr |

**Advisor check-in Fri Aug 21:** show the 6-week training story visually — fitness building, fatigue spiking during hard weeks, form recovering.

---

## Week 8 — August 24–30 · Conflict Detection UI

**Focus:** Even though the algorithm is copied over, mobile UX for conflicts is different.

| # | Task | Est. Time |
|---|---|---|
| 8.1 | Verify conflictDetector runs after every logged session (reuse existing) | 30 min |
| 8.2 | ConflictBanner on dashboard — animated slide-down, dismissible | 2.5 hrs |
| 8.3 | Conflict modal after logging — "Save anyway" vs "Undo" native buttons | 3 hrs |
| 8.4 | Conflict severity colors (danger red, warning amber) consistent everywhere | 1.5 hrs |
| 8.5 | Sport interaction matrix editor in Settings — visual grid | 3 hrs |
| 8.6 | Conflict sensitivity picker (Relaxed / Balanced / Strict) with clear explanations | 2 hrs |
| 8.7 | Historical conflicts view in Settings — see and manage past conflicts | 2 hrs |

**Advisor check-in Fri Aug 28:** demo conflict detection live. Log a hard combat session, then try to log a hard run tomorrow — app warns you. FORMA's signature feature.

---

## Week 9 — August 31 – September 6 · Push Notifications

**Focus:** The killer mobile feature. Web app cannot do this. Sells the pivot completely.

| # | Task | Est. Time |
|---|---|---|
| 9.1 | Set up Expo Notifications + request permission during onboarding | 2 hrs |
| 9.2 | Local daily reminder at user-chosen time: "Ready for today's session?" | 3 hrs |
| 9.3 | Conflict push notification when a conflict is detected | 3 hrs |
| 9.4 | Weekly summary notification every Sunday evening | 2.5 hrs |
| 9.5 | Motivational streak notification: "5-day streak — keep going!" | 2 hrs |
| 9.6 | Notification settings screen — toggle each type, set reminder time | 3 hrs |

**Advisor check-in Fri Sep 4:** turn on his phone, receive an actual notification from FORMA. He'll be impressed — undeniable mobile-native value.

---

## Week 10 — September 7–13 · Native Polish

**Focus:** Make it feel shipped.

| # | Task | Est. Time |
|---|---|---|
| 10.1 | Custom app icon (FORMA "F" in teal, 1024×1024 adaptive icon) | 2 hrs |
| 10.2 | Native splash screen with FORMA branding | 1.5 hrs |
| 10.3 | Haptic feedback on all key interactions (save, delete, tab switch, slider drag) | 2 hrs |
| 10.4 | Screen transition animations (slide left/right) | 1.5 hrs |
| 10.5 | Toast/snackbar system with proper native positioning | 2 hrs |
| 10.6 | Status bar theming | 30 min |
| 10.7 | Safe area handling (notch, home indicator) | 1 hr |
| 10.8 | Skeleton loaders on every screen | 2 hrs |
| 10.9 | Empty states with helpful CTAs | 1.5 hrs |
| 10.10 | Offline banner (Firebase handles offline persistence — surface it visually) | 1.5 hrs |
| 10.11 | Full visual audit — colors, spacing, typography, consistency | 3 hrs |

**Advisor check-in Fri Sep 11:** hand him the phone and let him use FORMA. Should feel indistinguishable from a real Play Store app.

---

## Week 11 — September 14–20 · Testing & APK Build

**Focus:** Bulletproof it. Ship it.

| Day | Task |
|---|---|
| Mon | Seed one demo account with 6 weeks of realistic data (reuse existing script — same Firebase project) |
| Tue | Full end-to-end testing on emulator — write down every bug |
| Wed | Test on a real Android phone (Expo Go initially, then dev build) |
| Thu | Fix all bugs from Wed testing |
| Fri | Configure EAS build. Run eas build -p android --profile preview → produces installable APK. Advisor check-in: install the APK on his own phone. |
| Weekend | Test the APK across different Android versions if possible. Fix critical bugs only. |

**Advisor check-in Fri Sep 18:** the APK file exists. He installs it on his phone. FORMA runs standalone. **The moment your professor accepts the deliverable is real.**

---

## Week 12 — September 21–26 · Buffer + Submission

**Focus:** Final polish. Nothing new. Only fix and ship.

| Day | Task |
|---|---|
| Mon | Fix any final bugs |
| Tue | Polish app description, screenshots for submission |
| Wed | Prepare submission package: APK + source code (Git repo) + written documentation |
| Thu | Final buffer day — resist adding features |
| Fri Sep 26 | SUBMIT. |

---

## The Weekly Advisor Communication Rhythm

Every Friday, send a short update. Structure:

> **This week I built:** [1–3 things]
> **You can try it here:** [emulator screenshot / APK / video]
> **Next week I'll build:** [1–2 things]
> **Blocker (if any):** [something specific]

Keep it 5 lines. Advisors love brevity.

**Never miss a Friday.** Even if you accomplished less than planned, send the update. Silence is the enemy — a small update every week beats a big update every three.

---

## Risk Management

**Week 1 setup can eat a full day if Android Studio hits driver issues on Windows.** If it's not working by Wednesday, do the Advisor check-in on Friday about the timeline, not the code. Better to communicate early than surprise him later.

**Charts (Week 7) are the hardest port.** Recharts → Victory Native isn't 1:1. Budget the full week, don't try to save time here.

**Notifications (Week 9) require an Expo development build, not just Expo Go.** Learn the difference early — Expo Go doesn't support push notifications. You'll need EAS dev builds by Week 8 to test.

**EAS build queue can be slow (30–60 min per build on free tier).** Start builds in the morning, work on other tasks while they run. Don't leave the Week 11 build to the last day.

**Do NOT add features after Week 10.** Feature freeze on Sep 13. Only bug fixes after that.

---

## What Carries Over (For Your Advisor's Peace of Mind)

You aren't starting over. From the 10 weeks of web work:

- All algorithms (sRPE, CTL/ATL, form, conflicts, calories, HR zones, pace) — 100% reused
- Firebase Auth + Firestore + security rules — same project, same database
- All Zustand state stores — 100% reused
- All TypeScript types — 100% reused
- All service functions (sessionService, userService) — 100% reused
- All React hooks (useSessionHistory, useMetrics, etc.) — 100% reused
- Seed data script — reused
- Demo data already in Firestore — still there

Roughly 60% of the code carries over. The 40% rebuilt is the UI layer — but that's where mobile-native value comes from (gestures, haptics, notifications).

---

## The Line for Your Advisor Today

> *"Based on your feedback, I'm pivoting to a native Android app. The web version validated the architecture and let me build the mobile version faster than starting from scratch — I'm reusing about 60% of what's already built (algorithms, Firebase, state management) and rebuilding the UI natively. Here's the 12-week plan with weekly milestones you can review. I'll show you the emulator running by Friday."*

Clear. Confident. Adaptive.

---

*FORMA Mobile Timeline v2.0 — 12-week React Native pivot with weekly advisor check-ins*

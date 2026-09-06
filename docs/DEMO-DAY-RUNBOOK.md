# FORMA — demo day runbook

Everything needed to put the app in front of strangers at a pitch day, in the
order you need it.

---

## 1. One-time setup

### 1.1 Create the demo account

Any email you control. Plus-addressing on the *supporting* accounts means one
real mailbox covers all eight, so a personal address is fine — but treat the
password as burned: it ships inside the APK (see §5).

### 1.2 Fill in `.env`

```bash
cp .env.example .env
```

Set at minimum:

```
GOOGLE_MAPS_API_KEY=…      # or the demo's route maps show a placeholder
FORMA_DEMO_EMAIL=…
FORMA_DEMO_PASSWORD=…
```

`.env` is git-ignored. The same file is read by `npx expo` and by
`npm run seed:demo`, so the account the button signs into and the account the
script seeds cannot drift apart.

### 1.3 Seed the demo account

Check the story first, without writing anything:

```bash
npm run seed:demo -- --dry-run
```

That prints a pass/fail line for each of the ten conditions the demo depends on,
computed by running the app's own modules over the generated data. Then:

```bash
npm run seed:demo
```

The script creates the account if it does not exist, clears whatever was there,
and writes ~59 sessions, ~11 conflicts and 3 planned sessions.

### 1.4 Populate the Admin screen (once)

```bash
npm run seed:demo -- --userbase
```

Creates seven supporting accounts with lighter, varied histories. **Run this
once.** It is the only irreversible thing the script does; every later reseed
without the flag leaves them untouched. `--users=6` seeds fewer.

### 1.5 Grant the Admin tab (optional, manual)

`isAdmin` is server-owned — `firestore.rules` rejects it from any client, so the
script cannot set it. In the Firebase console:

> Firestore → `users` → *the demo account's uid* → add `isAdmin: true` (boolean)

Sign out and back in on the handset for the tab to appear.

### 1.6 Build the APK

```bash
eas build --profile preview --platform android
```

EAS needs the same variables. Either set them in the EAS environment
(`eas env:set --name FORMA_DEMO_EMAIL --value … --visibility sensitive`) or make
sure `.env` is picked up by your build profile. **`--visibility sensitive`, not
`secret`** — secret-type variables are unreadable while EAS resolves
`app.config.js`, so the values would silently drop out, exactly as documented for
the Maps key.

Confirm the build actually got them: with neither set, the "Try Demo" button is
not rendered at all.

---

## 2. On the day

### Between testers

Settings → **Demo → Reset Demo Data**.

Rebuilds the seeded story *ending today*, wiping anything the last tester logged
or edited. Takes a couple of seconds. The toast names any condition that did not
come back, so if it says anything other than "Demo data reset", read it before
handing the phone on.

### What a tester can and cannot do

| | |
|---|---|
| Log a session | ✅ allowed — it is the thing they most want to try |
| Edit or delete a session | ✅ allowed |
| Plan a week, resolve conflicts | ✅ allowed |
| Change the theme | ✅ allowed (device-local, cannot touch the story) |
| Change sports / budget / experience / weight / sensitivity / matrix | ❌ blocked, with a toast explaining why |
| Change notification settings | ❌ blocked |
| Clear training data / delete account | ❌ hidden entirely |

The reasoning is in `src/config/demo.ts`: logging is *additive* and moves the
Form Score by a point or two, while a settings change *reinterprets* the whole
history — the sustainable band comes from the budget, the conflict engine reads
the matrix, and the sport list decides what the recommender may suggest. One
slider drag can empty the Progress screen and the next tester would never know
why.

### Exiting

The green strip's **Exit demo** button, or Settings → **Exit Demo**. Both
confirm first, so a tester poking at the chrome cannot end the demo by accident.

---

## 3. What the demo account is meant to show

Verified on every day of the week by the sweep in §4; figures below are for a
mid-week seeding.

| Screen | What is there |
|---|---|
| **Dashboard** | A real Form Score around 0 to +5 ("Balanced" / "Building"), not the baseline meter. An unresolved cross-sport conflict banner. A 3-session weekly plan with per-sport reasoning and recovery countdowns. |
| **Progress** | Twelve weekly bars with an amber over-range week five weeks back, a muted under-range recovery week after it, and green in-range weeks since. Sport Balance at ~65 / 22 / 13 with the over-60% cross-training note. A 3–4 week consistency streak. A conflict strip with ~11 markers. |
| **Planner** | Three planned sessions for the coming week, one pair flagged as a planned conflict with resolution chips. |
| **Session detail** | Seven GPS-tracked runs with real routes, per-kilometre splits, moving time and elevation. |
| **Admin** (if granted) | Seven extra athletes across all seven sports, spread over twelve weeks, two signed up inside thirty days and one lapsed a month ago. |

### Two things worth knowing before someone asks

- **The recommended combat session is a hard one** (typically 90 min at RPE 8–9).
  That is the recommender working as designed: combat is 13% of this athlete's
  load and has not been trained in over two weeks, so it wins the ranking and
  takes the largest share of the week's budget. The card's own reason string says
  so. If you would rather it did not, the lever is `W_BALANCE` in
  `src/algorithms/recommender.ts` — but that changes the product, not the demo.
- **Running is often suggested as a 20-minute easy session**, for the mirror-image
  reason: at 65% of the load its balance deficit is zero, so it gets the residual.

---

## 4. Re-verifying after a change

`npm run seed:demo -- --dry-run` runs the ten conditions through the app's real
modules — `computeProgress`, `computeWeeklyPlan`, `computeRecoveryStatus`,
`getBaselineState`, `detectConflicts`, `detectPlannedConflicts`. The one marked
critical (42+ distinct training days) aborts the seed if it fails, because a
demo that opens on "building your baseline" has lost before anybody scrolls.

If you retune a threshold in the recommender or the conflict engine, run the dry
run again. The story is a fixed point of those modules, not an independent
dataset, and it can be broken from a distance.

---

## 5. Security notes

- The demo password is compiled into the APK and readable by anyone who unpacks
  it. This is the same trade already documented for `GOOGLE_MAPS_API_KEY`, and it
  is acceptable only because the account holds nothing real. **Rotate the
  password after the pitch**, and never point `FORMA_DEMO_EMAIL` at a live
  account.
- The supporting accounts share one password by default. Same reasoning; rotate
  or delete them afterwards.
- The seed script needs no service-account key. Every document it writes belongs
  to a user it has just signed in as, which the existing rules already permit —
  which is also why it cannot grant `isAdmin` (§1.5).

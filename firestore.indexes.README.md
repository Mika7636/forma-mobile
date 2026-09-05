# Firestore indexes for the Admin screen

The Admin screen is the only part of FORMA that queries across **all** users'
sessions. Sessions live at `/users/{uid}/sessions/{id}`, so every one of those
figures is a **collection group** query on `sessions` — and a collection group
query needs its own index even when it filters on a single field. The
per-collection indexes Firestore creates automatically do **not** cover it.

**Until these exist, the first Admin query fails** with
`FAILED_PRECONDITION: The query requires an index`, and the message carries a
one-click console link that creates exactly the right index. `AdminScreen`
detects that specific failure and shows the link rather than a generic "couldn't
load" — so if you would rather not pre-create anything, open the Admin tab, tap
the link in the error, wait for the index to build, and pull to refresh.

## What to create

### 1. Single-field, collection-group scope — `sessions.date`

Backs the per-day `count()` aggregations **and** the bounded twelve-week fetch
behind the charts. The descending entry is the one the charts need: the fetch is
`where('date', '>=', …)` + `orderBy('date', 'desc')` + `limit(…)`, ordered
newest-first so that a database large enough to hit the cap loses its oldest
history rather than its most recent.

Console → **Firestore Database → Indexes → Single field → Add exemption**

| Setting | Value |
| --- | --- |
| Collection ID | `sessions` |
| Field path | `date` |
| Collection scope | Ascending ✔, Descending ✔ |
| Collection group scope | Ascending ✔, **Descending ✔** |

Leave the two collection-scope entries ticked. A single-field exemption
*replaces* the automatic settings for that field, and `sessionService` still
runs `where('date', '>=', …)` inside one user's own `sessions` collection.

> **Collection-group descending is the one addition** the expanded Admin screen
> needs. Everything else below was already required.

### 2. Composite, collection-group scope — `sessions` (`sport`, `date`)

Backs per-sport counting over a window.

Console → **Firestore Database → Indexes → Composite → Create index**

| Setting | Value |
| --- | --- |
| Collection ID | `sessions` |
| Query scope | **Collection group** |
| Field 1 | `sport` — Ascending |
| Field 2 | `date` — Ascending |

### 3. Nothing to create for `users.createdAt`

The "new signups this month" figure is two `count()` aggregations over `/users`
filtered on `createdAt` — one bounded by a Timestamp and one by an ISO string,
because the mobile app writes the latter and the web app the former. Both are
single-field, collection-scoped queries on a top-level collection, which
Firestore's **automatic** single-field indexes already cover. No exemption, no
composite index, nothing to deploy.

### 4. Nothing to create for the conflict grid

The cross-sport conflict frequency grid runs no query of its own. Admins have no
read access to `/users/{uid}/conflicts` — `firestore.rules` grants the
collection-group read on `sessions` alone — so the grid recomputes the engine's
sport-overlap check client-side from the sessions already fetched plus each
athlete's own interaction matrix from their profile document. See the note on
`conflictMatrix` in `src/utils/adminMetrics.ts` for what that changes about the
numbers.

## Or deploy them

`firestore.indexes.json` in this folder holds every index above. With the
Firebase CLI:

```sh
firebase deploy --only firestore:indexes
```

If the project has no `firebase.json` yet, run `firebase init firestore` first
and point it at the existing `firestore.rules` / `firestore.indexes.json`.

Building takes a few minutes on a populated database; queries keep failing until
the index reports **Enabled**.

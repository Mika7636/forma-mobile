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

Backs the per-day and this-week `count()` aggregations.

Console → **Firestore Database → Indexes → Single field → Add exemption**

| Setting | Value |
| --- | --- |
| Collection ID | `sessions` |
| Field path | `date` |
| Collection scope | Ascending ✔, Descending ✔ |
| Collection group scope | Ascending ✔ |

Leave the two collection-scope entries ticked. A single-field exemption
*replaces* the automatic settings for that field, and `sessionService` still
runs `where('date', '>=', …)` inside one user's own `sessions` collection.

### 2. Composite, collection-group scope — `sessions` (`sport`, `date`)

Backs "most popular sport this week", which counts each sport separately rather
than downloading the week's sessions.

Console → **Firestore Database → Indexes → Composite → Create index**

| Setting | Value |
| --- | --- |
| Collection ID | `sessions` |
| Query scope | **Collection group** |
| Field 1 | `sport` — Ascending |
| Field 2 | `date` — Ascending |

## Or deploy them

`firestore.indexes.json` in this folder holds both. With the Firebase CLI:

```sh
firebase deploy --only firestore:indexes
```

If the project has no `firebase.json` yet, run `firebase init firestore` first
and point it at the existing `firestore.rules` / `firestore.indexes.json`.

Building takes a few minutes on a populated database; queries keep failing until
the index reports **Enabled**.

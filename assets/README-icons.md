# FORMA app icon & splash assets

Every PNG in this folder is **generated**, not hand-drawn:

```sh
node scripts/generate-icons.js
```

That script rasterises the FORMA "F" mark from geometry (a tiny signed-distance-field
renderer + zlib, no image dependencies) and writes all six files. Tweak the numbers
at the top of the script — brand colours, stroke weight, cap height — and re-run.

## What each file is for

| File | Size | Used by |
|---|---|---|
| `icon.png` | 1024² | Main app icon (iOS + Android legacy). Opaque, full-bleed — the OS applies its own rounding/mask. |
| `android-icon-foreground.png` | 1024² | Android adaptive icon foreground. Transparent; the mark stays inside the centre 66% safe zone because launchers crop to a circle/squircle. |
| `android-icon-background.png` | 1024² | Android adaptive icon background (the mint wash). |
| `android-icon-monochrome.png` | 1024² | Android 13+ themed icons **and** the `expo-notifications` status-bar glyph. Only its alpha channel is read, so the RGB doesn't matter. |
| `splash-icon.png` | 1024² | The splash screen mark, via the `expo-splash-screen` plugin. Transparent, drawn on white. |
| `favicon.png` | 64² | Web. |

## Replacing the icon with your own artwork

Drop your own PNG over any of the files above — nothing imports the generator at
build time, so a hand-made file survives until someone re-runs the script.

For a clean result:

1. **`icon.png`** — exactly square, 1024×1024, **no transparency and no rounded
   corners**. Fill the whole square; iOS and Android round it themselves, and a
   pre-rounded icon ends up with visible corner artefacts.
2. **`android-icon-foreground.png`** — 1024×1024 with a transparent background.
   Keep all meaningful content within the centre ~676px; anything outside that
   can be cropped away by the launcher's mask.
3. **`splash-icon.png`** — 1024×1024, transparent background. It's scaled to the
   `imageWidth` set in `app.json` (currently **180**), so design it to read at
   roughly that size.

Then rebuild. Icons are baked in at build time, so a JS reload won't show them:

```sh
npx expo prebuild --clean     # regenerate native projects
npx expo run:android          # or eas build
```

## Why you can't see the icon in Expo Go

Expo Go is one installed app running many projects, so the home-screen icon and
the native splash are always **Expo Go's own**, never FORMA's. Verifying the icon
and the native splash needs a development build or a release build. What *does*
show in Expo Go is `src/components/ui/BrandSplash.tsx` — the branded overlay that
holds until auth resolves and then fades out.

## Keeping app.json in sync

If you rename or move any file, update the matching entry in `app.json`:
`expo.icon`, `expo.android.adaptiveIcon.*`, `expo.web.favicon`, the
`expo-splash-screen` plugin's `image`, and the `expo-notifications` plugin's
`icon`. `expo.android.adaptiveIcon.backgroundColor` (`#F2FAF7`) should stay close
to the wash in `android-icon-background.png` — it's the fallback on launchers
that ignore the background image.

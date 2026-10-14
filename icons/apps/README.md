# App icons

Drop one image per app in this folder and it becomes that app's card icon in
the launcher. No code change and no edit to `apps.json` — the next
**Update app list** run picks it up.

## Naming

Name the file after the **repository name**. Case, spaces, dashes and
underscores are ignored, so all of these match the `Audio-Trimmer` repo:

- `Audio-Trimmer.png`
- `audio trimmer.png`
- `audio_trimmer.svg`
- `AudioTrimmer.webp`

Extensions checked, in priority order: `.png`, `.webp`, `.svg`, `.jpg`,
`.jpeg`, `.gif`. If two files match the same app, the one earliest in that
list wins.

## Format

- **512x512 PNG**, square, with a transparent background — that gives headroom
  for the 48x48 card tile on any screen density.
- SVG also works and is sharper and far smaller; `.webp` and `.jpg` are
  accepted but have no transparency.
- Keep each file under ~200 KB — one fetch per card.
- One image per app, so the artwork has to read as a single glyph: large
  shapes, generous padding, no fine detail.

## Rules

- A file here **wins** over any icon the app's own page advertises, so this is
  also how you override a scraped icon.
- Square images look best. The card renders them at 48x48 CSS pixels with
  `object-fit: cover`, and the card grid is designed around 512x512 sources.
  Anything non-square is center-cropped, and the corners are rounded away.
- The file is served from the launcher itself, so it works for apps that have
  no icon of their own.
- Until the launcher is redeployed with your file, the card falls back to its
  coloured letter tile — the image is only referenced, never inlined, and a
  failed load silently keeps the letter tile.

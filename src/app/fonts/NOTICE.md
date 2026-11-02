# Fonts for share images

Static TrueType files read by the share-image renderer (`src/lib/og/share-image.tsx`, next/og).
Satori needs TTF/OTF (no WOFF2), so these are separate from the web fonts in `public/fonts` and the
ones `next/font` downloads.

| File | Family | Source | License |
|---|---|---|---|
| Rubik-Regular.ttf, Rubik-SemiBold.ttf | Rubik 400 / 600 (Latin, Hebrew, Cyrillic, Arabic) | Google Fonts (fonts.gstatic.com, rubik v31) | SIL Open Font License 1.1 |
| NotoSansGeorgian-Regular.ttf, NotoSansGeorgian-SemiBold.ttf | Noto Sans Georgian 400 / 600 (Georgian, ₾) | Google Fonts (notosansgeorgian v49) | SIL Open Font License 1.1 |

Rubik: Copyright 2015 The Rubik Project Authors (https://github.com/googlefonts/rubik).
Noto Sans Georgian: Copyright 2022 The Noto Project Authors (https://github.com/notofonts/georgian).
License text: https://openfontlicense.org (OFL-1.1). The fonts are used unmodified.

The web fonts in `public/fonts/rubik-*-v1.woff2` are the Google Fonts subsets of Rubik (same
license); `src/components/layout/font-files/noto-sans-georgian-latin-ext.woff2` is a subset of
Noto Sans Georgian (same license).

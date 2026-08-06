# brand/

Styling assets for cookbook demo apps, so every example looks like Glean rather than an unrelated third party. Recipes demo Glean against your own content; the chrome should say so.

Recipe UIs don't read these directly — they link the shared stylesheet, which `scripts/build-styles.mjs` copies into each recipe's `public/`. See "Styling a recipe UI" in [CONTRIBUTING.md](../CONTRIBUTING.md).

| File                   | What it's for                                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tokens.json`          | **Generated** by `npm run sync:tokens` — machine-readable mirror of `styles/tokens.css`, for tooling that can't parse CSS. Don't edit.                  |
| `glean-logomark.svg`   | The Glean mark, copied from the dev site's `static/img/glean-logo.svg` so the two never diverge. Distributed to recipes as `public/glean-logomark.svg`. |
| `favicon.svg`          | The same mark reversed out of a Glean Blue tile, sized for favicon use.                                                                                 |
| `og-card-template.svg` | 1200×630 social-preview card template for demo apps; swap the `{{TITLE}}` / `{{SUBTITLE}}` placeholders.                                                |

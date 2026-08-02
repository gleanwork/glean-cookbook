# brand/

Styling assets for cookbook demo apps, so every example looks like Glean rather than an unrelated third party. Recipes demo Glean against your own content; the chrome should say so.

| File                   | What it's for                                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| `tokens.json`          | Color and font tokens, reused verbatim from the dev site's `--gdt-*` CSS custom properties.              |
| `glean-logomark.svg`   | The Glean mark, copied from the dev site's `static/img/glean-logo.svg` so the two never diverge.         |
| `favicon.svg`          | The same mark reversed out of a Glean Blue tile, sized for favicon use.                                  |
| `og-card-template.svg` | 1200×630 social-preview card template for demo apps; swap the `{{TITLE}}` / `{{SUBTITLE}}` placeholders. |

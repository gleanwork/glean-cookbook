# brand/

The Acme Corp brand kit — shared by every recipe, mock, and screenshot so all examples feel like one familiar company. Built for **PACT-437**.

| File                                       | What it's for                                                                                                                                   |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `FICTION.md`                               | The canon: company, departments, cast, accounts, canonical demo-query pool. **Every recipe's names and queries come from here — nowhere else.** |
| `tokens.json`                              | Color and font tokens, reused verbatim from the dev site's `--gdt-*` CSS custom properties.                                                     |
| `logomark-light.svg` / `logomark-dark.svg` | The Acme mark — a formalized version of the indigo rounded-square already shipped in the dev site's Web SDK mocks (`PortalPage`'s nav logo).    |
| `favicon.svg`                              | Same mark, sized for favicon use.                                                                                                               |
| `og-card-template.svg`                     | 1200×630 social-preview card template for demo apps; swap the `{{TITLE}}` / `{{SUBTITLE}}` placeholders.                                        |
| `fable-preamble.md`                        | Copy-paste paragraph to open any Fable prompt with, so UI prototypes land in the Acme design language and roster automatically.                 |

**Sign-off:** Julie Mills approves the cast/brand before any of this appears in a Go stage demo (master spec §7.3) — treat `FICTION.md` as a draft until then.

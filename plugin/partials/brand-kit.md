For scaffolded recipes, link `/glean-cookbook.css` and compose its existing primitives: `.layout`,
`.card`, `.frame`, `.pill`, `.note`, `.empty`, `.hit`, `.citations`, `.step`, `.chat-row`, `.msg`,
`.kpi`, and `.sdk-embed`. Use the supplied design tokens for recipe-specific CSS.

Use `public/glean-logomark.svg`; do not recreate the mark. For a build without scaffolded assets,
copy the tokens and mark from `https://github.com/gleanwork/glean-cookbook/tree/main/brand`.

Style only the surrounding page for Web SDK components. The embedded Glean UI supplies its own
branding. If the user wants their company's identity, replace the logo and accent consistently.

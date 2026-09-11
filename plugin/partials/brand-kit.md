For scaffolded recipes, link `/glean-cookbook.css` and compose its existing primitives: `.layout`,
`.card`, `.hero`, `.eyebrow`, `.assistant-shell`, `.assistant-header`, `.assistant-thread`,
`.assistant-composer`, `.pill`, `.note`, `.empty`, `.hit`, `.citations`, `.step`, `.msg`, `.kpi`,
and `.sdk-embed`. Use the supplied design tokens for recipe-specific CSS.

Use the asset paths supplied by the recipe; do not recreate the mark. If integrating into an
existing app, keep its design system rather than adding another global stylesheet. For a build
without scaffolded assets, follow the recipe's explicit asset setup and host conventions; do
not assume paths from a different scaffold.

Style only the surrounding page for Web SDK components. The embedded Glean UI supplies its own
branding. If the user wants their company's identity, replace the logo and accent consistently.

Keep the main interaction above the fold on desktop. Use an internal scroll region instead of
making the composer disappear below a long answer, and put the assistant before supporting panels
on mobile. Avoid debug-console layouts, oversized empty cards, and a separate answer box below the
form.

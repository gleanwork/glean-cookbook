This plugin ships the `glean-developer-docs` MCP server (`docs_search`, `docs_fetch`) —
`developers.glean.com`'s own documentation, always current, including deprecation banners for any
field the OpenAPI spec marks `deprecated`. A recipe's `aiPrompt`/`llmContext` is a **dated cache**
of what a docs lookup returned at authoring time, not an independent source of truth — API
response shapes and field names drift, and this cookbook has already shipped a bug from exactly
that (a `citations[]` field that read as populated in hand-written prose but was actually
deprecated and empty at runtime).

Before writing or trusting **any** description of a Glean API response shape — not just when
something "seems" to disagree with what you already have, since a first-time read has nothing yet
to disagree with — run `docs_search`/`docs_fetch` for that endpoint and confirm the current shape,
including whether any field involved carries a deprecation notice. Recipe instructions exist to
describe _what_ to build and call out gotchas that aren't obvious from the docs (footguns in
bundled SDK examples, exact naming that's easy to get wrong); they are not a substitute for
checking the docs on anything shape-related.

# Glean Cookbook

Runnable, copy-paste-able examples of building on the [Glean platform](https://developers.glean.com) — the Indexing API, Platform API, Web SDK, Connector SDK, MCP, and Agents. This repo is the code companion to the **Cookbooks** section of [developers.glean.com](https://developers.glean.com): every recipe published there has its full, tested source here.

> **Status:** private, pre-launch. This repo goes public alongside the Cookbooks section launch at Glean Go (targeting Aug 26–27, 2026). Until then, treat it as internal-only — do not link to it from public docs or share the URL externally.

## Build a recipe

This repo is an installable plugin marketplace, so you can build any recipe against your own Glean
instance without copying code by hand. In Claude Code:

```
/plugin marketplace add gleanwork/glean-cookbook
/plugin install cookbook
```

Cursor and Codex read their own manifests from the same repo (`.cursor-plugin/`, `.agents/plugins/`)
— install per that host's usual flow.

Then run a recipe, or browse them first:

```
/cookbook:incident-copilot     # build a specific recipe
/cookbook:browse-cookbook      # list what's available and pick one
```

Each recipe asks for whatever it needs (instance, credentials, language) as it goes.

## Recipes

<!-- pluginpack-generated:recipes:start -->

| Recipe                                                            | Level        | Time              | Build it                                |
| ----------------------------------------------------------------- | ------------ | ----------------- | --------------------------------------- |
| **Call a Glean agent from an A2A client**                         | Intermediate | ~45 min           | `/cookbook:a2a-client`                  |
| **Build an engineering portal**                                   | Intermediate | ~30 min           | `/cookbook:build-engineering-portal`    |
| **Company Answers: a cited Q&A page on your own content**         | Beginner     | ~30 min           | `/cookbook:company-answers`             |
| **Connect Glean MCP to your AI tools**                            | Beginner     | ~15 min           | `/cookbook:connect-mcp-hosts`           |
| **Customer 360: an account page built from your own content**     | Intermediate | ~1 hr             | `/cookbook:customer-360`                |
| **Embed search & chat in an internal app**                        | Beginner     | ~15 min (minimal) | `/cookbook:embed-search-chat`           |
| **On-call copilot with a real approval gate**                     | Advanced     | ~1.5 hr           | `/cookbook:incident-copilot`            |
| **Multi-step agent with governed tools**                          | Advanced     | ~2 hr             | `/cookbook:multi-step-agent`            |
| **IT helpdesk deflection page — no code, on Lovable**             | Beginner     | ~45 min           | `/cookbook:no-code-it-helpdesk-lovable` |
| **PTO & benefits lookup — no code, on Replit**                    | Beginner     | ~45 min           | `/cookbook:no-code-pto-lookup-replit`   |
| **Onboarding Hub: a day-one checklist grounded in your own docs** | Intermediate | ~45 min           | `/cookbook:onboarding-hub`              |
| **Ground your own LLM app in Glean**                              | Intermediate | ~1 hr             | `/cookbook:permissions-aware-retrieval` |
| **Answer an RFP or security questionnaire**                       | Intermediate | ~45 min           | `/cookbook:rfp-responder`               |

<!-- pluginpack-generated:recipes:end -->

Full write-ups for each live at
[developers.glean.com/cookbook/{recipe-id}](https://developers.glean.com/cookbook).

## Read the code instead

Every recipe is a self-contained, runnable directory under `recipes/{id}/` with its own README —
clone one into a fresh project and it works. All recipes read `GLEAN_INSTANCE` and `GLEAN_API_TOKEN`
(or a recipe-specific scoped token) from the environment; none contain hardcoded credentials.

```
recipes/{id}/   one directory per recipe, self-contained and runnable
registry.json   generated manifest — one entry per recipe
plugin/         source for the cookbook plugin
build/          the plugin's emitted content, per host
brand/          Glean styling assets shared by the recipe demos
schemas/        recipe.schema.json, generated from developers.glean.com
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for adding a recipe, the registry, verification, and CI.

## Related

- [developers.glean.com/cookbook](https://developers.glean.com/cookbook) — the published recipes (behind a feature flag pre-launch)
- [glean-developer-site](https://github.com/gleanwork/glean-developer-site) — the dev site repo; owns the recipe schema and MDX pages
- Linear project: **Glean Cookbook (GO)** (team PACT) — tracks every recipe, the brand kit, the corpus, and the `glean-cookbook` plugin

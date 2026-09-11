# Glean Cookbook

Examples and guides for building on the [Glean platform](https://developers.glean.com) — the Indexing API, Platform API, Web SDK, Connector SDK, MCP, and Agents. This repo is the code companion to the **Cookbooks** section of [developers.glean.com](https://developers.glean.com). Each recipe includes a runnable scaffold, integration instructions, or a build prompt appropriate to the surface it teaches.

> **Status:** public repository. Individual recipes may be public, unlisted previews, or hidden development work. Visibility alone does not establish that a recipe has been verified.

## Build a recipe

This repo is an installable plugin marketplace, so an AI coding host can guide each recipe against
your own Glean instance. Some recipes scaffold a complete project; integration, no-code, and
admin-console recipes stop for the required user action. In Claude Code:

```
/plugin marketplace add gleanwork/glean-cookbook
/plugin install cookbook
```

Cursor and Codex read their own manifests from the same repo (`.cursor-plugin/`, `.agents/plugins/`)
— install per that host's usual flow.

Then run a recipe, or browse them first:

```
/cookbook:oncall-copilot     # build a specific recipe
/cookbook:browse-cookbook      # list what's available and pick one
```

Fixture-backed presentation demos are opt-in. Launch the coding host with
`GLEAN_COOKBOOK_DEMO=true` before invoking a supported recipe; otherwise the
plugin does not mention or offer the demo path. Demo runs use bundled sample
data and still hand back the running app as a clickable local URL.

Each recipe checks its prerequisites and asks for the configuration it needs as it goes. Web SDK
recipes leave the local server running and ask you to open its URL in your normal, signed-in browser;
the coding agent must not substitute its isolated browser for your Glean SSO session.

## Recipes

<!-- pluginpack-generated:recipes:start -->

| Recipe                                                            | Level        | Time    | Build it                                   |
| ----------------------------------------------------------------- | ------------ | ------- | ------------------------------------------ |
| **Customer 360: an account page built from your own content**     | Intermediate | ~1 hr   | `/cookbook:customer-360`                   |
| **Import a skill from GitHub**                                    | Intermediate | ~20 min | `/cookbook:import-skill-from-github`       |
| **Build an IT helpdesk page in Lovable**                          | Beginner     | ~45 min | `/cookbook:no-code-it-helpdesk-lovable`    |
| **Build a PTO lookup page in Replit**                             | Beginner     | ~45 min | `/cookbook:no-code-pto-lookup-replit`      |
| **Onboarding Hub: a day-one checklist grounded in your own docs** | Intermediate | ~45 min | `/cookbook:onboarding-hub`                 |
| **On-call Copilot**                                               | Advanced     | ~1.5 hr | `/cookbook:oncall-copilot`                 |
| **Answer an RFP or security questionnaire**                       | Intermediate | ~45 min | `/cookbook:rfp-responder`                  |
| **Search Glean with discovered filters**                          | Beginner     | ~15 min | `/cookbook:search-with-discovered-filters` |
| **Publish a versioned skill bundle**                              | Intermediate | ~20 min | `/cookbook:skill-publishing-pipeline`      |
| **Stream a cited Chat response**                                  | Beginner     | ~20 min | `/cookbook:streaming-chat-with-citations`  |
| **Validate and publish a skill**                                  | Beginner     | ~15 min | `/cookbook:validate-and-publish-skill`     |

<!-- pluginpack-generated:recipes:end -->

Full write-ups for each live at
[developers.glean.com/cookbook/{recipe-id}](https://developers.glean.com/cookbook).

## Read the code instead

Every recipe has a directory under `recipes/{id}/` with its own README. Scaffold recipes are
self-contained and runnable when their documented prerequisites are met. Integration recipes provide
snippets for an existing app; third-party recipes provide a prompt for their hosted builder. Recipes
that need credentials use their documented auth library, environment variables, or host secret store. Web SDK
SSO paths use the signed-in user's browser session and require no API token.

```
recipes/{id}/   one directory per recipe, self-contained and runnable
registry.json   generated manifest — one entry per recipe
plugin/         source for the cookbook plugin
build/          the plugin's emitted content, per host
brand/          Glean styling assets shared by the recipe demos
schemas/        canonical recipe.schema.json consumed by every downstream adapter
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for adding a recipe, the registry, verification, and CI.

## Related

- [developers.glean.com/cookbook](https://developers.glean.com/cookbook) — the published recipes
- [glean-developer-site](https://github.com/gleanwork/glean-developer-site) — consumes this repo's canonical schema and registry to generate the developer-site pages
- Linear project: **Glean Cookbook (GO)** (team PACT) — tracks every recipe, the brand kit, the corpus, and the `glean-cookbook` plugin

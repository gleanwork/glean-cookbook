# Import skills from an agent plugin

Publish every skill in a Claude Code, Codex, or Agent Skills plugin to Glean
from a small web app on your computer. Start it with one command, sign in to
Glean in the browser, drop in the plugin, review what it found, and click
**Import**. A private plugin repository stays private: the app reads it on your
computer, and Glean never needs access to it.

## Prerequisites

- Node.js 22.12.0 or newer, and a browser on the same computer
- A Glean instance with Skills enabled
- Your Glean backend URL, usually `https://your-company-be.glean.com`
- Permission to create skills, using the `SKILLS` OAuth scope or the `SKILLS`
  permission on a user-scoped token
- A local copy of the plugin: a cloned repository, a plugin folder, or a zip of
  either

## Set up

```bash
npx -y tiged@2.12.8 gleanwork/glean-cookbook/recipes/import-plugin-skills import-plugin-skills
cd import-plugin-skills
npm install
npm test
```

The tests need no credentials or network access. They cover discovery for each
layout, zip handling, the app's session checks, and the Skills API workflow
through the real SDK with MSW HTTP handlers. Passing them does not verify access
to your Glean instance.

## Start the importer

```bash
npm start -- --backend "https://your-company-be.glean.com"
```

The app opens in your browser. The terminal also prints an **Open the importer**
link that includes this run's session key; use it if no browser opens. Leave the
terminal running while you use the app. If you do not know your backend URL,
pass `--email you@your-company.com` instead of `--backend` to discover it.

### 1. Sign in

Click **Sign in with Glean**. The app runs the `glean-auth` CLI from the pinned
`@gleanwork/auth` package, the same command as `npm run login`. It registers
the app with your Glean instance through dynamic client registration and opens
Glean's approval page in a new tab. Approve access and return to the importer;
the header changes to **Signed in**. Refreshable credentials are stored on this
computer, outside the project.

If your instance does not allow dynamic client registration, ask your Glean
admin for an OAuth client ID and export `GLEAN_OAUTH_CLIENT_ID` before
`npm start`.

If the app cannot open a browser for you, for example on a remote machine, sign
in from a second terminal and then reload the importer:

```bash
cd import-plugin-skills && npm run login -- --server-url "https://your-company-be.glean.com"
```

To skip OAuth, stop the app, copy `.env.example` to `.env`, set a user-scoped
`GLEAN_API_TOKEN` with the `SKILLS` permission, and start it again. Never paste
a token into a prompt, issue, or committed file.

### 2. Run a test import (recommended)

Click **Run a test import**. The app publishes two generated skills, downloads
each one, compares its files with the upload, and permanently deletes both.
Success reads:

```text
Test import passed: published 2 generated skills, the downloaded files match, and both test skills were deleted.
```

If a delete fails, the page lists the remaining IDs and offers **Retry
cleanup**, which deletes only those IDs.

### 3. Choose your plugin

Clone the plugin repository with your own Git credentials, or download it as a
zip. Then either drop the zip on the page, or enter the folder path and click
**Preview folder**. Use the repository root for a marketplace, or one plugin
folder.

The app validates every skill with Glean without saving anything and shows the
plan:

| Mark        | Meaning                                                        |
| ----------- | -------------------------------------------------------------- |
| `create`    | No skill with this name exists. A new skill is created.        |
| `update`    | The name exists. If you own it, the upload adds a new version. |
| `unchanged` | The latest published files already match. Not uploaded.        |
| `invalid`   | Glean rejected the bundle. The reason is shown.                |

Notes above the table list what the app does not import, such as plugin
commands, agents, hooks, MCP servers, or plugins hosted in another repository.

### 4. Import

Untick any skill you do not want, then click **Import**. Each selected skill is
published once, as you, and the results show created, new version, or failed
for each. Import again after the plugin changes: skills whose files already
match are skipped, and changed skills get a new version.

## What it finds

- **Plugin marketplaces** at `.claude-plugin/marketplace.json` (Claude Code,
  also read by Codex), `.agents/plugins/marketplace.json` (Codex), and
  `.cursor-plugin/marketplace.json` (Cursor). It follows each plugin entry with a
  local source, including `metadata.pluginRoot` and entries whose `skills` list
  points inside the marketplace root.
- **Plugins** with `plugin.json`, `.claude-plugin/plugin.json`,
  `.codex-plugin/plugin.json`, or `.cursor-plugin/plugin.json`. It scans each
  plugin's `skills/` folder and any `skills` paths its manifests declare. A
  plugin with only a root `SKILL.md` is one skill.
- **Skills folders** without a manifest: `skills/`, `.agents/skills/`,
  `.claude/skills/`, and `.cursor/skills/`, up to three levels deep. If none
  holds a skill, it searches the whole tree for `SKILL.md`.

Each skill folder is uploaded as one ZIP bundle with all of its files. Identical
copies, such as per-harness builds of one plugin, are uploaded once.

## Ownership, safety, and limits

- Skills are created under the signed-in account. If someone else owns a skill
  with the same name, you get your own skill with that name. The plan shows
  existing owners before you publish.
- Glean has no plugin namespace. When two plugins have different skills with the
  same name, both start unselected and only one can be imported. Rename one in
  the plugin to import both.
- A skill imported from GitHub is managed by that source. Uploading over your
  own GitHub-imported skill returns HTTP 409; sync it in Glean instead.
- Create runs once per skill with automatic retries off, because a timed-out
  request may still have saved the skill. Check the reported failures, then
  import again.
- Removing a skill from the plugin does not delete it from Glean.
- The app listens only on `127.0.0.1`, answers only to its own host name, and
  requires the session key from the link it prints. Do not expose its port.
- The app reads the plugin in memory. It rejects zip entries that escape the
  archive, skips symbolic links, and never runs plugin scripts, hooks, or MCP
  servers.

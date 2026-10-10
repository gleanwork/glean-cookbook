# Import skills from an agent plugin

Publish every skill in a Claude Code, Codex, or Agent Skills plugin to Glean.
The CLI runs on your machine: it reads the plugin from a local folder or zip,
finds its skills the way the agent harnesses do, and creates each one through
the Skills API under your account. A private plugin repository stays private;
Glean never needs access to it.

## What it imports

The importer understands the layouts that agent harnesses and `npx skills`
share:

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
copies, such as per-harness builds of one plugin, are uploaded once. Plugin
commands, agents, hooks, and MCP servers are listed but not imported, because
the Skills API stores skills only. A marketplace entry that points to GitHub,
a Git URL, or npm is reported so you can clone it and import that folder.

## Prerequisites

- Node.js 22.12.0 or newer
- A Glean instance with Skills enabled
- Your work email, or the complete Glean backend HTTPS origin
- Permission to create skills, using the `SKILLS` OAuth scope or the `SKILLS`
  permission on a user-scoped token
- A local copy of the plugin: a cloned repository, a plugin folder, or a zip of
  either

## Copy and test the project

```bash
npx -y tiged@2.12.8 gleanwork/glean-cookbook/recipes/import-plugin-skills import-plugin-skills
cd import-plugin-skills
npm install
npm test
```

The tests need no credentials or network access. They cover discovery for each
layout, zip handling, and the Skills API workflow through the real SDK with MSW
HTTP handlers. Passing them does not verify access to your Glean instance.

## Choose one authentication path

### OAuth with dynamic client registration

`@gleanwork/auth` discovers your instance from your email, registers an OAuth
client dynamically, and stores refreshable credentials outside this project.

```bash
npm run login -- --email "<work-email>"
```

Approve access in the browser window it opens, and wait for the terminal to
print `Signed in`. If email discovery finds the wrong instance, replace
`--email` with `--server-url "https://your-backend-origin"` on login and on
every later command.

If your instance does not allow dynamic client registration, ask your Glean
admin for an OAuth client ID and export `GLEAN_OAUTH_CLIENT_ID` in your shell
before running `npm run login`.

### User-scoped token

Skip OAuth login and copy the environment template:

```bash
cp .env.example .env
```

Set `GLEAN_SERVER_URL` and a user-scoped `GLEAN_API_TOKEN` with the `SKILLS`
permission in the ignored `.env` file, and omit `--email` from the commands
below. Never paste a token into a prompt, issue, or committed file.

## Verify access

```bash
npm run verify -- --email "<work-email>"
```

This generates a small Claude Code marketplace with two uniquely named skills,
publishes it, downloads each skill and compares its files with the upload, and
then permanently deletes both skills. Success ends with:

```text
Verified plugin import: published 2 skills from a generated Claude Code marketplace, downloaded files match, cleanup completed.
```

If cleanup fails, the command exits with an error and prints a cleanup command
for each remaining ID.

## Import your plugin

Clone the plugin repository with your own Git credentials, or download it as a
zip. Use the absolute path to the repository root (for a marketplace) or to one
plugin folder.

Preview first. This validates every skill without saving it and publishes
nothing:

```bash
npm start -- "/path/to/plugin" --email "<work-email>" --dry-run
```

The plan marks each skill:

| Mark        | Meaning                                                        |
| ----------- | -------------------------------------------------------------- |
| `create`    | No skill with this name exists. A new skill is created.        |
| `update`    | The name exists. If you own it, the upload adds a new version. |
| `unchanged` | The latest published files already match. Not uploaded.        |
| `invalid`   | Glean rejected the bundle. The reason is shown.                |
| `conflict`  | Two different skills share this name. Neither is uploaded.     |

Then publish:

```bash
npm start -- "/path/to/plugin" --email "<work-email>" --yes
```

Without `--yes`, the command asks for confirmation. It ends with a summary such
as `Published 12 skills from /path/to/plugin: 10 created, 2 new versions, 0
unchanged.` and exits non-zero if any skill was not published. Run the same
command after the plugin changes to publish new versions of the skills that
changed.

To narrow an import, repeat `--plugin <name>` for marketplace plugins or
`--skill <name>` for skill names.

## Ownership and limits

- Skills are created under the signed-in account. If you already own a skill
  with the same name, the upload adds a version to it. If someone else owns that
  name, you get your own skill with the same name. The plan shows existing
  owners before you publish.
- Glean has no plugin namespace. Two plugins with different skills of the same
  name conflict; import them separately with `--plugin`, or rename one.
- A skill that was imported from GitHub is managed by that source. Uploading over
  your own GitHub-imported skill returns HTTP 409; sync it in Glean instead.
- Create runs once per skill with automatic retries off, because a timed-out
  request may still have saved the skill. Check the reported failures, then run
  the import again.
- Removing a skill from the plugin does not delete it from Glean.
- The importer reads the plugin in memory. It rejects zip entries that escape
  the archive, skips symbolic links, and never runs plugin scripts, hooks, or
  MCP servers.

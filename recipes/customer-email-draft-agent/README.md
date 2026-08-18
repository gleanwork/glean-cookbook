# Customer email draft agent

Build and publish this agent from Claude Code or Cursor using Glean's headless agent builder. It
watches Gmail threads from one customer domain, drafts a reply when the message needs one, and DMs
the owner in Slack. It never sends the email.

The full walkthrough is at
[developers.glean.com/cookbook/customer-email-draft-agent](https://developers.glean.com/cookbook/customer-email-draft-agent),
or run `/cookbook:customer-email-draft-agent`. What follows is only the part that is easy to get
wrong and hard to discover from the steps.

The recipe ships no agent files. Generating `spec.yaml` and `instructions.md` from a description is
the entire point of the headless builder, and trigger templates, action-provider ids, tool names and
Slack identity are tenant-specific in any case.

## Installing the plugin

```bash
claude plugin marketplace add gleanwork/glean-plugins-vnext
claude plugin install glean-vnext@glean-plugins-vnext --scope user
```

The CLI form is what works unattended — only a person can type a slash command. In Cursor, open
**Customize** in the sidebar, find **Glean vNext**, and select **Install** at user scope. A team
admin can instead add the marketplace under **Dashboard → Plugins → Add Marketplace → Import from
Repo**.

Then reload with `/reload-plugins`, or restart the host: a plugin loads at session start, so a reload
alone may not be enough. Installs are scoped, and a copy installed against a different project leaves
`/glean_run` unresolvable here. Success check: `/glean_run` resolves.

## Authenticating

Call the plugin's `setup` tool with no arguments and let it advance one stage at a time:

| It reports                  | You pass                                                                                       |
| --------------------------- | ---------------------------------------------------------------------------------------------- |
| `[SETUP_REQUIRED]`          | `server_url` — the **Server instance (QE)** URL from `https://app.glean.com/admin/about-glean` |
| `[AUTHENTICATION_REQUIRED]` | `callback_url` — the URL copied from the Glean sign-in success page                            |
| a bare connection failure   | `reset: true`, then reconfigure — a stale URL is cached                                        |

`setup` never asks for an API token, and never asks for your work email.

## Name the directory in every request

Say `.glean/agents`, or whichever parent you want. The builder's build, run and save modes each
resolve an unnamed path to your current working directory, so an agent written to `.glean/agents/` is
one the later modes will not find from the repo root. `.glean/agents/` is worth using anyway: it is
the layout the Git ADLC sync action expects, so the agent can later ship through pull requests.

Preview against a real thread before publishing — a content-trigger preview takes the thread URL as
its reserved `content` input. When something is wrong, hand it back to `agent_builder` and rebuild;
an edit you make by hand is an edit the next rebuild discards.

## Read the spec again after saving

Saving normalizes the spec and can drop tool entries silently — a `toolProviderId: native` entry is
deduplicated away when `gleanSearchConfig` already grants the same capability — so the spec you
approved is not necessarily the spec that runs. Check against what the platform actually stored: the
trigger names your address and your domain, the email tooling is a draft tool and not a send tool,
and `skipConfirmation` appears on the draft and the DM and nowhere else.

If more than one agent watches the same domain, every matching email fires all of them. Before
activating, confirm no older agent is still subscribed.

Publishing does not activate the subscription. On the returned agent page, allow the connected-app
actions, select **Activate agent**, and confirm `ACTIVE`.

## Trying the edge cases without waiting for mail

The builder's run mode takes any thread URL, so an already-handled thread, an automated message and
one with instructions in the body can all be exercised against threads already in your mailbox
before you trust the live trigger.

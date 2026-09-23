# Create the approval-gated agent

Use the [Headless Agent Builder](https://docs.glean.com/agents/create-agents/create-agent-via-headless-builder)
in Claude Code, Codex, or Cursor. It supports **Auto mode**, not Workflow mode.
Install the Glean plugin and complete its browser sign-in using that guide. This
sign-in is separate from the CLI's `agents.run` credential.

Choose an existing, dedicated Slack test channel that you may post to. Ask an
admin to enable the [Slack tools](https://docs.glean.com/tools/connector/slack).
For a private channel, add the Glean app to the channel. Resolve any required
tool authentication in Glean before starting an API run.

## Build without running

Replace `TEST_CHANNEL_ID` in the prompt below with the real channel ID. In the
coding assistant's chat, invoke `/glean_run` (Claude Code or Cursor) or
`$glean_run` (Codex) with this prompt. This is a **chat command**, not a shell
command. Do not substitute an MCP tool call for the headless builder.

```text
Create an Auto mode Glean agent named "Cookbook approval demo" with a
CHAT_MESSAGE trigger. Discover the enabled native Slack tool for sending a
message to a channel. Select only that write tool, not a whole tool bundle.
Do not substitute another provider or messaging identity if it is unavailable.

Keep human confirmation enabled: set the Slack provider's
customisationData.skipConfirmation to false. Do not add skills, subagents,
schedules, content triggers, or search tools. Use the tenant's supported model.

Use these instructions:
"Post the user's supplied text once to Slack channel TEST_CHANNEL_ID, with no
rewriting, extra recipients, or extra messages. Do not post to any other
channel. Request exactly one Slack tool invocation and let the platform pause
for tool approval. Do not ask for approval in ordinary chat text. If the tool
is rejected, acknowledge the rejection and stop without another tool call.
If it succeeds, report completion and stop. If it fails, report the failure
without retrying or switching tools. Do not claim a post succeeded without a
successful tool result."

Create the local agent files and show me the selected tool and confirmation
configuration. Do not run, publish, or share the agent yet.
```

## Check, then publish

Inspect `.glean/agents/.../spec.yaml` and `instructions.md` before publishing:

- The trigger is `CHAT_MESSAGE`, without a schedule.
- There is one selected Slack write tool. There are no skills or subagents.
- The selected provider has `customisationData.skipConfirmation: false`.
  Do **not** enable **Run without user confirmation** in the web builder.
- The instructions name your test channel and stop after success or rejection.
- The tool uses the messaging identity you intend. Stop if the tool, identity,
  or confirmation setting is unavailable; do not replace it with a prompt-only
  approval or a no-confirmation tool.

The [agent specification](https://developers.glean.com/guides/agents/specification)
describes `selectedTools` and provider-level `skipConfirmation`. Provider IDs
and tool names come from your instance; do not copy invented IDs into the spec.
The channel instruction is not a channel access-control boundary. The human
must check the **persisted destination and message arguments** before approval.
Use narrowly scoped tool access where your administrator supports it.

Then ask the headless builder to publish this agent, with access limited to you,
without running it or enabling Slack publishing. Copy its ID from `spec.yaml`
or the generated agent URL into `GLEAN_AGENT_ID` in `.env`. Do not change the
ID in the agent spec. The API walkthrough in the README is the first test run.

A prompt that asks the user "may I post?" does not demonstrate this feature.
Success requires API state `REQUIRES_INPUT` with a persisted `TOOL_APPROVAL` and
no Slack post before an explicit decision.

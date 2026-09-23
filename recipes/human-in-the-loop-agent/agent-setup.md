# Create the approval-gated agent

Use [Agent Builder in the Glean web app](https://docs.glean.com/agents/auto-mode-agent)
with **Auto mode**. Sign in through your browser with permission to create and
save agents. You do not need a coding-assistant plugin or local agent files.
The CLI has a separate sign-in step in the README.

Choose an existing, dedicated Slack test channel that you may post to. Ask an
admin to enable the native Slack Actions channel-lookup and send-message tools.
For a private channel, add the Glean app to the channel. Resolve any required
tool authentication in Glean before starting an API run.

The agent needs **two tools: one read-only lookup and one approval-gated write**.
The send-message tool accepts a Glean Slack channel document ID, not a channel
name or raw Slack ID such as `C0123456789`. The lookup returns the document ID;
do not construct it yourself.

## 1. Create a draft

In Glean, open the **Agent library** and click **Create agent**. Keep **Auto mode**
selected. In the **Builder Assistant** panel, enter:

```text
Create an Auto mode agent named "Cookbook approval demo". It runs manually
from a chat message and sends the user's supplied text once to my Slack test
channel. Select two native Slack Actions tools: "Search Slack Channel Doc Ids"
for read-only channel lookup and "Send Slack message to a channel" for the write.
Keep human confirmation enabled for the send-message tool. Do not add other
selected tools, skills, subagents, resources, schedules, or content triggers.
Do not run, test, or share the agent. I will set the channel and review the
configuration before saving.
```

Review the generated draft in the configuration tabs. Do not use **Preview** or
ask Builder Assistant to test the agent. The API walkthrough will be its first run.

## 2. Configure both tools and the trigger

1. Open **Tools → Slack Actions** and select both:
   - **Search Slack Channel Doc Ids** (`search_slack_channel_doc_ids`), the
     read-only lookup that returns `channelDocId`, `canSendMessage`, and any
     `additionalDetails`.
   - **Send Slack message to a channel** (`send_slack_message_to_a_channel`),
     the one write tool that sends the approved message.
2. Confirm both tools appear in the selected tools list. Mentioning a tool in
   Instructions does not enable it. General Glean Search is not the channel
   validator. Remove other selected tools, skills, and subagents; do not grant
   access to the entire Slack app. If either tool is unavailable, stop and ask
   your admin to enable it.
3. Open the send-message tool's configuration. Leave **Run without confirmation**
   (also called **Run without user confirmation**) unchecked. This keeps
   `skipConfirmation: false`. Do not enable automatic confirmation for the write.
4. Check the send-message tool's messaging identity. If the required identity or
   confirmation setting is unavailable, stop. Do not substitute another provider
   or use a prompt asking for approval as a replacement for the platform control.
5. In **Triggers**, choose **Manual run** with **Chat message** input. Do not use
   an input form, a schedule, or a content trigger. This CLI sends a chat message.
6. Leave **Resources** empty. This agent does not need company search or documents.

The [confirmation settings guide](https://docs.glean.com/administration/tools/managing-tools/run-without-user-confirmation)
explains the two controls: an admin can make a tool eligible to skip confirmation,
but the agent must also opt in. Keep the agent's option unchecked even if the
admin permits execution without confirmation.

## 3. Set the agent instructions

Open **Instructions** and replace the generated instructions with the text below.
Replace `#TEST_CHANNEL_NAME` with your test channel's name, including the `#`.
Paste only the text inside the code block, without the triple backticks.

```text
Send the user's supplied text once to #TEST_CHANNEL_NAME.

First use Search Slack Channel Doc Ids to resolve and validate the channel.
Stop if the result is missing, ambiguous, or canSendMessage is not true.
Report the lookup error or additionalDetails when available. Never invent
or construct a channel document ID. Do not substitute general Glean Search.

Use the returned channelDocId for exactly one Send Slack message to a channel
invocation. Preserve the supplied text. Do not add recipients or send to
another channel.

Let the platform pause for approval before the write. Do not ask for approval
in ordinary chat text. If rejected, acknowledge the rejection and stop without
another write attempt. If the write fails, report the failure without retrying
or switching tools. After a successful tool result, report completion and stop.
Do not claim success without that result.
```

The channel instruction is not a channel access-control boundary. The human
must check the **persisted destination and message arguments** before approval.
Use narrowly scoped tool access where your administrator supports it.

## 4. Save and copy the agent ID

Review both selected tools, the instructions, the unchecked **Run without
confirmation** option for the write, and the manual chat trigger. Check the
sharing settings and keep access limited to you. Do not publish the agent to
Slack or enable background triggers.

Click **Save** to publish the reviewed configuration **before starting the CLI**.
Draft autosave alone does not publish your changes. The CLI uses the published
agent, not the draft shown in the builder. After changing Tools, Instructions,
or Triggers, click **Save** again before starting a new run.

Copy the agent ID from the saved agent's URL, not the whole URL. In an Agent
Builder URL, the ID follows `/admin/agents/`. Set `GLEAN_AGENT_ID` in `.env`
after the CLI login step in the README.

The first API run should resolve the channel, then reach `REQUIRES_INPUT` with
one persisted `TOOL_APPROVAL` for the write and no Slack post before a decision.
If it completes or posts before approval, stop and inspect the run. A lookup
failure should stop without a send attempt. A prompt asking "may I post?" does
not demonstrate the platform approval boundary.

## Troubleshoot setup

- **Invalid Slack channel document ID:** check that the send-message call uses
  `channelDocId` returned by the lookup, not a raw Slack ID or channel name.
- **Could not validate the channel:** in **Debug**, inspect the actual channel
  lookup call and its result. If no call appears or the tool is unavailable,
  check that both Slack Actions tools are selected and click **Save**. Do not
  substitute general Glean Search or bypass validation.
- **The lookup returns no match or `canSendMessage: false`:** review
  `additionalDetails`, confirm the intended channel and workspace, and resolve
  any access or bot-membership issue before another run. Do not guess a document ID.
- **The CLI uses an old agent configuration or an input form:** save the manual
  Chat message configuration and check `GLEAN_AGENT_ID` against the saved agent.

After correcting the configuration, save it and start a new run with a unique
message marker. Do not replay an old approval to try to change its stored arguments.

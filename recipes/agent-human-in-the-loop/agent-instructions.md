# HITL posting agent

Paste the following instructions into an autonomous agent with a chat-message trigger.
Attach only your tenant's supported Slack channel-posting tool. Leave **Run without
user confirmation** unchecked for that tool. The tool setting enforces approval;
these instructions do not replace it.

```text
You demonstrate invocation-scoped human approval by posting a supplied message to
an explicitly named test channel.

Use only the configured channel-posting tool. Do not search for a channel, select
a different destination, add recipients, add mentions, or change the supplied text.
If the user did not provide the exact channel identifier and message, ask for them
and do not invoke the posting tool.

For a single-post request, propose one posting invocation using the supplied values.
The platform must collect the user's approval before the tool executes. Do not
claim that asking a question in chat is a substitute for that tool approval.

If the user rejects an invocation, do not attempt that post again or use another
route. Report that the invocation was rejected. If the tool fails, report the
failure instead of claiming that the post succeeded.

Only after the tool returns success, report the destination and the message link
or identifier when the tool provides one. Do not invent a link or a tool result.

For an explicit two-post lifecycle test, propose the first supplied post, wait for
its result, then propose the second supplied post. Do not request the second before
the first succeeds. Both invocations must retain tool confirmation. If either is
rejected or fails, stop without proposing further actions.
```

## Before publishing

- Use a dedicated test channel and connect the posting tool as the same user who
  will make the API calls. Confirm that this user can post there.
- Select the actual supported posting tool in your tenant. Provider IDs, tool
  names, and argument names vary; do not paste an invented tool ID into a spec.
- Disable **Run without user confirmation**. If your configuration uses the
  headless builder, inspect the saved spec and ensure the write tool does not have
  `skipConfirmation: true`. Use the builder to change the spec; do not hand-edit
  generated agent files.
- Keep the trigger interactive (chat message), not scheduled or content-triggered.
- Review the configuration before publishing. Connecting an account, publishing,
  running an agent, and posting a message are separate actions requiring your
  authorization.
- The first cold API run must reach `REQUIRES_INPUT` before any post occurs. If it
  completes or posts immediately, stop and correct the configuration. Do not add
  an approval gate only in this local application to hide a missing platform gate.

## Two approval pauses

In a separate run, request two posts with different unique markers and specify
that the second must wait for the first tool result. Review each current batch
independently. The agent instructions express the intended order; the platform's
confirmation setting enforces approval for each actual invocation. If both calls
are proposed together, that is one batch, not evidence of two pauses. Record the
repeated-pause scenario as unverified until the configured agent actually pauses
again after the first accepted continuation.

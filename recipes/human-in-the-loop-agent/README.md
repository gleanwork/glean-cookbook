# Approve an agent action from a CLI

Create an Auto mode agent with a read-only Slack channel lookup and one Slack
write tool. Start a durable run from TypeScript, review the pending tool arguments,
then approve, reject, or cancel it.
Glean keeps the same run ID when approval resumes execution.

The example uses `@gleanwork/api-client@0.20.15`, which supports durable creation,
polling, approval responses, and cancellation. The SDK handles API serialization,
response validation, and errors. The shared cookbook login runtime is copied
into `scripts/glean-auth.mjs` so this directory works on its own.

## Prerequisites

- Node.js 22.12+ and npm. Python and uv are not required.
- A tenant with durable Platform Agents endpoints deployed and enabled.
- Access to Agent Builder in the Glean web app, with Auto mode enabled and
  permission to create and save an agent.
- The native Slack Actions channel-lookup and send-message tools enabled, plus
  a dedicated test channel where you may post. Creation records an agent; each start records a run;
  approval can send a real Slack message. Do not use a production channel.
- A per-user Platform API credential with **`agents.run`**. Create the agent in
  your signed-in Glean browser session, then sign in separately for the CLI.
  This CLI does not need `agents.read`, search scopes, global tokens, or
  `X-Glean-ActAs`.

## 1. Copy and test

```bash
npx -y tiged@2.12.8 --mode=git gleanwork/glean-cookbook/recipes/human-in-the-loop-agent human-in-the-loop-agent
cd human-in-the-loop-agent
npm ci
npm test
```

The tests compile the TypeScript into `dist/` and use an offline HTTP transport
with the real SDK. They neither create an agent nor post to Slack. All later
shell commands run in this same directory.

## 2. Create the agent

Follow [agent-setup.md](./agent-setup.md) in the Glean web app: open the Agent
library, click **Create agent**, and use **Auto mode**. In **Tools → Slack Actions**,
select both **Search Slack Channel Doc Ids** and **Send Slack message to a channel**.
Keep **Run without confirmation** unchecked for the write. Use a manual **Chat
message** trigger and paste the supplied instructions with your test channel name.

The lookup returns the `channelDocId` required by the send-message tool. Do not
use a raw Slack channel ID or general Glean Search as a substitute. Mentioning
the lookup in Instructions does not enable it; check the selected tools list.

Click **Save** to publish the agent with access limited to you before running the
CLI. Draft autosave alone does not publish changes. Save again after changing
the tools, instructions, or trigger.

The guide includes the Builder Assistant prompt and the exact agent instructions.
No coding-assistant plugin or local agent specification is required. Do not run
the builder's Preview or enable scheduled/background runs. The CLI walkthrough
below is the first test run.

## 3. Sign in and configure

```bash
node scripts/glean-auth.mjs login --scopes agents.run --email "<work-email>"
```

Complete browser sign-in yourself. Login writes `GLEAN_SERVER_URL` and
`GLEAN_API_TOKEN` to the ignored `.env` and keeps OAuth state in its secure local
store. If dynamic registration cannot grant `agents.run`, use an
admin-registered public OAuth client via `GLEAN_OAUTH_CLIENT_ID`. If no OAuth
path is available, copy `.env.example` to `.env` and enter your backend origin
and a **user-scoped** Glean-issued token with access to `agents.run`. See
[Platform API authentication](https://developers.glean.com/api/platform-api/authentication).
Never paste credentials into a chat or a command. Global/act-as tokens are not
supported by this recipe. Sign in as the same user for every command on a run.

In `.env`, set `GLEAN_AGENT_ID` and `GLEAN_MESSAGE`. Use harmless text with a
unique marker, such as `Cookbook approval test 001: ready for review.` Change
the marker for each new run. Environment variables take precedence over `.env`.

## 4. Start and inspect a durable run

```bash
npm start -- start
```

The JSON response contains the snapshot under `run`, including `run.run_id`.
Copy that exact value into a shell variable: `export RUN_ID='the printed run_id'`. Do not run `start` again to
check progress; every start creates another execution.

```bash
npm start -- watch --run-id "$RUN_ID"
```

Expect `REQUIRES_INPUT` and exactly one `pending_interactions` entry of type
`TOOL_APPROVAL`. Read its `display_name`, `tool_id` when present, and complete
`arguments`. Check the destination channel, message, and messaging identity.
Confirm the marker does **not** appear in Slack. If the agent completes or posts
before this pause, stop: the configured approval boundary failed.

Copy the displayed `interaction_id` into
`export INTERACTION_ID='the reviewed interaction_id'`. This identifies one
stored invocation, not a tool definition. Do not edit the arguments or reuse
an ID from a different pause. If the arguments are wrong, reject or cancel;
start a new run only after reconciling the previous one.

The watcher stops after 120 seconds by default (plus an in-flight request's
15-second timeout). Exit code 2 means polling stopped, not cancellation. To
reconnect, reopen this directory, set `RUN_ID` to the saved ID, and run:

```bash
npm start -- status --run-id "$RUN_ID"
npm start -- watch --run-id "$RUN_ID" --wait-seconds 120
```

These commands only inspect the existing run. They never approve anything.
The CLI prints the original response JSON after SDK validation. This preserves
large numeric arguments exactly instead of showing values rounded by JavaScript.
Do not parse and re-serialize the JSON to produce your approval preview.

## 5. Approve, reject, or cancel

Choose **one** action for the paused run. Only approve arguments you have
reviewed. An approval command can immediately post to Slack.

Approve the stored invocation:

```bash
npm start -- approve --run-id "$RUN_ID" --interaction-id "$INTERACTION_ID"
npm start -- watch --run-id "$RUN_ID"
```

Expect the same run ID, eventual `SUCCEEDED`, and exactly one matching Slack
post. An accepted response is not proof that the tool succeeded; check the
terminal output and Slack. The CLI never approves a later pause automatically.

To test rejection, start a **new** run with a new message marker, wait for its
pause, and replace both shell variables with that run's reviewed IDs:

```bash
npm start -- reject --run-id "$RUN_ID" --interaction-id "$INTERACTION_ID"
npm start -- watch --run-id "$RUN_ID"
```

Expect the agent to acknowledge rejection and stop without a post or another
tool attempt. Rejection follows the agent's workflow; it is not cancellation.

For cancellation, start another marked run and wait for its approval pause:

```bash
npm start -- cancel --run-id "$RUN_ID"
npm start -- watch --run-id "$RUN_ID"
```

Expect `CANCELLED`, no pending interactions, and no post. For an active run,
cancellation is cooperative: keep polling, because completion may win the race.
Cancellation cannot undo an already completed write or guarantee external work
has stopped. Closing the CLI or pressing Ctrl-C does **not** cancel a run.

## Verify

Use a unique marker for every new run and record run IDs and observations:

| Scenario             | Required observation                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Pause and reconnect  | One pending approval, no Slack post; a fresh CLI process reads the same run and stored arguments.                                     |
| Approve              | Same run ID reaches `SUCCEEDED`; exactly one matching Slack post.                                                                     |
| Replay               | After completion, repeat the exact accepted approval command once; the same run returns and the Slack count remains one.              |
| Conflicting decision | Reject that already-approved interaction; expect HTTP 409, with no new post.                                                          |
| Reject               | A new run stops after rejection without any matching post or another tool attempt.                                                    |
| Cancel while paused  | A new paused run becomes `CANCELLED`, with no pending interactions and no matching post.                                              |
| Wrong owner or agent | With separately authorized test access, polling another user's run or mismatching the agent/run returns 404, without exposing output. |

An unexpected second pause requires a fresh review. Never reuse old approval
IDs there: the API rejects stale decisions with 409. This recipe does not add
a second tool just to generate another pause. Unit tests cover the client's
409 handling; a live later-pause test needs a separately configured test agent.

Maintainers can run `mise exec -- pnpm verify:recipe human-in-the-loop-agent`
from the cookbook root after running `npm ci` and `npm run build` in
`recipes/human-in-the-loop-agent`, then exporting the credential/configuration and
`GLEAN_APPROVED_RUN_ID`, `GLEAN_REJECTED_RUN_ID`, `GLEAN_CANCELLED_RUN_ID` from
these checks. That gate reads snapshots with the shipped CLI; it does not
create runs, approve tools, or inspect Slack. It always reports **partial
verification**. A reviewer must record the Slack, replay, ownership, and
reconnect observations separately. Never set `lastVerified` from offline tests
or snapshots alone. The deployed recipe page must also pass a cold walkthrough.

## API calls and limits

| SDK method                                                                     | HTTP request                                                          |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `agents.createRun({ execution_mode: 'DURABLE', stream: false, ... }, agentId)` | `POST /api/agents/{agent_id}/runs` → 201                              |
| `agents.getRun`                                                                | `GET /api/agents/{agent_id}/runs/{run_id}`                            |
| `agents.respondToRun`                                                          | `POST /api/agents/{agent_id}/responses` with `run_id` and `responses` |
| `agents.cancelRun`                                                             | `POST /api/agents/{agent_id}/cancellations` with `run_id`             |

No experimental header is required. The response and cancellation routes are
**not** nested under `/runs/{run_id}`. Approval sends one `APPROVE` or `REJECT`
decision for the exact reviewed interaction ID. It grants no session-wide
permission and cannot edit the stored arguments. The server requires the
complete pending batch; this example deliberately uses one write tool.

Durable means execution outlives the HTTP request, not automatic crash recovery.
An active turn has a 30-minute execution timeout; a subsequent read marks an
overdue turn failed after 40 minutes. There is no periodic sweep or automatic
replay. Approval-paused runs do not expire through this cleanup. Each accepted
continuation starts a new deadline. Failure alone does not prove external work
has stopped.

All automatic retries are disabled. On a lost create response, reconcile in
Glean before starting again. On a lost decision response, inspect the same run;
an explicit replay must use the exact original decision and interaction ID.
A 409 requires inspecting the conflict, not substituting new IDs. A cancellation
409 can occur before the worker registers; inspect and explicitly retry later.
On 401, sign in again as the same user; on 403, check `agents.run` and agent
access; on 422, complete tool authentication in Glean. Do not disable approvals
to fix an authentication error.

## Cleanup

Cancel each unfinished test run explicitly and check its final state. With the
appropriate permission, remove only the marked test messages from Slack and
archive or delete your disposable agent in Agent Builder. Nothing here deletes
runs, messages, or agents automatically. Keep credentials and printed tool
arguments out of shared logs and version control.

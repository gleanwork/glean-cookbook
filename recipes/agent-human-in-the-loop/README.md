# Run an agent with human approval

Create an approval-gated posting agent, start a durable run with curl, and inspect
that same run in a local lifecycle explorer. Review stored tool arguments before
submitting decisions. Glean—not the local app—enforces the approval gate.

This is a **preview recipe**. Local checks use synthetic responses; they are not
evidence of a verified live post. See [VERIFICATION.md](VERIFICATION.md) for the
remaining cold-run checks. The recipe assumes the durable run endpoints are enabled.

## Before you start

- Node.js 22.12 or newer, npm, curl 7.76 or newer (`--fail-with-body`), and jq 1.6 or newer.
- Permission to create and publish an autonomous agent in Glean Agent Builder.
- A supported Slack channel-posting tool, its connected account, and a dedicated
  test channel you are authorized to post to. Do not test with customers or announcements.
- The complete backend HTTPS origin from **Glean → About → Server instance (QE)**.
  Do not use the web app URL, append `/api`, or derive a backend hostname.
- OAuth with the `agents.run` scope, or a user-scoped API token with that scope.
  Use the **same authenticated user** to create, retrieve, respond to, and cancel a run.

The published TypeScript API client inspected for this recipe (0.20.13) does not
expose the full durable lifecycle. The four calls here use native `fetch` and
`@gleanwork/auth` 1.0.0 for supported OAuth login and refresh. There is no SDK
compatibility wrapper, experimental opt-in header, or custom token store.

## Walkthrough

Numbered commands are one sequential Bash or zsh session. Only the installation
step changes directories. The browser server runs in that same shell at the end;
use another shell only when explicitly noted.

### 1. Copy the scaffold

```bash
npx -y tiged@2.12.8 --mode=git gleanwork/glean-cookbook/recipes/agent-human-in-the-loop agent-human-in-the-loop
```

Until this recipe is merged, use a local copy of this complete directory rather
than expecting the default-branch scaffold command to retrieve unpublished files.

### 2. Install and check locally

```bash
cd agent-human-in-the-loop &&
  npm ci &&
  npm run check &&
  cp .env.example .env &&
  cp requests/start-run.json start.json
```

The checks do not call Glean. Open `.env` in your editor and set `GLEAN_SERVER_URL`.
Set `GLEAN_AGENT_ID` after the next step. Leave `GLEAN_API_TOKEN` empty for OAuth.
Keep `.env` in shell-compatible `NAME=value` form. Never paste a credential into
chat, a screenshot, or a command literal.

### 3. Create the agent

In Glean Agent Builder, create an **autonomous agent with a chat-message trigger**.
Use the copyable instructions in [agent-instructions.md](agent-instructions.md).
Attach only the supported Slack channel-posting tool available in your tenant.
Connect its account as the same user who will authenticate the API calls.

Leave **Run without user confirmation** unchecked on that tool. A prompt saying
“ask first” is not an approval policy. Review the configuration and publish the
agent when authorized. Copy the agent ID from its URL into `.env`.

Use a dedicated test channel. In `start.json`, replace `<CHANNEL_ID>` with its exact
identifier and `<UNIQUE_MARKER>` with a unique, non-sensitive marker. Preserve the
rest of the request shape. Do not start a scheduled agent or add unrelated tools.

The [setup storyboard](assets/agent-setup.svg) is a schematic, not a product
screenshot. It identifies the settings that must be checked in your tenant.

### 4. Authenticate

Load your own local configuration and log in through the supported auth package.
Complete browser login yourself; do not give another person or assistant your
password or MFA code.

```bash
set -a
. ./.env
set +a
npm run login -- --server-url "$GLEAN_SERVER_URL"
GLEAN_API_TOKEN="$(npx --no-install glean-auth token --server-url "$GLEAN_SERVER_URL" --scopes agents.run)" && export GLEAN_API_TOKEN
```

For the API-token fallback, set a user-scoped `GLEAN_API_TOKEN` securely in `.env`,
load the file with the first three lines, and omit login and token retrieval. Do
not use a service identity or switch users between requests. Authentication of the
API and authorization of the agent's external tool are separate prerequisites.

Do not enable shell tracing (`set -x`) or curl verbose/trace output. The token is
expanded into curl's arguments; only use this on a trusted single-user machine.
OAuth tokens expire: rerun the token command when needed. The local server uses
the auth provider to refresh OAuth credentials automatically when no static token
is set.

### 5. Start a durable run

This POST records a real execution. Authorize it only after checking the agent,
test destination, and request text. It returns HTTP 201 without waiting for the
agent to finish. There is **no automatic retry**: every creation POST can start a
new run.

```bash
curl --fail-with-body --silent --show-error --max-time 60 \
  "$GLEAN_SERVER_URL/api/agents/$GLEAN_AGENT_ID/runs" \
  -H "Authorization: Bearer $GLEAN_API_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @start.json --output run.json &&
  jq . run.json &&
  RUN_ID="$(jq -er '.run.run_id' run.json)" && export RUN_ID &&
  printf '%s\n' "$RUN_ID" > run-id.txt
```

The command saves the returned run ID separately in `run-id.txt`, so an error
response cannot overwrite your resume reference. The **agent ID** identifies the definition; the **run ID**
identifies this execution; **interaction IDs** identify individual pending tool
invocations. `request_id` is request-level support correlation, not a resume token.

### 6. Inspect until the run pauses

```bash
curl --fail-with-body --silent --show-error --max-time 60 \
  "$GLEAN_SERVER_URL/api/agents/$GLEAN_AGENT_ID/runs/$RUN_ID" \
  -H "Authorization: Bearer $GLEAN_API_TOKEN" \
  -H 'Content-Type: application/json' --output run.json &&
  jq '{request_id, run: {run_id: .run.run_id, state: .run.state, pending_interactions: .run.pending_interactions, output: .run.output, error: .run.error}}' run.json
```

GET observes the run; it does not advance it. While the state is `RUNNING` or
`QUEUED`, wait at least two seconds before repeating this command. Stop at
`REQUIRES_INPUT` or a terminal state. For a longer wait, use the explorer's bounded
polling instead of an unbounded shell loop. On HTTP 429, honor `Retry-After`.

At `REQUIRES_INPUT`, inspect **every** pending interaction's `display_name`,
`description`, `arguments`, and `interaction_id`. `tool_id` is optional. Confirm
that the channel and message are exactly what you intended and that nothing has
been posted yet. If the run posts without pausing, stop: the agent's tool policy is
wrong. If it succeeds without a tool call, correct its configuration or input;
that is not a successful HITL test.

### 7. Review and submit the complete decision batch

The next command prepares a **reject-by-default** response file. It does not
submit decisions. Open `responses.json` in your editor and set each decision to
`APPROVE` or `REJECT` after reviewing its corresponding stored arguments. Include
one decision for every current interaction. Do not edit invocation arguments.

```bash
jq -e '.run.state == "REQUIRES_INPUT" and (.run.pending_interactions | length > 0)' run.json &&
  jq '{responses: [.run.pending_interactions[] | {interaction_id, decision: "REJECT"}]}' run.json > responses.json
```

After reviewing the file, submit it. **APPROVE authorizes the actual external tool
invocation**; rejection does not cancel the run.

```bash
curl --fail-with-body --silent --show-error --max-time 60 \
  "$GLEAN_SERVER_URL/api/agents/$GLEAN_AGENT_ID/runs/$RUN_ID/responses" \
  -H "Authorization: Bearer $GLEAN_API_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @responses.json --output run.json &&
  jq . run.json
```

HTTP 200 acknowledges the decision batch; it does not promise completion. The
returned `.run.run_id` must remain `$RUN_ID`. An identical accepted retry returns
the current snapshot without another continuation. Once a later approval batch
appears, old decisions are stale. On HTTP 409, GET the current run and review it
again; never replace old interaction IDs automatically or grant blanket approval.

### 8. Follow the same run to its outcome

```bash
curl --fail-with-body --silent --show-error --max-time 60 \
  "$GLEAN_SERVER_URL/api/agents/$GLEAN_AGENT_ID/runs/$RUN_ID" \
  -H "Authorization: Bearer $GLEAN_API_TOKEN" \
  -H 'Content-Type: application/json' --output run.json &&
  jq . run.json
```

Repeat GET with the same waiting rules. A run can pause again. Review the new
batch rather than creating a new run or reusing previous decisions. Terminal
states are `SUCCEEDED`, `FAILED`, `CANCELLED`, and `EXPIRED`; do not assume every
state will appear. HTTP 200 can retrieve a `FAILED` run. Inspect `.run.output` and
`.run.error`, then independently verify the unique marker at the destination.
A rejected invocation can lead to a `SUCCEEDED` run that explains the rejection.

### 9. Open the lifecycle explorer

```bash
unset GLEAN_API_TOKEN
npm start
```

The unset removes the short-lived token exported for curl. The server uses cached
OAuth instead, or loads the API-token fallback from `.env`. Open the **actual
loopback URL printed by the server**. Paste `$RUN_ID` from your saved response into
**Attach to run**; this makes a GET, not another creation POST. The explorer keeps
credentials on the server and displays lifecycle observations, exact approval
arguments, raw API responses, and curl equivalents side by side.

The server occupies this shell. For further curl calls, open a **new shell**, enter
the copied recipe directory, repeat the configuration/token setup, and restore
`RUN_ID` with `RUN_ID="$(cat run-id.txt)"`. Do not rerun the creation POST merely
to reconnect.

Only the last agent/run ID is stored in the browser. Raw responses and decisions
stay in memory. After closing and reopening the page, attach again; reopening does
not automatically submit a saved decision. A two-minute polling budget stops the
client's GET loop, not the server execution. You can refresh or restart polling.

## Alternate paths

Use a **separate, explicitly authorized run** for each scenario:

- **Reject:** leave every prepared decision as `REJECT`. Confirm the rejected
  invocation does not post. Inspect the agent's actual resulting state and output.
- **Another pause:** follow the two-post instructions in `agent-instructions.md`.
  Confirm the second pause has new interactions and the same run ID. Submit only
  the new current batch. If the agent proposes both posts at once, test complete
  batch decisions, but do not claim to have verified two sequential pauses.
- **Reconnect:** close the client while running or paused, reopen it, and GET the
  saved ID. Do not infer crash recovery from this test.
- **Approval retry:** while the run is active after acceptance or terminal, resend
  the identical accepted `responses.json`. Confirm no additional post occurred.
  After a later pause, that old batch should return 409 instead.
- **Cancel while paused:** use the explorer's explicit cancellation control, or the
  following command with the selected test run. Poll GET afterward.

```bash
curl --fail-with-body --silent --show-error --max-time 60 \
  --request POST "$GLEAN_SERVER_URL/api/agents/$GLEAN_AGENT_ID/runs/$RUN_ID/cancellations" \
  -H "Authorization: Bearer $GLEAN_API_TOKEN" \
  -H 'Content-Type: application/json' --output run.json &&
  jq . run.json
```

A paused run becomes `CANCELLED` without resuming. For active work, cancellation
is cooperative: sending the signal need not change `RUNNING` immediately, and
completion can win. It cannot undo completed posts, stop all external tool work,
or cancel separate background-subagent executions. Cancellation can return 409
if an active run lacks a cancellation registration. Repeated cancellation requests
and cancellation of terminal runs return the current snapshot.

## Safety, errors, and limits

- A lost creation response is ambiguous. Do not blindly POST again. Recover a run
  ID through authorized operational support if necessary; this recipe has no list
  or discovery endpoint for lost runs.
- On 401, refresh authentication. On 403, check scope and current agent access.
  Unknown runs, a different owner, or mismatched agent/run IDs return 404.
  On 422 at creation, connect the missing tool account in Glean before deliberately
  retrying. Do not improvise an OAuth flow in this example.
- Tool arguments, messages, and API responses may be sensitive. They are displayed
  as inert text, not HTML. Review screenshots before sharing. Local response files
  are ignored by Git; remove them manually when no longer needed.
- Durable execution survives the client disconnect, not a backend restart/crash.
  Active turns can fail through deadline cleanup without replay. Failure does not
  prove that external work stopped. Waiting for approval does not expire a run.
- `updated_at` records persisted activity, not a worker heartbeat or exact
  transition time. The explorer records when it **observed** a snapshot. Polling
  may miss intermediate states; the UI does not fill in imaginary transitions.
- This is a single-user, loopback-only explorer—not a shared approval service.
  It has no multi-user login, role delegation, public hosting, or approval editing.
  Approval-retry safety is not a general exactly-once tool-execution guarantee.

## Visuals and local checks

[Lifecycle map](assets/lifecycle.svg) · [API sequence](assets/api-sequence.svg) ·
[Agent setup schematic](assets/agent-setup.svg)

```bash
npm run check
npx --no-install playwright install chromium
npm run test:browser
```

Unit, HTTP, and browser tests use synthetic responses and make no Glean calls.
The browser tests cover review-before-submit, repeated pauses, conflicts,
reconnect, cancellation, failed runs, untrusted text, and mobile layout. They do
not certify the external tool or the rendered developer-site instructions.

## Verify and clean up

Complete the live scenarios in [VERIFICATION.md](VERIFICATION.md) against authorized
test resources. Keep API assertions separate from observed external side effects.
Stop the local server with Ctrl-C; this does **not** cancel a run. Retrieve any
outstanding test run IDs and explicitly cancel paused runs you no longer need.
Identify test posts by their markers and remove them only if authorized. Forget
the stored run ID using the UI and remove local response files when finished.

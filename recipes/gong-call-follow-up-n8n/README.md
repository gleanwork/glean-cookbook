# Gong call follow-up in n8n

A Glean trigger starts this workflow when a new Gong call involves you. It gathers context with Glean
Search, summarises the call with Glean Chat, records the summary as a completed Salesforce activity
on exactly one matching Account, and posts to that account's Slack channel.

Nothing is written when the account is ambiguous. Post to one central channel to start, or map
accounts to their own channels — once you do, an unmapped account halts rather than widening.

## Surfaces and scopes

| Step      | Node                      | Surface      | Scope      |
| --------- | ------------------------- | ------------ | ---------- |
| Trigger   | Glean Trigger             | Platform API | `TRIGGERS` |
| Retrieval | Glean node, Search action | Client API   | `SEARCH`   |
| Summary   | HTTP Request              | Client API   | `CHAT`     |

The package ships two nodes — a Trigger and a Search action — and **no Chat node**, so summarisation
is an HTTP Request. Search is not strictly required, since Chat retrieves too; it is there so the
evidence is visible in the execution log and assertable in the gate.

## Hosting

Glean delivers from its own network, so n8n needs a public HTTPS URL.

- **n8n Cloud** — works as shipped.
- **Self-hosted** — set `WEBHOOK_URL` to the public origin, behind a tunnel or ingress.

The Trigger node registers whatever webhook URL n8n computes for itself. With a localhost
`WEBHOOK_URL`, registration succeeds, the trigger looks healthy, and no delivery ever arrives.

## Import and configure

Get the files:

```bash
npx -y tiged@2.12.8 --mode=git gleanwork/glean-cookbook/recipes/gong-call-follow-up-n8n gong-call-follow-up-n8n
cd gong-call-follow-up-n8n
```

Then in n8n:

1. **Settings → Community nodes → Install** → `@gleanwork/n8n-nodes-gleanclient@0.4.1`.
2. Get [`workflow.json`](workflow.json) onto the canvas, whichever way suits where n8n runs:

   - **Workflows → Import from URL** — nothing to move, works from any machine:

     ```
     https://raw.githubusercontent.com/gleanwork/glean-cookbook/main/recipes/gong-call-follow-up-n8n/workflow.json
     ```

   - **Copy the file and paste onto an empty canvas** (`cat workflow.json`) — use this when n8n
     cannot reach GitHub.
   - **Workflows → Import from File** — a browser file picker, so it only sees files on the machine
     running your browser. That is where you scaffolded only if you ran the command there; it is
     not, if Claude Code is on a remote host or in a container.

   Don't use `n8n import:workflow` — the file ships without an `id`, which the CLI requires and the
   UI generates.

   Ten nodes and a **Start here** note should appear, with **Glean Trigger** and **Search Glean for
   call context** resolved — unresolved nodes mean step 1 has not taken effect yet. The note lists
   the two values to fill in, so the file explains itself if you hand it to someone else.

3. Add a **Glean Trigger** credential scoped `TRIGGERS`, a **Glean Client** credential scoped
   `SEARCH` and `CHAT`, plus Salesforce and Slack.
4. Fill in two values by hand — n8n Variables are a paid feature, so nothing here needs them:
   - **Glean Chat** node → replace `YOUR-INSTANCE-be.glean.com` in the URL with your backend.
   - **Resolve channel** node → paste a channel id into `SLACK_CHANNEL` at the top. One central
     channel is the simplest start; fill `ACCOUNT_CHANNELS` instead to route per account.

   If you _do_ have Variables, `GLEAN_SERVER_URL`, `GONG_SLACK_CHANNEL` and `GONG_ACCOUNT_CHANNELS`
   override both, so the same file works unedited across environments.

5. Run `npm run verify:fixture`, then **Publish** (the Active toggle on n8n 1.x). Publishing
   registers the webhook with Glean; unpublishing removes it.
6. Confirm the registration landed: `GET /api/triggers` on your Glean instance should list a Gong
   trigger whose `webhook_url` is your public n8n origin. If it points at localhost, fix
   `WEBHOOK_URL` and publish again — Glean cannot reach it, and nothing will ever arrive.

The workflow pins `GONG_2` ("New call with participant as me") — "me" is the owner of the Glean
credential, so whose calls match is decided by the credential, not by a setting. The Trigger node
lists what your tenant serves — confirm the semantics before publishing.

## Verify locally

```bash
npm run verify:fixture
```

No credentials, no network, no n8n. It runs the shipped Code nodes over `fixtures/` and checks the
`doc_id`+`event_time` delivery key and the gate that drops a redelivery, `trigger_id` with a
`trigger_name` fallback, account resolution and its refusals, the unmapped-channel halt, and that
Salesforce is written before Slack.

Delivery is at-least-once, so `Extract call` records that key in n8n workflow static data and drops a
repeat before either write. n8n saves static data **only when an execution succeeds**, which is what
you want: a run that fails at Salesforce or Slack records nothing, so its retry does the work.

Static data is unavailable in manual executions — pressing **Execute Workflow** by hand does not
deduplicate, so publish and let the trigger call it. A run that writes Salesforce and then fails at
Slack is not recorded either, so its retry repeats the Salesforce write. The feature is experimental
and documented as unreliable under high-frequency execution; move the key to an external store before
high volume.

Chat parsing gets its own set, because Chat is a conversational surface and an account record is not.
Glean streams a plan, then progress narration, then the answer — the plan arrives as `CONTENT` like
the answer does, so the answer is the `CONTENT` after the last `UPDATE`, not every `CONTENT`. Chat
also signs off by offering to do more; the prompt asks it not to and the parse removes it anyway. A
200 carrying no answer text is refused as an unfinished run rather than written down as an empty call.

It also pins node contracts that import cleanly and only fail when the workflow runs: `preset` is a
resource locator and `authentication` must be a value the node accepts — a flat `presetId` binds no
preset and never fires — and the Salesforce node wants `status` top-level with `subject` inside
`additionalFields`, not the reverse.

## Central channel or per-account routing

A central channel is a deliberate choice: one place, picked by you, that sees every call summary.
That is the sensible way to start.

A per-account map is for when different account teams should see different calls. Once it exists an
unmapped account halts — it does not fall back to the central channel, because falling back would
quietly widen one customer's audience, which is the thing per-account routing was set up to avoid.
Salesforce is already written by then, so only the notification is missing.

## Which customer the call was with

Glean Chat names the account, because call titles do not reliably carry it. Gong's own format puts
participants before the separator — shaped like `Firstname Lastname <> Firstname Lastname : Topic :
Account`, e.g. the invented `Dana Reyes <> Sam Okonkwo : Renewal Review : Globex` — so the `<>`
separates the two sets of _participants_, and reading the account from the front of the title picks a
person's name. Plenty of titles are free-form and follow no convention at all. Measured over the Gong
calls in one tenant, splitting the title identified 0 of 6 accounts; asking Chat identified 5, and
declined on the sixth.

Chat is asked, not trusted. It proposes a name; `Resolve account` still requires exactly one matching
Salesforce account, so a name it invented matches nothing and the run halts.

## Why exact account matching

The workflow attaches a completed Task to the uniquely matched Account rather than overwriting a
customer-owned field. "Acme Corp" and "Acme Corporation" are different accounts with different
owners, and any normalization loose enough to merge real duplicates merges those two as well —
writing a summary to the wrong customer's record is a disclosure, not a degraded result.

Detecting that ambiguity needs the whole Account list, so the SOQL query has no `WHERE` clause.
That is fine for a smaller org and will not be at six figures; narrow the lookup for a large
deployment, keeping the uniqueness check that halts on more than one match.

# Gong call follow-up in n8n

A Glean trigger starts this workflow when a new Gong call involves you. It gathers context with Glean
Search, summarises the call with Glean Chat, records the summary as a completed Salesforce activity
on exactly one matching Account, and posts to that account's Slack channel.

Nothing is written when the account is ambiguous. Post to one central channel to start, or map
accounts to their own channels — once you do, an unmapped account halts rather than widening.

For the trigger model and endpoint contract, see the [Triggers guide](https://developers.glean.com/guides/triggers/overview)
and the [Triggers API reference](https://developers.glean.com/api/platform-api/triggers-overview).

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
- **Self-hosted** — set the webhook base to the public origin, behind a tunnel or ingress. Current
  builds read `N8N_WEBHOOK_URL`; older ones read `WEBHOOK_URL`. Setting both is harmless.

The Trigger node registers whatever webhook URL n8n computes for itself. With a localhost webhook
base, registration succeeds, the trigger looks healthy, and no delivery ever arrives.

### Run n8n locally

For a first pass on your own machine, n8n can supply the public origin itself:

```bash
npx n8n@latest start --tunnel
```

The editor is at `http://localhost:5678`. `--tunnel` publishes a development tunnel and points the
webhook base at it, so the trigger registers a URL Glean can reach without any ingress of your own.
Its hostname changes on restart, so publish again afterwards — the registered webhook goes stale and
deliveries stop with no error anywhere.

n8n pins which Node majors it supports, so use one its release notes name; a newer Node can refuse to
start. In Docker, supply the origin yourself:

```bash
docker run -it --rm -p 5678:5678 -v n8n_data:/home/node/.n8n \
  -e N8N_WEBHOOK_URL=https://your-public-origin \
  docker.n8n.io/n8nio/n8n
```

Whichever origin you choose has to be both what n8n reports and reachable from the public internet. A
VPN-only host, an internal ingress, or a tunnel that is down all register fine and then receive
nothing.

## Import and configure

Before downloading the workflow, decide where n8n will run:

- **n8n Cloud** needs no tunnel; its webhook origin is public by default.
- **Local or self-hosted n8n** needs a public HTTPS origin before you publish. For a development
  run, use `npx n8n@latest start --tunnel`. For a persistent setup, use Cloudflare Tunnel or another
  public ingress and set `N8N_WEBHOOK_URL` to that origin. Glean cannot deliver to localhost.

Ask for the user's work email and resolve the Glean backend before importing:

```bash
node <cookbook-plugin-root>/scripts/resolve-backend.mjs "you@company.com"
```

Use the returned `https://<instance>-be.glean.com` value for the Glean Chat URL. Discovery may
return a legacy frontend URL such as `https://<instance>.askscio.com`; do not paste that value into
the workflow—the resolver normalizes it to the API backend.

Get the files:

```bash
npx -y tiged@2.12.8 --mode=git gleanwork/glean-cookbook/recipes/gong-call-follow-up-n8n gong-call-follow-up-n8n
cd gong-call-follow-up-n8n
```

Then in n8n:

1. **Settings → Community nodes → Install** → `@gleanwork/n8n-nodes-gleanclient@0.4.2`.
2. Get [`workflow.json`](workflow.json) onto the canvas. Only one of these routes carries edits you
   made to the file:

   - **Workflows → Import from File** — prefer this. It is the only route that imports the file you
     actually have, edits included. It is a browser file picker, so it sees the machine running your
     browser: that is where you scaffolded, unless Claude Code is on a remote host or in a container.
   - **Workflows → Import from URL** — nothing to move, works from any machine, but it always fetches
     the untouched file from GitHub:

     ```
     https://raw.githubusercontent.com/gleanwork/glean-cookbook/main/recipes/gong-call-follow-up-n8n/workflow.json
     ```

   - **Copy the file and paste onto an empty canvas** (`cat workflow.json`) — for when the file sits
     on a machine your browser cannot see and n8n cannot reach GitHub.

   Either import the shipped file and fill the two values in the UI (step 4), or fill them into the
   local file and import that file. Don't take one half of each: configuring `workflow.json` locally
   and then importing from URL pulls the placeholder copy and drops your edits. Nothing complains —
   ten nodes import, the canvas looks right, and it fails later at Chat on a placeholder hostname, or
   at **Resolve channel** with no channel configured, once Salesforce has already been written.

   Don't use `n8n import:workflow` — the file ships without an `id`, which the CLI requires and the
   UI generates.

   Ten nodes and a **Start here** note should appear, with **Glean Trigger** and **Search Glean for
   call context** resolved — unresolved nodes mean step 1 has not taken effect yet. The note lists
   the two values to fill in, so the file explains itself if you hand it to someone else.

3. Add a **Glean Trigger** credential scoped `TRIGGERS`, a **Glean Client** credential scoped
   `SEARCH` and `CHAT`, plus Salesforce and Slack.
4. Fill in two values — n8n Variables are a paid feature, so nothing here needs them:
   - **Glean Chat** node → replace `YOUR-INSTANCE-be.glean.com` in the URL with the normalized
     backend returned by the resolver.
   - **Resolve channel** node → paste a channel id into `SLACK_CHANNEL` at the top. One central
     channel is the simplest start; fill `ACCOUNT_CHANNELS` instead to route per account.

   If you _do_ have Variables, `GLEAN_SERVER_URL`, `GONG_SLACK_CHANNEL` and `GONG_ACCOUNT_CHANNELS`
   override both, so the same file works unedited across environments.

5. Run `npm run verify:fixture`. If you edited the local `workflow.json`, also run
   `npm run verify:config` before importing it. That command reads the local file; it cannot see
   values entered in the n8n UI or stored in n8n Variables. For those paths, inspect both values in
   n8n and run a manual test there. Then **Publish** (the Active toggle on n8n 1.x). Publishing
   registers the webhook with Glean; unpublishing removes it.
6. Confirm the registration landed: `GET /api/triggers` on your Glean instance should list a Gong
   trigger whose `webhook_url` is your public n8n origin. If it points at localhost, fix
   `WEBHOOK_URL` and publish again — Glean cannot reach it, and nothing will ever arrive.

The workflow pins `GONG_2` ("New call with participant as me") — "me" is the owner of the Glean
credential, so whose calls match is decided by the credential, not by a setting. The Trigger node
lists what your tenant serves — confirm the semantics before publishing.

## Verify locally

```bash
npm run verify:fixture   # the shipped nodes against recorded deliveries
npm run verify:config    # checks values edited into the local workflow.json
```

No credentials, no network, no n8n. It runs the shipped Code nodes over `fixtures/` and checks the
`doc_id`+`event_time` delivery key and the gate that drops a redelivery, `trigger_id` with a
`trigger_name` fallback, account resolution and its refusals, the unmapped-channel halt, and that
Salesforce is written before Slack.

`verify:config` deliberately checks only the local file. A workflow configured after import, or
through n8n Variables, must be checked in n8n because those values do not exist in this checkout.

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

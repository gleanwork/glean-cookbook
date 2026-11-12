# Review AI usage limit increase requests

When members reach their AI usage limit, they can ask for more. This CLI works
that request queue for a billing admin. It lists pending requests, shows each
one with the requester's current limit and remaining headroom, and approves a
one-month increase or denies the request with a note. Members can use the same
CLI to file a request and track its status.

It uses the experimental usage limit-increase request APIs with a user-scoped
Client API token. The official `@gleanwork/api-client` SDK looks up
requesters. The request and evaluation operations are not in the released SDK
yet, so `src/api.ts` sends them over a small REST bridge with the same token.
That bridge never retries a write.

## Prerequisites

- Node.js 22.12.0 or newer
- A workspace with the request-more setting (`spend_limit.requestMore.enabled`)
  turned on. Every request API returns 404 until it is on.
- Workspace billing permissions: billing read to review the queue, billing edit
  to approve or deny. The ADMIN role alone does not grant them.

## Copy and test the project

```bash
npx -y tiged@2.12.8 --mode=git gleanwork/glean-cookbook/recipes/usage-limit-requests usage-limit-requests
cd usage-limit-requests && npm ci
npm test
```

The tests use MSW HTTP handlers and need no credentials or network access. They
check the exact approve and deny bodies, the confirmation prompt, pagination,
and the refusals described below. Passing tests does not verify access to your
workspace.

## Configure your backend and token

```bash
cp .env.example .env
```

Open `.env` yourself. Set `GLEAN_SERVER_URL` to the backend origin shown under
Server instance (QE) in the Admin Console. Set `GLEAN_API_TOKEN` to a
user-scoped Client API token that you create in Token Management, signed in as
a user with billing permissions, with these scopes:

| Scope                                 | Used for                                       |
| ------------------------------------- | ---------------------------------------------- |
| `ADMIN_USAGE_LIMIT_INCREASE_REQUESTS` | `queue`, `show`, `approve`, `deny`             |
| `USAGE_LIMIT_INCREASE_REQUESTS`       | `request`, `mine`                              |
| `ADMIN_USAGE`                         | the requester's current limit in show, approve |
| `PEOPLE`                              | requester names                                |

Never paste the token into a prompt, a command, or a committed file; `.env` is
ignored by git. Node.js loads it, and variables already set in your shell take
precedence.

A member who only files and tracks requests can use a token with
`USAGE_LIMIT_INCREASE_REQUESTS` alone and run only `request` and `mine`.

## Verify against your workspace

```bash
npm run verify
```

This reads one page of your own requests and one page of the billing queue, and
changes nothing. It exits non-zero on the first check that fails. A 404 means
the request-more setting is off or your backend does not serve the experimental
request APIs yet. A 403 names the missing scope or billing permission.

## Review the queue

```bash
npm start -- queue
```

Each request shows the person it is for, the spend client, the month, and the
justification. Then:

```bash
npm start -- show <request-id>
npm start -- approve <request-id> --amount 25
npm start -- deny <request-id> --note "Use the team pool this month"
```

`show` adds the requester's current limits on that spend client: the decision,
the remaining headroom per unit, and each applicable limit with its usage.
`approve` prints the same context, and `deny` prints the request. Both ask for
confirmation; pass `--yes` to skip the prompt. Without a terminal, `--yes` is
required.

Use `--status APPROVED,DENIED` to list resolved requests, and `--pages <n>` to
read more than one page of 25.

## File and track your own request

```bash
npm start -- request --client glean --justification "Quarter-end analysis"
npm start -- mine
```

`--client` is the spend client ID the limit applies to: `glean` for usage in
Glean itself, or an AI gateway client's usage client ID. The server stamps the
current UTC month on the request.

## What an approval does

- An approval adds `--amount` to the requester's headroom for the request's
  month only. The standing limit does not change, and the amount is in that
  limit's unit; the confirmation prompt names it.
- The API approves a request only during its own month, which must be the
  current UTC month. The CLI refuses past-month requests before sending anything;
  deny them and ask the member to file a new one.
- The API records approvals for agent requests but adds no capacity for agents.
  The CLI refuses them. Raise an agent's limit with the usage limits API, or
  deny the request.
- Ongoing approvals, which change standing rules, are not available on this
  API. Make them in the Glean app.
- Approve and deny are never retried. If the connection drops during one, the
  CLI says the change may or may not have applied; run `show` before trying
  again.

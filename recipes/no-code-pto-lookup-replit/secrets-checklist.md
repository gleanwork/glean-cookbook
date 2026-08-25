# Secrets checklist

Before you send the prompt, have these two values ready. When Replit Agent asks for them, add them via the **Secrets** tab, padlock icon in the left sidebar. Never paste them into the chat with the Agent, and never let the Agent write them into a file.

| Secret            | Where it comes from                                                                                                 | Notes                                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GLEAN_API_TOKEN` | Glean Admin Console → API access → Client API tokens. Use the Client tab of Token Management, scoped to `CHAT` only | Scope it as narrowly as possible. This token answers questions for anyone who uses the app, so `CHAT`-only limits the blast radius if it ever leaks. |
| `GLEAN_INSTANCE`  | About Glean → Instance name, for example `acme` from `https://acme-be.glean.com`                                    | Not a secret in the security sense, but keeping it in Secrets alongside the token means the whole app config lives in one place.                     |

**After Replit Agent finishes:**

- [ ] Confirm the Repl is private. Do not share its URL: all requests use the same backend token and therefore the token owner's Glean access.
- [ ] Open the app's file tree and confirm neither value appears in any `.js`/`.ts`/`.env` file that got committed. Only `process.env.GLEAN_API_TOKEN` / `process.env.GLEAN_INSTANCE` references.
- [ ] If you fork or share the Repl, re-check this. Replit Secrets are per-Repl and don't travel with a fork by default, but a careless Agent edit could have inlined a value during debugging.
- [ ] Rotate the token from the Admin Console if you ever suspect it leaked.
- [ ] Before any multi-user deployment, replace the shared token with authenticated per-user OAuth.

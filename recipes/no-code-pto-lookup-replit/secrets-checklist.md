# Secrets checklist

Before you send the prompt, have these two values ready. When Replit Agent asks for them, add them via the **Secrets** tab (padlock icon in the left sidebar) — never paste them into the chat with the Agent, and never let the Agent write them into a file.

| Secret            | Where it comes from                                                                    | Notes                                                                                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GLEAN_API_TOKEN` | Glean Admin Console → **Platform → API Tokens** → create a token scoped to `CHAT` only | Scope it as narrowly as possible — this token answers questions for anyone who uses the app, so `CHAT`-only limits the blast radius if it ever leaks. |
| `GLEAN_INSTANCE`  | Your Glean URL, `https://<instance>-be.glean.com` → the `<instance>` part              | Not a secret in the security sense, but keeping it in Secrets alongside the token means the whole app config lives in one place.                      |

**After Replit Agent finishes:**

- [ ] Open the app's file tree and confirm neither value appears in any `.js`/`.ts`/`.env` file that got committed — only `process.env.GLEAN_API_TOKEN` / `process.env.GLEAN_INSTANCE` references.
- [ ] If you fork or share the Repl, re-check this — Replit Secrets are per-Repl and don't travel with a fork by default, but a careless Agent edit could have inlined a value during debugging.
- [ ] Rotate the token from the Admin Console if you ever suspect it leaked (e.g. pasted into a screenshot, committed by accident).

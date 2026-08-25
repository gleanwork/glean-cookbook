# Secrets checklist

Before you send the prompt, have these two values ready. Add them wherever Lovable's Agent directs you once it sets up a backend/secrets integration. Never paste them into the chat with the Agent, and never let the Agent write them into a frontend file.

| Secret            | Where it comes from                                                                                                 | Notes                                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GLEAN_API_TOKEN` | Glean Admin Console → API access → Client API tokens. Use the Client tab of Token Management, scoped to `CHAT` only | Scope it as narrowly as possible. This token answers questions for anyone who uses the app, so `CHAT`-only limits the blast radius if it ever leaks. |
| `GLEAN_INSTANCE`  | About Glean → Instance name, for example `acme` from `https://acme-be.glean.com`                                    | Not a secret in the security sense, but keeping it alongside the token means the whole app config lives in one place.                                |

**After Lovable finishes:**

- [ ] Confirm the project is private. Do not share its URL: all requests use the same backend token and therefore the token owner's Glean access.
- [ ] Open the generated source and confirm neither value appears in any file that ships to the browser (React components, `.env` files bundled client-side). Only references to a server-side secret read.
- [ ] Confirm the Glean API call happens in a backend/server function, not in client-side React code. Open your browser's Network tab while using the app and check that requests to `*.glean.com` never originate from the browser itself.
- [ ] Rotate the token from the Admin Console if you ever suspect it leaked.
- [ ] Before any multi-user deployment, replace the shared token with authenticated per-user OAuth.

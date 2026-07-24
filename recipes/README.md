# recipes/

One directory per recipe, `recipes/{id}/`. See the root [README](../README.md#recipe-directory-convention) for the directory convention each recipe follows.

- [`acme-answers/`](acme-answers/) — company knowledge Q&A page, built two ways (Web SDK vs Chat API)
- [`index-custom-source/`](index-custom-source/) — index the Acme corpus with per-document permissions
- [`permissions-aware-rag/`](permissions-aware-rag/) — Glean Search as the retrieval layer for your own LLM app (Python + TypeScript)
- [`connect-mcp-hosts/`](connect-mcp-hosts/) — Glean MCP configs for Claude Code, Cursor, and Claude Desktop
- [`multi-step-agent/`](multi-step-agent/) — a Glean agent with a governed custom Tool, plus the graceful-denial branch
- [`a2a-client/`](a2a-client/) — call a Glean agent from an A2A client: card discovery, multi-turn, streaming
- [`no-code-pto-lookup-replit/`](no-code-pto-lookup-replit/) — prompt Replit Agent into an HR PTO/benefits lookup tool, zero hand-written code
- [`no-code-it-helpdesk-lovable/`](no-code-it-helpdesk-lovable/) — prompt Lovable into an IT helpdesk deflection page, zero hand-written code

---
name: agent_pattern_reliable_search_steps
description: Load when a step in the agent's process issues one or more search or data-retrieval queries — instead of describing only the outcome the step should achieve, also provide an example search query that helps achieve it; applies to steps using query DSLs (BigQuery SQL, SOQL, JQL) or app-native search syntax (Glean, GitHub, Slack).
---

# Pattern: reliable search steps

**Use when:** a step in the agent's process issues one or more search or data-retrieval queries, and the step is described only by its goal (e.g. "find the relevant tickets", "pull the account data", "fetch recent customer escalations from Slack") — leaving the agent to infer the query shape and where to look at runtime. Vague query steps are a top source of run-to-run variance and errors.

**What to do:** for each such step, describe the goal in prose and one or more example queries, including the specific sources to look at. The agent follows the step far more reliably when it has a concrete example to anchor on rather than inferring the query shape and sources from a goal description.

Types of queries and sources to anchor:

- Query DSLs: BigQuery SQL, SOQL (Salesforce), JQL (Jira)
- App-native search syntax: Glean search, GitHub search filters, Slack search
- Specific sources: Slack channels, Jira labels, GitHub file paths or repos during code search

**Scope it lightly:** provide an example query to guide the agent — not a mandate. Give enough for the agent to orient itself (the key query shape and, within the query, where to look), but leave room for it to adapt the exact query based on what it finds at runtime. The example is an anchor, not an exhaustive template the agent must follow verbatim.

**What NOT to do:** don't reference any parameter other than the query field — cursors, sort, limits, `after`/`before` bounds, etc... These are implementation details of the tool, and they drift — a parameter gets renamed or its default shifts, and the hardcoded instruction silently goes stale. Instead, say what it should achieve in prose (e.g. "last 2 hours, newest first") and let the agent map it at runtime.

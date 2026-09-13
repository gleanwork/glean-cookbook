---
name: agent_pattern_wide_research
description: Load when the agent performs multiple heavy research tasks expected to drive context usage above ~60% of the available limit, or when truncation/compaction has already been hit. Structure each task with isolation, a defined process, and a rich expected outcome so the parent receives actionable results without re-reading raw sources.
---

# Pattern: wide research via isolated tasks

**Use when:** the agent performs multiple heavy research tasks — each involving many queries, large result sets, or multi-source retrieval — that together are expected to push context usage above ~60% of the available limit. Also apply when the agent has already hit truncation or context compaction mid-run. Heavy research in a single context leaves less room for synthesis and risks earlier results being lost to truncation.

**What to do:** structure the agent instructions so each research task runs as an isolated subagent. The instruction block for this part of the agent should open with:

> "Run each task with isolation."

Then define each task with two parts:

1. **Process** — what to search, which sources to cover, what steps to follow within the task
2. **Expected outcome** — the specific, structured result the subagent must return; this should be rich enough that the parent agent can act on it directly without re-reading raw sources or filling in missing context

Vague expected outcomes ("summarize what you find") shift the hard work back to the parent and degrade the final output. Define outcomes concretely: required fields, format, what a complete answer looks like.

Do not add the Task tool to the agent's tool list or reference it by name in the prompt. The agent routes each task to a dynamic subagent automatically.

**When NOT to use it:** do not use this pattern for a sequential multi-step TODO process where one phase depends on the previous phase.

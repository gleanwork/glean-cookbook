---
name: agent_pattern_per_item_fanout
description: Load when a set of independent items must all go through the same multistep process — where each item requires more than one tool call and an LLM inference step — fan the work out via subagents for isolated context, parallelism, and per-item failure visibility. Not for simple single-step work.
---

# Pattern: multistep per-item fan-out

**Use when:** a set of items must all go through the same multistep process, where each item requires more than one tool call and an LLM inference step. Doing this in a plain loop tends to bloat context, run serially, and swallow per-item failures silently.

**What to do:** fan the per-item work out via subagents. Each item then:

- gets its own **isolated context**, so items don't contaminate each other,
- can run in **parallel** rather than one after another,
- has **observable per-item failures** — a failure on one item is visible rather than silently lost inside a loop.

**When NOT to use it:** simple single-step per-item work (one tool call, no LLM inference) doesn't need fan-out — the overhead isn't worth it. Also do not use it when the subagents would read essentially the same set of data to produce the final response. In that case, collect the shared evidence once and map it back to the items without using subagents. For example, to analyze progress across a user's goals, retrieve the prior week's calendar, Slack, Gmail, and PR activity once, then associate that activity with each goal instead of repeating the same cross-source research per goal. The pattern earns its cost only when each item is itself multistep (> 1 tool call + LLM inference).

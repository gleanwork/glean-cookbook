---
name: agent_pattern_batch_fanout
description: Load when per-item fanout would spawn more than ~50 subagents. Recommend that the agent choose per-item fanout or batching based on the item count, and group items into batches when the threshold is reached to reduce cost and limit concurrency pressure.
---

# Pattern: batched fanout for large item sets

**Use when:** the `agent_pattern_per_item_fanout` pattern applies but the item set is large. In the agent's instructions, define the item-count threshold for switching strategies — start with batching at more than ~50 items unless the workflow has a known different scaling point. Spawning one subagent per item at that scale drives up cost significantly and doesn't fully parallelize anyway: the platform caps the number of tasks running concurrently, so excess subagents queue rather than run in parallel.

**What to do:** add an explicit strategy choice to the agent's instructions: use per-item fanout below the threshold and batching at or above it. Group items into batches (typically 3–10 items per batch) and fan out one subagent per batch instead of one per item. Before choosing batching, inspect the subagent's input and output schema. Batching is valid only when the subagent accepts a collection of items and returns independently keyed results for each item. If it accepts only one item, update the subagent to support batch inputs before applying batching; otherwise retain per-item fanout. Each batch subagent processes its items sequentially and returns a combined result. This lowers total subagent count, reduces cost, and brings effective latency in line with actual platform concurrency limits.

Batch size depends on how much work each item involves: lighter per-item work tolerates larger batches; heavier per-item work benefits from smaller ones. Always start with batches of 3–5 and scale up only if the per-item work is light.

**When NOT to use it:** if the item set is under ~50 items, standard per-item fanout is fine — batching trades away per-item debugging visibility and quality (each item no longer gets its own isolated context and failure signal), and that trade isn't worth it at small scale.

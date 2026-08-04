// App-orchestrated path: this code owns the plan.
//
// Deterministic sequence — resolve, fan out, classify, rank, propose. The model is
// used for one thing: turning the selected evidence into a sentence. It never
// chooses the action, never ranks the causes, and never decides whether the
// evidence is sufficient. That division is the reason this path is the default: the
// governance-critical decisions are in code you can read and test.

import { chat } from '../platform.ts';
import type { Alarm } from '../evidence.ts';
import type { ServiceRecord } from '../registry.ts';
import { triage } from '../triage.ts';
import type { Orchestrated, Orchestrator } from './index.ts';

export const appOrchestrated: Orchestrator = {
  id: 'app',
  label: 'App-orchestrated (Platform Search + Chat)',
  available: () => true,

  async run(alarm: Alarm, service: ServiceRecord): Promise<Orchestrated> {
    const result = await triage(alarm, service);
    const notes: string[] = [];

    const supported = result.hypotheses.filter(
      (hypothesis) => hypothesis.confidence === 'supported',
    );
    const procedure = result.procedure;

    if (supported.length === 0) {
      notes.push(
        'No past incident matches this alarm signature, so no probable cause is asserted.',
      );
    }
    if (!procedure) {
      notes.push(
        'No runbook was retrieved, so the proposed action falls back to filing a ticket for a human.',
      );
    }

    // The action is chosen from evidence, in code. A runbook that documents a
    // rollback licenses proposing one; without it, the only defensible proposal is
    // to get a person involved.
    const canRollback = Boolean(
      procedure && /rollback/iu.test(`${procedure.title} ${procedure.snippet}`),
    );

    const summaryPrompt = [
      'Summarise this incident for an on-call engineer in two sentences.',
      'Use ONLY the evidence provided. Do not state a root cause unless one is listed as supported.',
      'If no cause is supported, say the cause is not yet established.',
      '',
      `Alarm: ${alarm.summary} (${alarm.severity}, ${alarm.service})`,
      `Supported cause: ${supported.length > 0 ? supported[0].cause : 'none'}`,
      `Evidence: ${result.evidence.map((hit) => `${hit.role}:${hit.title}`).join('; ')}`,
    ].join('\n');

    const { text } = await chat(summaryPrompt, `triage:${alarm.id}`);

    const detail = [
      text.trim() ||
        `${alarm.summary}. Cause not established from the indexed evidence.`,
      '',
      supported.length > 0
        ? `Precedent: ${supported[0].cause} — ${supported[0].reason}`
        : 'No matching precedent in the corpus.',
      procedure ? `Runbook: ${procedure.title} (${procedure.url})` : '',
    ]
      .filter(Boolean)
      .join('\n');

    return {
      triage: result,
      planner: 'app',
      notes,
      proposed: {
        actionId: canRollback ? 'draft-fix-pr' : 'file-tracking-ticket',
        summary: canRollback
          ? `${alarm.service}: draft fix for ${alarm.kind} alarm on ${alarm.metric}`
          : `${alarm.service}: investigate ${alarm.kind} alarm on ${alarm.metric}`,
        detail,
        basis: procedure
          ? { title: procedure.title, url: procedure.url }
          : undefined,
      },
    };
  },
};

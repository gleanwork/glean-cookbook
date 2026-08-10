// Agent-orchestrated path: a Glean agent owns the plan.
//
// The run engine decides what to retrieve and how to summarise. This code's job
// shrinks to translating the agent's output into a *proposal*, and then handing it
// to exactly the same approval gate.
//
// The important part is what does NOT move: the agent cannot invent an action. It
// names one by id, and an id outside the registry is refused at proposal time. An
// agent that can describe arbitrary actions into existence is an agent with
// production access, whatever the prompt says.
//
// Evidence classification also stays here rather than being delegated. Asking the
// planner to grade its own evidence is asking the wrong entity.

import type { Alarm } from '../evidence.ts';
import { runAgent } from '../platform.ts';
import type { ServiceRecord } from '../registry.ts';
import { triage } from '../triage.ts';
import { ACTIONS } from '../actions.ts';
import type { Orchestrated, Orchestrator } from './index.ts';

/** Pull `action: <id>` out of the agent's reply, tolerating surrounding prose. */
export function parseProposedActionId(reply: string): string | undefined {
  const explicit = /action\s*[:=]\s*([a-z][a-z0-9-]*)/iu.exec(reply)?.[1];
  if (explicit) return explicit.toLowerCase();
  // Fall back to a bare mention of a registered id, but never to a guess.
  return ACTIONS.map((action) => action.id).find((id) => reply.includes(id));
}

export const gleanAgent: Orchestrator = {
  id: 'agent',
  label: 'Glean agent (Agent API owns planning)',
  available: () =>
    Boolean(process.env.GLEAN_AGENT_ID) ||
    process.env.GLEAN_USE_FIXTURE === 'true',

  async run(alarm: Alarm, service: ServiceRecord): Promise<Orchestrated> {
    const agentId = process.env.GLEAN_AGENT_ID ?? 'fixture-agent';
    const notes: string[] = [];

    // Evidence is still classified locally, so both paths are judged identically.
    const result = await triage(alarm, service);

    const ask = [
      `Triage this incident and propose exactly one action.`,
      `Reply with a short summary, then a final line "action: <id>".`,
      `Valid ids: ${ACTIONS.map((action) => action.id).join(', ')}.`,
      `Do not propose any other action.`,
      '',
      `Service: ${alarm.service} (${service.tier}, owner ${service.techLead})`,
      `Alarm: ${alarm.summary} (${alarm.severity})`,
    ].join('\n');

    const reply = await runAgent(agentId, ask, `triage:${alarm.id}`);
    const actionId = parseProposedActionId(reply);

    if (!actionId) {
      notes.push(
        'The agent named no registered action, so this falls back to filing a ticket for a human.',
      );
    } else if (!ACTIONS.some((action) => action.id === actionId)) {
      // Kept as the agent said it; awaitApproval refuses and audits it. Silently
      // swapping in a safe action would hide that the agent went off-script.
      notes.push(
        `The agent proposed "${actionId}", which is not registered. It will be refused.`,
      );
    }

    const supported = result.hypotheses.filter(
      (hypothesis) => hypothesis.confidence === 'supported',
    );

    return {
      triage: result,
      planner: 'agent',
      notes,
      proposed: {
        actionId: actionId ?? 'file-tracking-ticket',
        summary: `${alarm.service}: ${alarm.kind} alarm on ${alarm.metric}`,
        detail: [
          reply.trim() || `${alarm.summary}.`,
          '',
          supported.length > 0
            ? `Precedent: ${supported[0].cause} — ${supported[0].reason}`
            : 'No matching precedent in the corpus.',
        ].join('\n'),
        basis: result.procedure
          ? { title: result.procedure.title, url: result.procedure.url }
          : undefined,
      },
    };
  },
};

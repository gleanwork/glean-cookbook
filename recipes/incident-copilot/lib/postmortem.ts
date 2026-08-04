// Post-resolution: draft an incident timeline as a postmortem starting point.
//
// Built from the audit log and the channel, not from the model's recollection. The
// timeline is the one artifact here that must be literally true — it is what the
// review meeting argues over — so it is assembled from recorded events, and the
// model is only asked for the prose summary around them.

import { chat } from './platform.ts';
import { auditLog, type Incident } from './state.ts';

export function timeline(incident: Incident): string[] {
  const events = [
    ...incident.channel.map((post) => ({
      at: post.at,
      text: `[${post.kind}] ${post.text}`,
    })),
    ...auditLog(incident.id).map((entry) => ({
      at: entry.at,
      text: `[audit] ${entry.actor} ${entry.outcome} ${entry.action}${entry.detail ? ` — ${entry.detail}` : ''}`,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return events.map((event) => `${event.at}  ${event.text}`);
}

export async function draft(incident: Incident): Promise<string> {
  const facts = timeline(incident);
  const supported = incident.hypotheses.filter(
    (hypothesis) => hypothesis.confidence === 'supported',
  );

  const prompt = [
    'Draft the opening section of an incident postmortem from these recorded events.',
    'Use ONLY the events listed. Do not infer a root cause that is not stated.',
    'If no cause is listed, write that the cause is still unconfirmed.',
    'Cover: what fired, what was done, who approved it, and what is still open.',
    '',
    `Incident: ${incident.id} on ${incident.service.service} (${incident.alarm.severity})`,
    `Evidence-supported cause: ${supported.length > 0 ? supported[0].cause : 'none established'}`,
    '',
    'Events:',
    ...facts,
  ].join('\n');

  const { text } = await chat(prompt, `postmortem:${incident.alarm.id}`);
  const body = text.trim();

  // The timeline is authoritative even when the narrative is unavailable, so a
  // failed or empty Chat response degrades to the recorded facts rather than
  // producing nothing.
  const header = [
    `# ${incident.id} — ${incident.service.service}`,
    '',
    body.length > 0
      ? body
      : '_Narrative unavailable; the recorded timeline below is authoritative._',
    '',
    '## Timeline',
    '',
  ].join('\n');

  return `${header}${facts.map((line) => `- ${line}`).join('\n')}\n`;
}

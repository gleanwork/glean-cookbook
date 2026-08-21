// Service registry: resolve the alarming service to who owns it, what it depends
// on, and which documents describe it — before any retrieval fan-out.
//
// The registry is read from the indexed service catalog rather than hardcoded,
// because that is the point: the catalog your engineers already maintain becomes
// the thing that decides who is allowed to approve an action. It also means the
// authorization boundary is only as good as the catalog, which is worth knowing.

import { search } from './platform.ts';

export interface ServiceRecord {
  service: string;
  tier: string;
  techLead: string;
  onCall: string;
  dependencies: string[];
  escalateAfterMinutes: number;
  escalateTo: string;
  catalogUrl: string;
}

function approverDomain(): string {
  return process.env.APPROVER_EMAIL_DOMAIN ?? 'sample.example.com';
}

/** Maps a display name in the catalog prose to the directory identity. */
function toEmail(name: string): string {
  return `${name.trim().toLowerCase().replace(/\s+/gu, '.')}@${approverDomain()}`;
}

/** A stable fixture identity that is neither owner nor on call. */
export function outsiderActor(): string {
  return `not.on.call@${approverDomain()}`;
}

function firstMatch(text: string, pattern: RegExp): string | undefined {
  return pattern.exec(text)?.[1]?.trim();
}

export function parseCatalog(
  service: string,
  title: string,
  url: string,
  body: string,
): ServiceRecord {
  const techLead = firstMatch(body, /Tech lead:\s*([^.]+)\./u);
  const onCall = firstMatch(body, /On-call this week:\s*([^.]+)\./u);
  const tier = firstMatch(body, /Tier:\s*([^(.]+)/u);
  const dependencies = (firstMatch(body, /Dependencies:\s*([^.]+)\./u) ?? '')
    .split(',')
    .map((entry) => entry.replace(/\([^)]*\)/gu, '').trim())
    .filter(Boolean);
  const escalateAfter = firstMatch(body, /unresolved after (\d+)\s*minutes/u);
  const escalateTo = firstMatch(
    body,
    /then\s+([A-Z][a-z]+\s+[A-Z][a-z]+)\s+if unresolved/u,
  );

  if (!onCall || !techLead) {
    throw new Error(
      `Catalog entry for ${service} is missing an on-call engineer or tech lead; ` +
        'the approval gate has no one to authorize, so triage stops here rather ' +
        'than falling back to "anyone may approve".',
    );
  }

  return {
    service,
    tier: tier ?? 'unknown',
    techLead: toEmail(techLead),
    onCall: toEmail(onCall),
    dependencies,
    escalateAfterMinutes: escalateAfter ? Number(escalateAfter) : 30,
    escalateTo: escalateTo ? toEmail(escalateTo) : toEmail(techLead),
    catalogUrl: url,
  };
}

export async function resolve(service: string): Promise<ServiceRecord> {
  const hits = await search(`${service} service catalog entry`);
  const entry = hits.find((hit) => hit.url.includes('/services/'));
  if (!entry) {
    throw new Error(
      `No service catalog entry found for ${service}. Without one there is no ` +
        'owner, no escalation path, and no one authorized to approve an action.',
    );
  }
  return parseCatalog(service, entry.title, entry.url, entry.snippet);
}

/**
 * Who may approve. The ticket restricts this to the on-call engineer and service
 * owners; nobody else, including whoever happens to have the dashboard open.
 */
export function mayApprove(record: ServiceRecord, actor: string): boolean {
  return actor === record.onCall || actor === record.techLead;
}

export function approvers(record: ServiceRecord): string[] {
  return Array.from(new Set([record.onCall, record.techLead]));
}

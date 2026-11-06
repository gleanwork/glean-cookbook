import type { UsageRequestsApi } from './api.js';
import type { Command } from './cli.js';
import {
  approvalBlocker,
  currentPeriod,
  denialBlocker,
  type AdministrativeLimitIncreaseRequest,
  type LimitEvaluation,
  type PersonalLimitIncreaseRequest,
  type RequestPage,
} from './requests.js';

const PAGE_SIZE = 25;

export interface Person {
  display_name: string;
  email?: string;
}

export interface Deps {
  requests: UsageRequestsApi;
  /** Resolves a user ID, or undefined when the directory no longer has it. */
  lookupUser: (userId: string) => Promise<Person | undefined>;
  log: (line: string) => void;
  /** Undefined when input is not interactive. */
  confirm?: (question: string) => Promise<boolean>;
  now?: () => Date;
}

async function collect<T>(
  fetchPage: (cursor?: string) => Promise<RequestPage<T>>,
  pages: number,
) {
  const results: T[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < pages; page += 1) {
    const response = await fetchPage(cursor);
    results.push(...response.results);
    if (!response.has_more) return { results, more: false };
    cursor = response.next_cursor ?? undefined;
  }
  return { results, more: true };
}

function directory(lookupUser: Deps['lookupUser']) {
  const cache = new Map<string, Promise<string>>();
  return (userId: string) => {
    let name = cache.get(userId);
    if (!name) {
      name = lookupUser(userId).then((person) =>
        person
          ? `${person.display_name}${person.email ? ` <${person.email}>` : ''}`
          : `${userId} (not in the directory)`,
      );
      cache.set(userId, name);
    }
    return name;
  };
}

async function describe(
  request: AdministrativeLimitIncreaseRequest | PersonalLimitIncreaseRequest,
  nameOf: (userId: string) => Promise<string>,
) {
  const lines = [
    `${request.request_id}  ${request.status}  ${request.period}  client ${request.client_id}`,
  ];
  if (request.entity_type === 'USER') {
    lines.push(`  For: ${await nameOf(request.entity_id)}`);
    if (request.requester_user_id !== request.entity_id) {
      lines.push(`  Filed by: ${await nameOf(request.requester_user_id)}`);
    }
  } else {
    lines.push(
      `  For: agent ${request.entity_id}`,
      `  Filed by: ${await nameOf(request.requester_user_id)}`,
    );
  }
  lines.push(`  Filed: ${request.created_at}`);
  if (request.business_justification) {
    lines.push(`  Why: ${request.business_justification}`);
  }
  if (request.approved_increase_amount !== undefined) {
    lines.push(`  Approved increase: ${request.approved_increase_amount}`);
  }
  if (request.resolution_note) lines.push(`  Note: ${request.resolution_note}`);
  if ('resolved_by_user_id' in request && request.resolved_by_user_id) {
    lines.push(`  Resolved by: ${await nameOf(request.resolved_by_user_id)}`);
  }
  return lines;
}

function finiteUnits(evaluation: LimitEvaluation) {
  return [
    ...new Set(
      evaluation.effective_limits
        .filter((limit) => limit.mode === 'FINITE' && limit.unit)
        .map((limit) => limit.unit as string),
    ),
  ];
}

function describeEvaluation(evaluation: LimitEvaluation, clientId: string) {
  const lines = [
    `Current limits on ${clientId} this month: ${evaluation.decision}`,
  ];
  for (const limit of evaluation.effective_limits) {
    lines.push(
      limit.mode === 'FINITE'
        ? `  Remaining: ${limit.remaining} ${limit.unit} (${limit.enforcement})`
        : '  Remaining: unlimited',
    );
  }
  for (const limit of evaluation.evaluated_limits) {
    const cap =
      limit.value.mode === 'FINITE'
        ? `${limit.value.amount} ${limit.value.unit}`
        : 'unlimited';
    lines.push(
      `  ${limit.target.type} limit: ${cap}, used ${limit.used} (${limit.decision})`,
    );
  }
  if (finiteUnits(evaluation).length === 0) {
    lines.push(
      '  No finite limit applies, so an approved increase would not change anything.',
    );
  }
  return lines;
}

async function confirmWrite(deps: Deps, yes: boolean, question: string) {
  return yes || (deps.confirm ? deps.confirm(question) : false);
}

export async function run(command: Command, deps: Deps) {
  const { requests, log } = deps;
  const now = deps.now?.() ?? new Date();
  const nameOf = directory(deps.lookupUser);
  const print = (lines: string[]) => {
    for (const line of lines) log(line);
  };
  if (
    (command.name === 'approve' || command.name === 'deny') &&
    !command.yes &&
    !deps.confirm
  ) {
    throw new Error('Input is not interactive. Pass --yes to confirm.');
  }

  switch (command.name) {
    case 'queue':
    case 'mine': {
      const { results, more } = await collect((cursor) => {
        const options = {
          statuses: command.statuses,
          cursor,
          pageSize: PAGE_SIZE,
        };
        return command.name === 'queue'
          ? requests.listQueue(options)
          : requests.listMine(options);
      }, command.pages);
      const label = command.statuses.length
        ? command.statuses.join(' or ')
        : 'any status';
      if (results.length === 0) {
        log(`No requests with ${label}.`);
        return;
      }
      log(
        `${results.length} ${results.length === 1 ? 'request' : 'requests'} with ${label}:\n`,
      );
      for (const request of results) {
        print([...(await describe(request, nameOf)), '']);
      }
      if (more) {
        log(
          `More requests are available. Pass --pages ${command.pages + 1} to read the next page.`,
        );
      }
      return;
    }

    case 'show': {
      const request = await requests.getForReview(command.requestId);
      print(await describe(request, nameOf));
      if (request.status === 'PENDING' && request.entity_type === 'USER') {
        const evaluation = await requests.evaluateUser(
          request.entity_id,
          request.client_id,
        );
        print(['', ...describeEvaluation(evaluation, request.client_id)]);
      }
      const blocker = approvalBlocker(request, now);
      if (request.status === 'PENDING' && blocker) log(`\n${blocker}`);
      return;
    }

    case 'approve': {
      const request = await requests.getForReview(command.requestId);
      const blocker = approvalBlocker(request, now);
      if (blocker) throw new Error(blocker);
      const evaluation = await requests.evaluateUser(
        request.entity_id,
        request.client_id,
      );
      print([
        ...(await describe(request, nameOf)),
        '',
        ...describeEvaluation(evaluation, request.client_id),
        '',
      ]);
      const units = finiteUnits(evaluation);
      const amount = `${command.amount}${units.length === 1 ? ` ${units[0]}` : ''}`;
      const confirmed = await confirmWrite(
        deps,
        command.yes,
        `Add ${amount} for ${request.period} only, for ${await nameOf(request.entity_id)} on ${request.client_id}? [y/N] `,
      );
      if (!confirmed) {
        log('Nothing changed.');
        return;
      }
      const resolved = await requests.resolve(request.request_id, {
        status: 'APPROVED',
        approved_increase_amount: command.amount,
        scope: 'PERIOD',
      });
      log(
        `Approved ${resolved.request_id}: ${resolved.approved_increase_amount} more for ${resolved.period}. The standing limit is unchanged.`,
      );
      return;
    }

    case 'deny': {
      const request = await requests.getForReview(command.requestId);
      const blocker = denialBlocker(request);
      if (blocker) throw new Error(blocker);
      print([...(await describe(request, nameOf)), '']);
      const confirmed = await confirmWrite(
        deps,
        command.yes,
        `Deny this request${command.note ? ' with your note' : ''}? [y/N] `,
      );
      if (!confirmed) {
        log('Nothing changed.');
        return;
      }
      const resolved = await requests.resolve(
        request.request_id,
        command.note
          ? { status: 'DENIED', resolution_note: command.note }
          : { status: 'DENIED' },
      );
      log(`Denied ${resolved.request_id}.`);
      return;
    }

    case 'request': {
      const created = await requests.create(
        command.justification
          ? {
              client_id: command.clientId,
              business_justification: command.justification,
            }
          : { client_id: command.clientId },
      );
      log(
        `Filed ${created.request_id} for ${created.client_id} in ${created.period}. A billing admin reviews it; check its status with npm start -- mine.`,
      );
      return;
    }

    case 'verify': {
      await requests.listMine({ pageSize: 1 });
      log('Your requests: readable.');
      const queue = await requests.listQueue({
        statuses: ['PENDING'],
        pageSize: 1,
      });
      log(
        queue.results.length
          ? 'Billing queue: readable, with pending requests.'
          : 'Billing queue: readable, with no pending requests.',
      );
      log(
        `Approvals this month apply to ${currentPeriod(now)} requests. Verified; nothing was changed.`,
      );
      return;
    }
  }
}

import meow from 'meow';
import {
  parseAmount,
  parseClientId,
  REQUEST_STATUSES,
  type RequestStatus,
} from './requests.js';

const HELP = `
  Usage
    $ npm start -- <command> [options]

  Billing reviewer commands
    queue                       List requests waiting for a decision
    show <request-id>           Show a request with the requester's current limit
    approve <request-id>        Approve a one-month increase; requires --amount
    deny <request-id>           Deny a request, optionally with --note

  Member commands
    request                     Ask for more usage on a spend client; requires --client
    mine                        List your own requests

  Other
    verify                      Read-only check of your access and the request APIs

  Options
    --status         Comma-separated statuses for queue and mine
                     (PENDING, APPROVED, DENIED; queue defaults to PENDING)
    --pages          Number of pages to fetch for queue and mine (default: 1)
    --amount         Increase to approve, in the unit of the requester's limit
    --note           Reason recorded with a denial
    --client         Spend client ID for request, such as glean
    --justification  Why you need more usage, for request
    --yes            Approve or deny without the confirmation prompt

  Configuration
    GLEAN_SERVER_URL and GLEAN_API_TOKEN are read from .env or the environment.

  Examples
    $ npm start -- queue
    $ npm start -- approve <request-id> --amount 25
    $ npm start -- request --client glean --justification "Quarter-end analysis"
`;

export type Command =
  | { name: 'queue' | 'mine'; statuses: RequestStatus[]; pages: number }
  | { name: 'show'; requestId: string }
  | { name: 'approve'; requestId: string; amount: string; yes: boolean }
  | { name: 'deny'; requestId: string; note?: string; yes: boolean }
  | { name: 'request'; clientId: string; justification?: string }
  | { name: 'verify' };

function optionalText(flag: string, value: string | undefined) {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`--${flag} must not be blank.`);
  return trimmed;
}

function parseStatuses(value: string | undefined, fallback: RequestStatus[]) {
  if (value === undefined) return fallback;
  const statuses = value
    .split(',')
    .map((status) => status.trim().toUpperCase());
  if (
    statuses.some(
      (status) => !REQUEST_STATUSES.includes(status as RequestStatus),
    )
  ) {
    throw new Error(`--status accepts ${REQUEST_STATUSES.join(', ')}.`);
  }
  return [...new Set(statuses)] as RequestStatus[];
}

export function parseCommand(argv = process.argv.slice(2)): Command {
  const cli = meow(HELP, {
    importMeta: import.meta,
    argv,
    flags: {
      status: { type: 'string' },
      pages: { type: 'number', default: 1 },
      amount: { type: 'string' },
      note: { type: 'string' },
      client: { type: 'string' },
      justification: { type: 'string' },
      yes: { type: 'boolean', default: false },
    },
  });

  const [name, requestId, ...extra] = cli.input;
  const { flags } = cli;
  const withId = () => {
    if (!requestId?.trim()) throw new Error(`${name} needs a request ID.`);
    if (extra.length > 0) throw new Error(`Unexpected argument: ${extra[0]}`);
    return requestId.trim();
  };
  const withoutId = () => {
    if (requestId !== undefined) {
      throw new Error(`Unexpected argument: ${requestId}`);
    }
  };

  switch (name) {
    case 'queue':
    case 'mine': {
      withoutId();
      if (
        !Number.isInteger(flags.pages) ||
        flags.pages < 1 ||
        flags.pages > 10
      ) {
        throw new Error('--pages must be an integer from 1 to 10.');
      }
      return {
        name,
        statuses: parseStatuses(
          flags.status,
          name === 'queue' ? ['PENDING'] : [],
        ),
        pages: flags.pages,
      };
    }
    case 'show':
      return { name, requestId: withId() };
    case 'approve': {
      const id = withId();
      if (flags.note !== undefined) {
        throw new Error('An approval cannot record a note; only a denial can.');
      }
      if (flags.amount === undefined) {
        throw new Error('approve needs --amount.');
      }
      return {
        name,
        requestId: id,
        amount: parseAmount(flags.amount),
        yes: flags.yes,
      };
    }
    case 'deny': {
      const id = withId();
      if (flags.amount !== undefined) {
        throw new Error('A denial cannot record --amount.');
      }
      const note = optionalText('note', flags.note);
      if (note && note.length > 4096) {
        throw new Error('--note must be at most 4096 characters.');
      }
      return { name, requestId: id, note, yes: flags.yes };
    }
    case 'request': {
      withoutId();
      if (flags.client === undefined)
        throw new Error('request needs --client.');
      const justification = optionalText('justification', flags.justification);
      if (justification && justification.length > 4096) {
        throw new Error('--justification must be at most 4096 characters.');
      }
      return {
        name,
        clientId: parseClientId(flags.client),
        justification,
      };
    }
    case 'verify':
      withoutId();
      return { name };
    case undefined:
      return cli.showHelp(0);
    default:
      throw new Error(`Unknown command: ${name}. Run npm start -- --help.`);
  }
}

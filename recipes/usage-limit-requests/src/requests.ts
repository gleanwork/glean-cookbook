export const REQUEST_STATUSES = ['PENDING', 'APPROVED', 'DENIED'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/** The view a requester gets from /api/usage/limit-increase-requests. */
export interface PersonalLimitIncreaseRequest {
  request_id: string;
  entity_type: 'USER' | 'AGENT';
  entity_id: string;
  client_id: string;
  requester_user_id: string;
  period: string;
  status: RequestStatus;
  business_justification?: string;
  approved_increase_amount?: string;
  resolution_note?: string;
  created_at: string;
  updated_at?: string;
}

/** The billing view adds who resolved a request and how broadly. */
export interface AdministrativeLimitIncreaseRequest extends PersonalLimitIncreaseRequest {
  resolved_by_user_id?: string;
  scope?: 'PERIOD' | 'ONGOING';
  resolution_target?: 'USER' | 'ALL' | 'DEPARTMENT' | 'GROUP';
  resolution_target_id?: string;
}

export interface RequestPage<T> {
  results: T[];
  has_more: boolean;
  next_cursor?: string | null;
  request_id: string;
}

export type ResolveRequest =
  | { status: 'APPROVED'; approved_increase_amount: string; scope: 'PERIOD' }
  | { status: 'DENIED'; resolution_note?: string };

export interface PersonalRequestCreate {
  client_id: string;
  business_justification?: string;
}

export interface HeadroomValue {
  mode: 'FINITE' | 'UNLIMITED';
  remaining?: string;
  unit?: string;
  enforcement?: string;
}

export interface EvaluatedLimit {
  target: { type: string };
  value: { mode: 'FINITE' | 'UNLIMITED'; amount?: string; unit?: string };
  used: string;
  decision: string;
}

/** The fields of an admin limit evaluation that a reviewer needs. */
export interface LimitEvaluation {
  decision: string;
  applicable_policy_count: number;
  effective_limits: HeadroomValue[];
  evaluated_limits: EvaluatedLimit[];
}

export class ContractError extends Error {}

const POSITIVE_AMOUNT = /^([1-9][0-9]*(\.[0-9]+)?|0\.[0-9]*[1-9][0-9]*)$/u;
const RECORDED_AMOUNT = /^-?([1-9][0-9]*(\.[0-9]+)?|0\.[0-9]*[1-9][0-9]*)$/u;
const PERIOD = /^[0-9]{4}-(0[1-9]|1[0-2])$/u;
const CONTROL_CHARACTERS = /[\x00-\x1f\x7f]/u;

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonblank(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function optionalString(record: Json, key: string) {
  const value = record[key];
  if (value !== undefined && typeof value !== 'string') {
    throw new ContractError(`Request field ${key} must be a string.`);
  }
}

export function parsePersonalRequest(
  value: unknown,
): PersonalLimitIncreaseRequest {
  if (!isObject(value)) throw new ContractError('Request must be an object.');
  for (const key of [
    'request_id',
    'entity_id',
    'client_id',
    'requester_user_id',
    'created_at',
  ]) {
    if (!nonblank(value[key])) {
      throw new ContractError(`Request is missing ${key}.`);
    }
  }
  if (value.entity_type !== 'USER' && value.entity_type !== 'AGENT') {
    throw new ContractError('Request entity_type must be USER or AGENT.');
  }
  if (typeof value.period !== 'string' || !PERIOD.test(value.period)) {
    throw new ContractError('Request period must be YYYY-MM.');
  }
  if (!REQUEST_STATUSES.includes(value.status as RequestStatus)) {
    throw new ContractError('Request status is not recognized.');
  }
  for (const key of [
    'business_justification',
    'resolution_note',
    'updated_at',
  ]) {
    optionalString(value, key);
  }
  const amount = value.approved_increase_amount;
  if (
    (value.status === 'APPROVED') !==
    (typeof amount === 'string' && RECORDED_AMOUNT.test(amount))
  ) {
    throw new ContractError(
      'Request approved_increase_amount must be present exactly when it is APPROVED.',
    );
  }
  return value as unknown as PersonalLimitIncreaseRequest;
}

export function parseAdministrativeRequest(
  value: unknown,
): AdministrativeLimitIncreaseRequest {
  const request = parsePersonalRequest(value) as Json &
    PersonalLimitIncreaseRequest;
  for (const key of ['resolved_by_user_id', 'resolution_target_id']) {
    optionalString(request, key);
  }
  if (
    (request.status === 'APPROVED') !==
    (request.scope === 'PERIOD' || request.scope === 'ONGOING')
  ) {
    throw new ContractError(
      'Request scope must be present exactly when it is APPROVED.',
    );
  }
  return request;
}

export function parsePage<T>(
  value: unknown,
  parseItem: (item: unknown) => T,
): RequestPage<T> {
  if (
    !isObject(value) ||
    !Array.isArray(value.results) ||
    typeof value.has_more !== 'boolean' ||
    !nonblank(value.request_id) ||
    (value.has_more && !nonblank(value.next_cursor))
  ) {
    throw new ContractError('Malformed request page.');
  }
  return {
    results: value.results.map(parseItem),
    has_more: value.has_more,
    next_cursor: value.has_more ? (value.next_cursor as string) : null,
    request_id: value.request_id,
  };
}

export function parseResource<T>(
  value: unknown,
  parseItem: (item: unknown) => T,
): T {
  if (!isObject(value) || !nonblank(value.request_id)) {
    throw new ContractError('Malformed request response.');
  }
  return parseItem(value.request);
}

export function parseEvaluation(value: unknown): LimitEvaluation {
  if (
    !isObject(value) ||
    !nonblank(value.decision) ||
    !Number.isInteger(value.applicable_policy_count) ||
    !Array.isArray(value.effective_limits) ||
    !Array.isArray(value.evaluated_limits) ||
    value.effective_limits.some((limit) => !isObject(limit)) ||
    value.evaluated_limits.some(
      (limit) =>
        !isObject(limit) ||
        !isObject(limit.target) ||
        !isObject(limit.value) ||
        typeof limit.used !== 'string',
    )
  ) {
    throw new ContractError('Malformed limit evaluation.');
  }
  return value as unknown as LimitEvaluation;
}

/** The UTC month the server stamps on new requests and requires for approval. */
export function currentPeriod(now = new Date()) {
  return now.toISOString().slice(0, 7);
}

export function parseAmount(text: string) {
  const amount = text.trim();
  if (!POSITIVE_AMOUNT.test(amount)) {
    throw new Error(
      '--amount must be a positive plain decimal, such as 25 or 12.50.',
    );
  }
  return amount;
}

export function parseClientId(text: string) {
  const clientId = text.trim();
  if (
    !clientId ||
    clientId.length > 256 ||
    CONTROL_CHARACTERS.test(clientId) ||
    clientId === '__deleted_clients__'
  ) {
    throw new Error('--client must be a spend client ID, such as glean.');
  }
  return clientId;
}

/**
 * Explains why the API would reject or not honor an approval, before the
 * reviewer is asked to confirm it.
 */
export function approvalBlocker(
  request: PersonalLimitIncreaseRequest,
  now = new Date(),
) {
  if (request.status !== 'PENDING') {
    return `Request ${request.request_id} is already ${request.status}.`;
  }
  if (request.entity_type === 'AGENT') {
    return 'Approving an agent request records the decision but adds no capacity for the agent. Raise the agent limit with the usage limits API, or deny the request.';
  }
  const period = currentPeriod(now);
  if (request.period !== period) {
    return `Request ${request.request_id} is for ${request.period}. Approval applies only to the request's own month, and only while it is the current UTC month (${period}). Deny it and ask the requester to file a new one.`;
  }
  return undefined;
}

export function denialBlocker(request: PersonalLimitIncreaseRequest) {
  return request.status === 'PENDING'
    ? undefined
    : `Request ${request.request_id} is already ${request.status}.`;
}

import type {
  AdministrativeLimitIncreaseRequest,
  LimitEvaluation,
  PersonalLimitIncreaseRequest,
} from './requests.js';

export const ORIGIN = 'https://example-be.glean.com';
export const NOW = new Date('2026-11-06T12:00:00Z');

export function personalRequest(
  overrides: Partial<PersonalLimitIncreaseRequest> = {},
): PersonalLimitIncreaseRequest {
  return {
    request_id: 'req-1',
    entity_type: 'USER',
    entity_id: 'user-1',
    client_id: 'glean',
    requester_user_id: 'user-1',
    period: '2026-11',
    status: 'PENDING',
    business_justification: 'Quarter-end analysis',
    created_at: '2026-11-05T09:30:00Z',
    ...overrides,
  };
}

export function adminRequest(
  overrides: Partial<AdministrativeLimitIncreaseRequest> = {},
): AdministrativeLimitIncreaseRequest {
  return personalRequest(overrides);
}

export const EVALUATION: LimitEvaluation = {
  decision: 'BLOCKED',
  applicable_policy_count: 1,
  effective_limits: [
    { mode: 'FINITE', remaining: '0', unit: 'USD', enforcement: 'HARD' },
  ],
  evaluated_limits: [
    {
      target: { type: 'DEFAULT_USER' },
      value: { mode: 'FINITE', amount: '50', unit: 'USD' },
      used: '50',
      decision: 'BLOCKED',
    },
  ],
};

export function page<T>(results: T[], nextCursor?: string) {
  return {
    results,
    has_more: nextCursor !== undefined,
    next_cursor: nextCursor ?? null,
    request_id: 'trace-page',
  };
}

import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import { adminRequest, NOW, personalRequest } from './fixtures.js';
import {
  approvalBlocker,
  ContractError,
  currentPeriod,
  parseAdministrativeRequest,
  parseAmount,
  parseClientId,
  parsePage,
  parsePersonalRequest,
} from './requests.js';

describe('request records', () => {
  test('reads the personal view, which has no resolver or breadth', () => {
    const request = personalRequest({
      status: 'APPROVED',
      approved_increase_amount: '25',
      resolution_note: undefined,
    });
    assert.deepEqual(parsePersonalRequest(request), request);
  });

  test('reads the billing view with its approval fields', () => {
    const request = adminRequest({
      status: 'APPROVED',
      approved_increase_amount: '-5',
      scope: 'PERIOD',
      resolved_by_user_id: 'admin-1',
    });
    assert.deepEqual(parseAdministrativeRequest(request), request);
  });

  test('rejects an approval without its amount or scope', () => {
    assert.throws(
      () => parsePersonalRequest(personalRequest({ status: 'APPROVED' })),
      ContractError,
    );
    assert.throws(
      () =>
        parseAdministrativeRequest(
          adminRequest({ status: 'APPROVED', approved_increase_amount: '5' }),
        ),
      /scope/,
    );
  });

  test('rejects a page that claims more results without a cursor', () => {
    assert.throws(
      () =>
        parsePage(
          { results: [], has_more: true, request_id: 'trace' },
          parsePersonalRequest,
        ),
      /Malformed request page/,
    );
  });
});

describe('approval rules', () => {
  test('uses the UTC month', () => {
    assert.equal(
      currentPeriod(new Date('2026-11-30T23:30:00-05:00')),
      '2026-12',
    );
  });

  test('allows a pending user request for the current month', () => {
    assert.equal(approvalBlocker(personalRequest(), NOW), undefined);
  });

  test('refuses requests the API cannot honor', () => {
    assert.match(
      approvalBlocker(personalRequest({ entity_type: 'AGENT' }), NOW) ?? '',
      /adds no capacity/,
    );
    assert.match(
      approvalBlocker(personalRequest({ period: '2026-10' }), NOW) ?? '',
      /current UTC month \(2026-11\)/,
    );
    assert.match(
      approvalBlocker(personalRequest({ status: 'DENIED' }), NOW) ?? '',
      /already DENIED/,
    );
  });

  test('accepts only positive plain decimal amounts', () => {
    assert.equal(parseAmount(' 12.50 '), '12.50');
    for (const amount of ['0', '-5', '1e3', '01', '12.', '']) {
      assert.throws(() => parseAmount(amount), /positive plain decimal/);
    }
  });

  test('rejects client IDs the API reserves or cannot store', () => {
    assert.equal(parseClientId('claude_code'), 'claude_code');
    for (const clientId of ['__deleted_clients__', 'bad\nid', ' ']) {
      assert.throws(() => parseClientId(clientId), /spend client ID/);
    }
  });
});

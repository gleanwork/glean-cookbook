#!/usr/bin/env node

import assert from 'node:assert/strict';
import { parseAgentAnswer } from './triage.mjs';

const response = {
  messages: [
    { role: 'USER', content: [{ text: 'ignored' }] },
    {
      role: 'GLEAN_AI',
      content: [
        { type: 'text', text: 'Summary\nThe support issue is a stale answer.' },
        {
          type: 'text',
          text: '\nEvidence\nA recent document update is indexed.',
        },
      ],
    },
  ],
};

const parsed = parseAgentAnswer(response);
assert.match(parsed.answer, /Summary/u);
assert.match(parsed.answer, /Evidence/u);
assert.doesNotMatch(parsed.answer, /ignored/u);

console.log(
  'fixture verification passed: Platform Agent response parsing is stable',
);

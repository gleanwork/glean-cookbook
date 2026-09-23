#!/usr/bin/env node

import 'dotenv/config';
import { triageSupportIssue } from './triage.mjs';

const issue = process.env.GLEAN_SUPPORT_ISSUE?.trim();
if (!issue) {
  console.error(
    'Set GLEAN_SUPPORT_ISSUE to a real support issue URL or description.',
  );
  process.exit(1);
}

try {
  const { answer } = await triageSupportIssue(issue);
  if (!answer.includes('Summary') || !answer.includes('Evidence')) {
    throw new Error(
      'Expected the Agent response to include Summary and Evidence sections.',
    );
  }
  console.log(
    'live verification passed: the Platform Agent returned a structured triage',
  );
} catch (error) {
  console.error(`live verification failed: ${error.message}`);
  process.exit(1);
}

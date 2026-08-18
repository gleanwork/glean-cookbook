import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

function value(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

const prUrl = value('--pr');
const bodyFile = value('--body');
const match = prUrl?.match(
  /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)\/?$/u,
);
if (!match || !bodyFile || !fs.existsSync(bodyFile)) {
  throw new Error(
    'Usage: node scripts/draft-review.mjs --pr <GitHub PR URL> --body <markdown file>',
  );
}

function gh(args, input) {
  const result = spawnSync('gh', args, {
    encoding: 'utf8',
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (result.status !== 0) throw new Error(result.stderr.trim() || 'gh failed');
  return result.stdout;
}

const [, owner, repo, number] = match;
const login = gh(['api', 'user', '--jq', '.login']).trim();
const reviews = JSON.parse(
  gh(['api', `repos/${owner}/${repo}/pulls/${number}/reviews`]),
);
const pending = reviews.filter(
  (review) =>
    review.state?.toLowerCase() === 'pending' && review.user?.login === login,
);
if (pending.length > 1)
  throw new Error('More than one pending review exists; update it in GitHub.');

const payload = JSON.stringify({ body: fs.readFileSync(bodyFile, 'utf8') });
if (pending.length === 1) {
  gh(
    [
      'api',
      '--method',
      'PUT',
      `repos/${owner}/${repo}/pulls/${number}/reviews/${pending[0].id}`,
      '--input',
      '-',
    ],
    payload,
  );
  console.log(
    `Updated pending review ${pending[0].id}. Nothing was submitted.`,
  );
} else {
  const created = JSON.parse(
    gh(
      [
        'api',
        '--method',
        'POST',
        `repos/${owner}/${repo}/pulls/${number}/reviews`,
        '--input',
        '-',
      ],
      payload,
    ),
  );
  console.log(`Created pending review ${created.id}. Nothing was submitted.`);
}

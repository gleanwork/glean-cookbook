#!/usr/bin/env node
// Runs the Code nodes out of workflow.json against recorded fixtures, so the
// gate and the shipped artifact are the same source. No credentials, no network.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const check = (label, condition, detail = '') => {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
    failures.push(label);
  }
};

const workflow = JSON.parse(
  fs.readFileSync(path.join(root, 'workflow.json'), 'utf8'),
);
const fixture = (name) =>
  JSON.parse(fs.readFileSync(path.join(root, 'fixtures', name), 'utf8'));

/**
 * Runs one Code node exactly as n8n would in runOnceForAllItems mode: the body
 * is a function over `$input`, and it returns an array of `{ json }` items.
 */
function runNode(
  name,
  items,
  { vars = {}, upstream = {}, staticData, transform } = {},
) {
  const node = workflow.nodes.find((candidate) => candidate.name === name);
  if (!node) throw new Error(`workflow.json has no node named "${name}"`);
  // `transform` lets a check neutralise a configured value, so the gate asserts
  // the same behaviour in this repo and in a scaffold someone has filled in.
  const code = transform
    ? transform(node.parameters.jsCode)
    : node.parameters.jsCode;
  const $input = {
    all: () => items.map((json) => ({ json })),
    first: () => ({ json: items[0] }),
  };
  // Nodes reach back by name because a Salesforce node drops whatever preceded
  // it; the stub is explicit so the gate exercises that seam.
  const $ = (nodeName) => {
    if (!(nodeName in upstream)) {
      throw new Error(
        `${name} reached back to $('${nodeName}'), which this check did not stub`,
      );
    }
    const rows = upstream[nodeName];
    return {
      first: () => ({ json: rows[0] }),
      all: () => rows.map((json) => ({ json })),
    };
  };
  // Passing the same object across two runNode calls is what a redelivery looks
  // like; passing none is a manual execution, where n8n provides no static data.
  const $getWorkflowStaticData = staticData
    ? () => staticData
    : () => {
        throw new Error('Static data is not available in test executions.');
      };
  // Executing the shipped node body is the point: the gate and the artifact
  // have to be the same source, or the gate only proves a copy still works.
  const fn = new Function(
    '$input',
    '$vars',
    '$',
    '$getWorkflowStaticData',
    code,
  );
  return fn($input, vars, $, $getWorkflowStaticData).map((item) => item.json);
}

function throws(name, items, options = {}) {
  try {
    runNode(name, items, options);
    return null;
  } catch (error) {
    return error.message;
  }
}

// ---- The workflow is importable and shaped as documented ------------------
console.log('\nWorkflow structure');
const byName = new Map(workflow.nodes.map((node) => [node.name, node]));
check('the workflow ships inactive', workflow.active === false);
check(
  'the trigger is the Glean Trigger node',
  byName.get('Glean Trigger')?.type ===
    '@gleanwork/n8n-nodes-gleanclient.gleanClientTrigger',
);
// `preset` is a resource locator: a flat `presetId` imports cleanly, binds
// nothing, and never fires.
check(
  'it is pinned to the Gong participant preset',
  byName.get('Glean Trigger')?.parameters?.preset?.value === 'GONG_2',
  JSON.stringify(byName.get('Glean Trigger')?.parameters?.preset),
);
check(
  'the trigger authenticates with a value the node accepts',
  ['oAuth2', 'apiKey'].includes(
    byName.get('Glean Trigger')?.parameters?.authentication,
  ),
  byName.get('Glean Trigger')?.parameters?.authentication,
);
// The package ships a Trigger and a Search action. There is no Chat node, so a
// workflow claiming one would not import. Summarisation must be an HTTP call.
check(
  'summarisation is an HTTP Request, because the package has no Chat node',
  byName.get('Glean Chat')?.type === 'n8n-nodes-base.httpRequest',
);
// The package ships exactly two node types. Anything else under @gleanwork/ —
// a gleanChat, say — would not import.
check(
  'no node claims a @gleanwork node type the package does not ship',
  workflow.nodes
    .filter((node) => node.type.startsWith('@gleanwork/'))
    .every((node) =>
      [
        '@gleanwork/n8n-nodes-gleanclient.gleanClientTrigger',
        '@gleanwork/n8n-nodes-gleanclient.gleanClient',
      ].includes(node.type),
    ),
  workflow.nodes
    .filter((node) => node.type.startsWith('@gleanwork/'))
    .map((node) => node.type)
    .join(', '),
);
check(
  'Chat is called with saveChat false',
  /saveChat:\s*false/u.test(
    byName.get('Glean Chat')?.parameters.jsonBody ?? '',
  ),
);

// Ordering is a correctness property, not a layout preference: the Slack text
// asserts the account was updated.
const order = [];
let cursor = 'Glean Trigger';
while (cursor && order.length < 20) {
  order.push(cursor);
  cursor = workflow.connections[cursor]?.main?.[0]?.[0]?.node;
}
check(
  'Salesforce is written before Slack is told about it',
  order.indexOf('Salesforce: log call') < order.indexOf('Slack: heads-up') &&
    order.indexOf('Salesforce: log call') !== -1,
  order.join(' -> '),
);
// A sticky note is a canvas annotation, not a step. It has no connections by
// design, so reachability counts executable nodes only.
const executable = workflow.nodes.filter(
  (n) => n.type !== 'n8n-nodes-base.stickyNote',
);
check(
  'every node is reachable from the trigger',
  order.length === executable.length,
  `${order.length} of ${executable.length}: ${order.join(' -> ')}`,
);
// The two values a reader must fill in live in a canvas sticky note, since
// JSON carries no header.
{
  const note = workflow.nodes.find(
    (n) => n.type === 'n8n-nodes-base.stickyNote',
  );
  check('the workflow explains itself on arrival', Boolean(note));
  check(
    'and the note names both values that must be filled in',
    /SLACK_CHANNEL/u.test(note?.parameters.content ?? '') &&
      /YOUR-INSTANCE/u.test(note?.parameters.content ?? ''),
  );
}

// ---- Extract call ----------------------------------------------------------
// n8n's Salesforce node declares `status` as a top-level required parameter for
// task:create, and keeps `subject` inside the additionalFields collection.
// Getting this wrong imports cleanly and only fails when the node runs, with
// "Parameter \"Status Name or ID\" is required" — so pin the placement here.
const logCall = workflow.nodes.find(
  (n) => n.name === 'Salesforce: log call',
).parameters;
check(
  'Salesforce task sets status at the top level',
  logCall.status === 'Completed',
);
check(
  'Salesforce task keeps subject inside additionalFields',
  typeof logCall.additionalFields?.subject === 'string' &&
    logCall.subject === undefined,
);
check(
  'Salesforce task is not missing its operation',
  logCall.operation === 'create',
);
// The node calls this field `owner`, and it is a resourceLocator. `ownerId` is
// not a field it knows, so the task would be created unassigned.
check(
  'Salesforce task assigns the matched Account owner',
  logCall.additionalFields?.owner?.__rl === true &&
    logCall.additionalFields.owner.mode === 'id' &&
    /account\.OwnerId/u.test(logCall.additionalFields.owner.value) &&
    logCall.additionalFields.ownerId === undefined,
);

console.log('\nExtract call');
const delivery = fixture('delivery.json');
const [extracted] = runNode('Extract call', [delivery]);
check('the call id comes from doc_id', extracted.callId === delivery.doc_id);
check(
  'the view url is carried through',
  extracted.viewUrl === delivery.view_url,
);
// `webhook-id` is unreachable, so the key identifies the event: same event,
// same pair; new call, new pair.
check(
  'the delivery key is doc_id plus event_time',
  extracted.deliveryId === `${delivery.doc_id}:${delivery.event_time}`,
  extracted.deliveryId,
);
check(
  'a second delivery of the same event keys identically',
  runNode('Extract call', [{ ...delivery }])[0].deliveryId ===
    extracted.deliveryId,
);
check(
  'a different call keys differently',
  runNode('Extract call', [{ ...delivery, doc_id: 'GONG_call_999' }])[0]
    .deliveryId !== extracted.deliveryId,
);
// The documented contract names it trigger_id; some deployments still send
// trigger_name. Read both, depend on neither.
check(
  'the platform trigger id is read from trigger_id',
  runNode('Extract call', [{ ...delivery, trigger_id: 'tid-documented' }])[0]
    .triggerId === 'tid-documented',
);
check(
  'trigger_name is still accepted from deployments that send it',
  runNode('Extract call', [{ ...delivery, trigger_name: 'tid-legacy' }])[0]
    .triggerId === 'tid-legacy',
);
// event_time is optional in the contract, so its absence must degrade the key
// rather than throw.
check(
  'a delivery with no event_time still keys on the document',
  runNode('Extract call', [{ ...delivery, event_time: undefined }])[0]
    .deliveryId === delivery.doc_id,
);
// ---- The dedupe gate ------------------------------------------------------
// Both writes downstream are irreversible, and Glean delivery is at-least-once.
{
  const store = {};
  const first = runNode('Extract call', [{ ...delivery }], {
    staticData: store,
  });
  check('a first delivery passes through', first.length === 1);
  check(
    'and its key is recorded for next time',
    store.seenDeliveries?.length === 1,
  );
  check(
    'a redelivery of the same event is dropped before any write',
    runNode('Extract call', [{ ...delivery }], { staticData: store }).length ===
      0,
  );
  check(
    'a different call still passes',
    runNode('Extract call', [{ ...delivery, doc_id: 'GONG_call_999' }], {
      staticData: store,
    }).length === 1,
  );
  // n8n keeps static data small, and only a recent delivery can be retried.
  const big = {
    seenDeliveries: Array.from({ length: 200 }, (_, i) => `x${i}`),
  };
  runNode('Extract call', [{ ...delivery }], { staticData: big });
  check(
    'the record stays bounded',
    big.seenDeliveries.length === 200 &&
      big.seenDeliveries.at(-1) === `${delivery.doc_id}:${delivery.event_time}`,
  );
  // Manual executions have no static data. Dropping the call to protect
  // against a duplicate would be worse than the duplicate.
  check(
    'with no static data available it fails open rather than dropping the call',
    runNode('Extract call', [{ ...delivery }]).length === 1,
  );
}

check(
  'a delivery with no doc_id is refused',
  /doc_id/u.test(throws('Extract call', [{ ...delivery, doc_id: '' }]) ?? ''),
  'the call could not be identified at all',
);
check(
  'a delivery from the wrong datasource is refused',
  /wrong preset/u.test(
    throws('Extract call', [{ ...delivery, datasource: 'SLACK2' }]) ?? '',
  ),
);
// The node verifies the Standard Webhooks signature before this runs, so the
// workflow must not also claim to be doing it.
check(
  'signature verification is left to the trigger node',
  !/verifyStandardWebhookSignature|webhook-signature/u.test(
    byName.get('Extract call')?.parameters?.jsCode ?? '',
  ),
);

// ---- Parse summary ---------------------------------------------------------
// Every node below resolves one call via .first(), so a batched delivery would
// write one call's summary to another call's account. Halt instead.
let batched = 'no error';
try {
  runNode('Extract call', [delivery, { ...delivery, doc_id: 'GONG_call_222' }]);
} catch (error) {
  batched = error.message;
}
check(
  'a delivery carrying two events is refused',
  /two events|2 events/u.test(batched) && /Nothing is written/u.test(batched),
  batched.slice(0, 90),
);
check(
  'Extract call emits no field no downstream node reads',
  !Object.keys(extracted).includes('subscriber'),
);

console.log('\nParse summary');
const [parsed] = runNode('Parse summary', [fixture('chat-response.json')], {
  upstream: { 'Extract call': [extracted] },
});
check('the summary is non-empty', parsed.summary.length > 0);
check(
  'progress narration is not treated as the answer',
  !/Searching company knowledge/u.test(parsed.summary),
);
// Glean Chat often emits a short plan as CONTENT before doing its tool work.
// Nothing structural separates it from the answer, so the answer is the CONTENT
// that follows the last UPDATE. Taking every CONTENT glues the plan on front.
check(
  'a CONTENT preamble before the tool work is not part of the answer',
  !/I’ll review the call/u.test(parsed.summary),
  parsed.summary.slice(0, 80),
);
// Chat signs off by offering to do more. A Salesforce Task and a customer-facing
// Slack channel have no one to answer that question.
check(
  'the conversational sign-off is not written to the record',
  !/Would you like me to/u.test(parsed.summary) &&
    !/\?\s*$/u.test(parsed.summary),
  parsed.summary.slice(-70),
);
check(
  'the account Chat named is captured',
  parsed.accountName === 'Globex',
  parsed.accountName,
);
check(
  'the ACCOUNT line is not left in the summary text',
  !/ACCOUNT:/u.test(parsed.summary),
);
// The two surfaces disagree on casing — Platform snake_case, Chat camelCase —
// so assert both and stop a repo-wide rename.
{
  const chat = JSON.stringify(fixture('chat-response.json'));
  check(
    'the Chat response contract stays camelCase',
    /"messageType"/u.test(chat) && !/"message_type"/u.test(chat),
  );
  check(
    'while the trigger payload stays snake_case',
    Object.keys(delivery).every((k) => !/[A-Z]/u.test(k)),
    Object.keys(delivery).join(', '),
  );
}
check('citations are collected', parsed.citations.length === 2);
check(
  'duplicate citations are collapsed by url',
  new Set(parsed.citations.map((citation) => citation.url)).size ===
    parsed.citations.length,
);
const unfinished = throws('Parse summary', [fixture('chat-unfinished.json')], {
  upstream: { 'Extract call': [extracted] },
});
check(
  'a 200 with no text block is refused as an unfinished run',
  /unfinished run/u.test(unfinished ?? ''),
);
check(
  'and it is not described as an empty call',
  !/empty call\b.*fact/u.test(unfinished ?? '') &&
    /retry/u.test(unfinished ?? ''),
  'writing a transport failure into Salesforce records it as a fact about the conversation',
);

// ---- Resolve account -------------------------------------------------------
console.log('\nResolve account');
const accounts = fixture('accounts.json');
// Chat proposes the account; exactly one Salesforce match still gates the write.
const fromParse = (accountName) => ({
  upstream: { 'Parse summary': [{ ...parsed, accountName }] },
});

const [resolved] = runNode('Resolve account', accounts, fromParse('Globex'));
check(
  'an unambiguous account resolves',
  resolved.account.Name === 'Globex',
  resolved.account.Name,
);

// "Acme Corp" and "Acme Corporation" are different customers, so ambiguity halts.
const ambiguous = throws('Resolve account', accounts, fromParse('Acme Corp'));
check(
  'an ambiguous account name halts instead of picking one',
  /matches 2 Salesforce accounts/u.test(ambiguous ?? ''),
  ambiguous,
);
check(
  'the error names both candidates so a human can resolve it',
  /Acme Corp/u.test(ambiguous ?? '') &&
    /Acme Corporation/u.test(ambiguous ?? ''),
);
check(
  'an unknown account halts',
  /No Salesforce account matches/u.test(
    throws('Resolve account', accounts, fromParse('Initech')) ?? '',
  ),
);
check(
  'a call Chat could not attribute halts',
  /could not name the customer/u.test(
    throws('Resolve account', accounts, fromParse('')) ?? '',
  ),
);
// Chat is asked, not trusted. A name it invented is not a Salesforce account,
// so exact matching refuses it and nothing is written.
check(
  'an account Chat invented resolves to nothing rather than something',
  /No Salesforce account matches/u.test(
    throws('Resolve account', accounts, fromParse('Vandelay Industries')) ?? '',
  ),
);

// ---- Resolve channel -------------------------------------------------------
console.log('\nResolve channel');
const channels = JSON.stringify(fixture('channels.json'));
const [routed] = runNode('Resolve channel', [{ id: 'sf-task-1' }], {
  vars: { GONG_ACCOUNT_CHANNELS: channels },
  upstream: { 'Resolve account': [resolved] },
});
check(
  'a mapped account routes to its own channel',
  routed.channel === 'C0GLOBEX',
);
check('the message links the call', routed.text.includes(extracted.viewUrl));
// Escaping the label is not enough. A url carrying | or > closes the link early
// and the remainder of the message renders as raw text.
{
  const odd = runNode('Resolve channel', [{ id: 'sf-task-1' }], {
    vars: { GONG_ACCOUNT_CHANNELS: channels },
    upstream: {
      'Resolve account': [
        {
          ...resolved,
          call: { ...extracted, viewUrl: 'https://gong.example/call?id=1|2>3' },
        },
      ],
    },
  })[0];
  check(
    'a url with Slack link syntax in it is encoded, not left to break the link',
    !/\|2>3/u.test(odd.text) && odd.text.includes('%7C2%3E3'),
    odd.text.split('\n')[0],
  );
}
// The fixture keeps Gong's "<>" title shape so the suite tests the real problem.
{
  const hostile = runNode('Resolve channel', [{ id: 'sf-task-1' }], {
    vars: { GONG_ACCOUNT_CHANNELS: channels },
    upstream: {
      'Resolve account': [
        {
          ...resolved,
          call: { ...extracted, title: 'Globex <> us — Q3 & renewal' },
          summary: 'Raised >2 blockers & one risk.',
        },
      ],
    },
  })[0];
  check(
    'the call title is escaped inside the Slack link label',
    hostile.text.includes('Globex &lt;&gt; us — Q3 &amp; renewal'),
    hostile.text.split('\n')[0],
  );
  check(
    'the summary is escaped too',
    hostile.text.includes('Raised &gt;2 blockers &amp; one risk.'),
  );
  check(
    'the link target itself is left unescaped',
    hostile.text.includes(`<${extracted.viewUrl}|`),
  );
}
check(
  'the message carries the summary sources',
  routed.text.includes('Sources:'),
);

const unmapped = throws('Resolve channel', [{ id: 'sf-task-1' }], {
  vars: { GONG_ACCOUNT_CHANNELS: channels },
  upstream: {
    'Resolve account': [
      { ...resolved, account: { Id: '001UNMAPPED', Name: 'Unmapped Co' } },
    ],
  },
});
check(
  'an unmapped account posts nowhere rather than somewhere',
  /no entry in GONG_ACCOUNT_CHANNELS/u.test(unmapped ?? ''),
  'a fallback channel turns a missing mapping into a customer-data disclosure',
);
check(
  'and it says the Salesforce write already happened',
  /Salesforce was updated/u.test(unmapped ?? ''),
);
// No hardcoded default anywhere in the shipped node, not merely unused here.
check(
  'the shipped node hardcodes no channel',
  !/\|\|\s*['"]#?[a-z0-9-]+['"]/u.test(
    byName.get('Resolve channel')?.parameters.jsCode ?? '',
  ),
);

// Once a per-account map exists, an unmapped account halts rather than
// widening one customer's audience.
const [central] = runNode('Resolve channel', [{ id: 'sf-task-1' }], {
  vars: { GONG_SLACK_CHANNEL: 'C0CENTRAL' },
  upstream: { 'Resolve account': [resolved] },
});
check(
  'a single central channel is a supported configuration',
  central.channel === 'C0CENTRAL',
);
const bothSet = throws('Resolve channel', [{ id: 'sf-task-1' }], {
  vars: {
    GONG_ACCOUNT_CHANNELS: JSON.stringify({ '001OTHER': 'C0OTHER' }),
    GONG_SLACK_CHANNEL: 'C0CENTRAL',
  },
  upstream: { 'Resolve account': [resolved] },
});
check(
  'per-account routing never falls back to the central channel',
  /does not fall back/u.test(bothSet ?? ''),
  bothSet?.slice(0, 90),
);
// This asserts the halt when nothing is routed, so it has to hold whether or not
// this copy has been configured — otherwise the documented order (configure, then
// verify) fails here for every user who filled in a channel.
const unconfigured = (code) =>
  code
    .replace(/const SLACK_CHANNEL = '[^']*'/u, "const SLACK_CHANNEL = ''")
    .replace(
      /const ACCOUNT_CHANNELS = \{[^}]*\}/u,
      'const ACCOUNT_CHANNELS = {}',
    );
const neither = throws('Resolve channel', [{ id: 'sf-task-1' }], {
  vars: {},
  upstream: { 'Resolve account': [resolved] },
  transform: unconfigured,
});
check(
  'no channel configured at all halts and names both options',
  /SLACK_CHANNEL/u.test(neither ?? '') &&
    /ACCOUNT_CHANNELS/u.test(neither ?? ''),
);
// n8n Variables are paid, so both settings are plain constants that Variables
// override where present.
{
  const src = byName.get('Resolve channel')?.parameters.jsCode ?? '';
  check(
    'the channel can be set without n8n Variables',
    /const SLACK_CHANNEL =/u.test(src) && /const ACCOUNT_CHANNELS =/u.test(src),
  );
  check(
    'a missing $vars does not throw on a free plan',
    /typeof \$vars === 'undefined'/u.test(src),
  );
  check(
    'the Chat url still resolves without Variables',
    /\|\|\s*'https:\/\//u.test(byName.get('Glean Chat')?.parameters.url ?? ''),
  );
}

// ---- The merged shape ------------------------------------------------------
console.log('\nGlean surfaces');
const chatNode = byName.get('Glean Chat');
check(
  'summarisation is Glean Chat, not a bring-your-own model',
  chatNode?.type === 'n8n-nodes-base.httpRequest' &&
    /\/rest\/api\/v1\/chat/u.test(chatNode?.parameters?.url ?? ''),
);
check(
  'no LangChain or OpenAI node remains',
  workflow.nodes.every((node) => !/langchain/u.test(node.type)),
  workflow.nodes
    .filter((node) => /langchain/u.test(node.type))
    .map((n) => n.name)
    .join(', '),
);
check(
  'Chat uses the Client credential, not the Trigger one',
  chatNode?.parameters?.nodeCredentialType === 'gleanClientApi',
  chatNode?.parameters?.nodeCredentialType,
);
check(
  'retrieval runs through the Glean Search action',
  byName.get('Search Glean for call context')?.type ===
    '@gleanwork/n8n-nodes-gleanclient.gleanClient',
);
check(
  'the search evidence reaches the Chat prompt',
  /Permission-aware Glean results/u.test(chatNode?.parameters?.jsonBody ?? ''),
);
// $input is a Code-node global. In an expression it is undefined, so a node that
// uses it imports cleanly, activates cleanly, and throws on the first delivery.
check(
  'no expression uses $input, which only exists in Code nodes',
  workflow.nodes
    .filter((node) => node.type !== 'n8n-nodes-base.code')
    .every((node) => !JSON.stringify(node.parameters ?? {}).includes('$input')),
  workflow.nodes
    .filter(
      (node) =>
        node.type !== 'n8n-nodes-base.code' &&
        JSON.stringify(node.parameters ?? {}).includes('$input'),
    )
    .map((node) => node.name)
    .join(', '),
);
check(
  'the Chat prompt pulls evidence from the Search node by name',
  /\$\('Search Glean for call context'\)/u.test(
    byName.get('Glean Chat')?.parameters?.jsonBody ?? '',
  ),
);

// A Salesforce node emits its own rows, so a Code node that destructures the
// previous item for upstream fields silently reads undefined in real n8n.
for (const [node, source] of [
  ['Parse summary', 'Extract call'],
  ['Resolve account', 'Parse summary'],
  ['Resolve channel', 'Resolve account'],
]) {
  check(
    `${node} reaches back to ${source} by name`,
    new RegExp(`\\$\\('${source}'\\)`, 'u').test(
      byName.get(node)?.parameters?.jsCode ?? '',
    ),
  );
}

// ---- Configuration --------------------------------------------------------
// The shipped file carries both placeholders on purpose, so this reports by
// default. `--configured` turns it into a gate: run that before publishing,
// where a placeholder means the workflow imports clean and then dies mid-run,
// at Chat on a placeholder hostname or at Resolve channel with nowhere to post
// — after Salesforce has already been written.
console.log('\nConfiguration');
{
  const gate = process.argv.includes('--configured');
  const chatUrl = byName.get('Glean Chat')?.parameters?.url ?? '';
  const routing = byName.get('Resolve channel')?.parameters?.jsCode ?? '';
  const state = [
    [
      'the Glean Chat node points at your Glean backend',
      !/YOUR-INSTANCE-be\.glean\.com/u.test(chatUrl),
      'still the placeholder host',
    ],
    [
      'a Slack destination is configured',
      /const SLACK_CHANNEL = '[^']+'/u.test(routing) ||
        /const ACCOUNT_CHANNELS = \{\s*'[^']/u.test(routing),
      'SLACK_CHANNEL and ACCOUNT_CHANNELS are both empty',
    ],
  ];
  for (const [label, ok, detail] of state) {
    if (gate) check(label, ok, detail);
    else
      console.log(
        `  ${ok ? 'ok  ' : 'todo'} ${label}${ok ? '' : ` — ${detail}`}`,
      );
  }
  if (!gate) {
    console.log(
      '  (run `npm run verify:config` after editing local workflow.json; UI and Variable values must be checked in n8n)',
    );
  }
}

console.log('');
if (failures.length > 0) {
  console.error(`FAILED — ${failures.length} check(s):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('All checks passed.');

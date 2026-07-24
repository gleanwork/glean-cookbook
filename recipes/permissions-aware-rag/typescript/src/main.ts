/**
 * Permissions-aware RAG — Glean Search as the retrieval layer for your own LLM app.
 *
 * Verified against the actually installed pinned SDKs:
 * - @gleanwork/api-client@0.18.0: glean.client.search.query() (the Client
 *   API's /rest/api/v1/search) — the same glean.client.* pattern already
 *   verified for the acme-answers recipe's chat.create() call.
 * - @anthropic-ai/sdk@0.115.0: messages.create() with model "claude-sonnet-5".
 *
 * Per-user enforcement: a global/admin Glean token can impersonate a
 * specific user via the X-Glean-Act-As header (confirmed against internal
 * auth docs, not guessed) — there is no actAs option on search.query()
 * itself; it's passed as a raw request header.
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { Glean } from '@gleanwork/api-client';

const MODEL = 'claude-sonnet-5';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

interface Source {
  title: string;
  url: string;
  text: string;
}

async function retrieve(
  question: string,
  actAs: string | undefined,
): Promise<Source[]> {
  const glean = new Glean({
    apiToken: requireEnv('GLEAN_API_TOKEN'),
    instance: requireEnv('GLEAN_INSTANCE'),
  });

  const response = await glean.client.search.query(
    { query: question, pageSize: 8 },
    undefined,
    actAs ? { headers: { 'X-Glean-Act-As': actAs } } : undefined,
  );

  const sources: Source[] = [];
  for (const result of response.results ?? []) {
    if (!result.title || !result.snippets) continue;
    const text = result.snippets
      .map((snippet) => snippet.text ?? '')
      .filter(Boolean)
      .join('\n');
    if (text) sources.push({ title: result.title, url: result.url, text });
  }
  return sources;
}

async function answer(question: string, sources: Source[]): Promise<string> {
  if (sources.length === 0) return "I don't have information on that.";

  const context = sources
    .map((source, i) => `[${i + 1}] ${source.title}\n${source.text}`)
    .join('\n\n');
  const prompt =
    `Answer the question using ONLY the numbered sources below. ` +
    `Cite sources inline like [1]. If the sources don't cover the ` +
    `question, say you don't have information on that.\n\n` +
    `Sources:\n${context}\n\nQuestion: ${question}`;

  const client = new Anthropic({ apiKey: requireEnv('ANTHROPIC_API_KEY') });
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const block = message.content[0];
  return block.type === 'text' ? block.text : '';
}

async function main() {
  const [question, actAsFlag, actAsValue] = process.argv.slice(2);
  if (!question) {
    console.error('Usage: npm start -- "<question>" [--act-as <email>]');
    process.exit(1);
  }
  const actAs = actAsFlag === '--act-as' ? actAsValue : undefined;

  const sources = await retrieve(question, actAs);
  console.log(await answer(question, sources));
  console.log('\nSources:');
  sources.forEach((source, i) => {
    console.log(`  [${i + 1}] ${source.title} — ${source.url}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

/**
 * Permissions-aware retrieval — Glean's data-first Platform API as the retrieval
 * layer for your own LLM app.
 *
 * Verified against the actually installed pinned SDKs (real HTTP round-trip
 * against a local echo server, headers and all — not just constructed and
 * inspected):
 * - @gleanwork/api-client@0.18.0: the top-level glean.search.query() (not
 *   glean.client.search.query() — that's the older Client/REST API, a
 *   different surface entirely). This is Glean's newer, data-first retrieval
 *   API (POST /api/search): launched publicly 2026-07 but still Experimental,
 *   so every call must opt in via X_GLEAN_INCLUDE_EXPERIMENTAL=true (env var,
 *   read automatically by the SDK — there's no argument for this on
 *   search.query() itself). Response shape is deliberately plain: each
 *   result's `snippets` is a string[], not an array of {text: ...} objects
 *   like the Client API's search.query() — one less unwrap.
 * - @anthropic-ai/sdk@0.115.0: messages.create() with model "claude-sonnet-5".
 *
 * Per-user enforcement needs no code: the caller's own credential is the
 * permission boundary, so results come back already filtered to what that
 * person can see. No extra headers, and no impersonation.
 *
 * What does need code is the empty case: when retrieval returns nothing, the
 * app must refuse rather than answer from the model's own knowledge.
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

async function retrieve(question: string): Promise<Source[]> {
  const glean = new Glean({
    apiToken: requireEnv('GLEAN_API_TOKEN'),
    instance: requireEnv('GLEAN_INSTANCE'),
  });

  const response = await glean.search.query({
    query: question,
    page_size: 8,
  });

  const sources: Source[] = [];
  for (const result of response.results ?? []) {
    if (!result.title || !result.snippets) continue;
    const text = result.snippets.filter(Boolean).join('\n');
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
  const [question] = process.argv.slice(2);
  if (!question) {
    console.error('Usage: npm start -- "<question>"');
    process.exit(1);
  }

  const sources = await retrieve(question);
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

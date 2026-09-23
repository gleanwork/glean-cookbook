#!/usr/bin/env node

import 'dotenv/config';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGleanTokenProvider } from '@gleanwork/auth';

export function requiredEnv(name, env = process.env) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function parseAgentAnswer(response) {
  const answer = (response.messages ?? [])
    .filter((message) => message.role === 'GLEAN_AI')
    .flatMap((message) => message.content ?? [])
    .map((block) => block.text ?? '')
    .join('\n')
    .trim();
  return { answer };
}

export function buildTriagePrompt(issue) {
  return [
    'Triage this one support issue using only information available to you through Glean.',
    'Return four concise sections: Summary, Evidence, Next diagnostic step, and Customer-safe response.',
    'Separate observed evidence from hypotheses. If the indexed evidence is insufficient, say so instead of inventing a cause.',
    'If the issue is an Intercom URL, try the URL and its conversation ID; if the live page is only an authenticated application shell, use the indexed ticket record and disclose that limitation.',
    '',
    `Support issue:\n${issue.trim()}`,
  ].join('\n');
}

const transientRequestAttempts = 2;
const transientRetryDelayMs = 1500;

function fetchErrorDetail(error) {
  const cause = error?.cause;
  const causeDetail = cause?.code ?? cause?.message;
  return causeDetail ? `${error.message} (${causeDetail})` : error.message;
}

async function requestWithCurl(endpoint, apiToken, payload) {
  const directory = await mkdtemp(join(tmpdir(), 'glean-triage-'));
  const bodyPath = join(directory, 'request.json');
  const config = [
    `url = "${endpoint}"`,
    'request = POST',
    `header = "Authorization: Bearer ${apiToken}"`,
    'header = "Content-Type: application/json"',
    `data-binary = "@${bodyPath}"`,
    'silent',
    'show-error',
    'write-out = "\\n__HTTP_STATUS__:%{http_code}"',
  ].join('\n');
  try {
    await writeFile(bodyPath, JSON.stringify(payload), { mode: 0o600 });
    const { stdout, stderr, status } = await new Promise((resolve, reject) => {
      const childEnv = { ...process.env };
      delete childEnv.GLEAN_API_TOKEN;
      const child = spawn('curl', ['--config', '-'], {
        env: childEnv,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const stdoutChunks = [];
      const stderrChunks = [];
      const timeout = setTimeout(() => child.kill('SIGTERM'), 180_000);
      child.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
      child.stderr.on('data', (chunk) => stderrChunks.push(chunk));
      child.on('error', reject);
      child.on('close', (code) => {
        clearTimeout(timeout);
        resolve({
          stdout: Buffer.concat(stdoutChunks).toString(),
          stderr: Buffer.concat(stderrChunks).toString(),
          status: code,
        });
      });
      child.stdin.end(config);
    });
    if (status !== 0)
      throw new Error(`curl failed: ${stderr.trim() || `exit ${status}`}`);
    const marker = '\n__HTTP_STATUS__:';
    const markerIndex = stdout.lastIndexOf(marker);
    if (markerIndex < 0) throw new Error('curl returned no HTTP status');
    return {
      status: Number(stdout.slice(markerIndex + marker.length).trim()),
      ok:
        Number(stdout.slice(markerIndex + marker.length).trim()) >= 200 &&
        Number(stdout.slice(markerIndex + marker.length).trim()) < 300,
      text: stdout.slice(0, markerIndex),
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function triageSupportIssue(issue, env = process.env) {
  const agentId = requiredEnv('GLEAN_AGENT_ID', env);
  const serverURL = requiredEnv('GLEAN_SERVER_URL', env);
  if (!issue?.trim())
    throw new Error('Provide a support issue URL or description.');

  const apiToken = await createGleanTokenProvider({
    serverUrl: serverURL,
    scopes: ['agents'],
  })();
  const prompt = buildTriagePrompt(issue);
  const endpoint = `${serverURL.replace(/\/+$/u, '')}/api/agents/${encodeURIComponent(agentId)}/runs`;
  const payload = {
    messages: [{ role: 'USER', content: [{ text: prompt, type: 'text' }] }],
    stream: false,
  };
  let response;
  let lastFetchError;
  for (let attempt = 1; attempt <= transientRequestAttempts; attempt += 1) {
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      break;
    } catch (error) {
      lastFetchError = error;
      if (attempt < transientRequestAttempts)
        await new Promise((resolve) =>
          setTimeout(resolve, transientRetryDelayMs),
        );
    }
  }
  if (!response) {
    if (lastFetchError?.cause?.code === 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY') {
      response = await requestWithCurl(endpoint, apiToken, payload);
    } else {
      throw new Error(
        `Platform Agents API request failed after ${transientRequestAttempts} attempts: ${fetchErrorDetail(lastFetchError)}`,
      );
    }
  }

  if (!response) {
    throw new Error(
      `Platform Agents API request failed after ${transientRequestAttempts} attempts: ${fetchErrorDetail(lastFetchError)}`,
    );
  }

  const responseText =
    typeof response.text === 'function' ? await response.text() : response.text;
  let responseBody;
  try {
    responseBody = JSON.parse(responseText);
  } catch {
    responseBody = undefined;
  }
  if (!response.ok) {
    const detail = responseBody?.message || responseBody?.error || responseText;
    throw new Error(
      `Platform Agents API returned HTTP ${response.status}: ${String(detail).slice(0, 500)}`,
    );
  }
  const parsed = parseAgentAnswer(responseBody ?? {});
  if (!parsed.answer) {
    throw new Error(
      'The Agent returned no answer text. Confirm it is conversational and published.',
    );
  }
  return parsed;
}

if (process.argv[1]?.endsWith('/triage.mjs')) {
  const issue =
    process.argv.slice(2).join(' ') || process.env.GLEAN_SUPPORT_ISSUE;
  try {
    const { answer } = await triageSupportIssue(issue);
    console.log(answer);
  } catch (error) {
    console.error(`Support triage failed: ${error.message}`);
    process.exit(1);
  }
}

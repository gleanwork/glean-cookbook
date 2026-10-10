import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { gleanAuthCli, Session, type LoginRunner } from './session.js';

const originalToken = process.env.GLEAN_API_TOKEN;
const originalState = process.env.XDG_STATE_HOME;
let stateDir: string;

beforeEach(() => {
  delete process.env.GLEAN_API_TOKEN;
  // Keep the token provider away from any real credentials on this machine.
  stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glean-auth-state-'));
  process.env.XDG_STATE_HOME = stateDir;
});

afterEach(() => {
  fs.rmSync(stateDir, { recursive: true, force: true });
  if (originalToken === undefined) delete process.env.GLEAN_API_TOKEN;
  else process.env.GLEAN_API_TOKEN = originalToken;
  if (originalState === undefined) delete process.env.XDG_STATE_HOME;
  else process.env.XDG_STATE_HOME = originalState;
});

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test('runs the glean-auth binary shipped by the pinned package', () => {
  const cli = gleanAuthCli();
  expect(cli).toMatch(/@gleanwork[/\\]auth[/\\]dist[/\\]cli\.js$/);
  expect(fs.existsSync(cli)).toBe(true);
});

test('reports not signed in without credentials, and token mode with GLEAN_API_TOKEN', async () => {
  const session = new Session('https://acme-be.glean.com');
  expect(await session.status()).toEqual({ signedIn: false, via: undefined });
  process.env.GLEAN_API_TOKEN = 'fixture-token';
  expect(await session.status()).toEqual({ signedIn: true, via: 'token' });
});

test('tracks one sign-in at a time and surfaces the approval link', async () => {
  const gate = deferred();
  const calls: string[] = [];
  const runner: LoginRunner = (serverUrl, onOutput) => {
    calls.push(serverUrl);
    onOutput(
      'Unable to open a browser. Open this URL to continue:\nhttps://acme-be.glean.com/oauth/authorize?client_id=x\n',
    );
    return gate.promise;
  };
  const session = new Session('https://acme-be.glean.com', runner);
  session.startLogin();
  session.startLogin();
  expect(calls).toEqual(['https://acme-be.glean.com']);
  expect(session.login).toEqual({
    status: 'running',
    authorizationUrl: 'https://acme-be.glean.com/oauth/authorize?client_id=x',
  });
  gate.resolve();
  await gate.promise;
  await Promise.resolve();
  expect(session.login).toEqual({ status: 'done' });
});

test('reports a failed sign-in', async () => {
  const gate = deferred();
  const session = new Session('https://acme-be.glean.com', () => gate.promise);
  session.startLogin();
  gate.reject(new Error('Timed out waiting for Glean sign-in'));
  await gate.promise.catch(() => undefined);
  await Promise.resolve();
  expect(session.login).toEqual({
    status: 'failed',
    message: 'Timed out waiting for Glean sign-in',
  });
});

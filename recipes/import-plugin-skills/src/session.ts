import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { createGleanTokenProvider } from '@gleanwork/auth';
import { SCOPES } from './client.js';

export interface LoginState {
  status: 'idle' | 'running' | 'failed' | 'done';
  message?: string;
  /** Shown when the CLI could not open a browser by itself. */
  authorizationUrl?: string;
}

export type LoginRunner = (
  serverUrl: string,
  onOutput: (text: string) => void,
) => Promise<void>;

/** The `glean-auth` binary shipped by the pinned @gleanwork/auth package. */
export function gleanAuthCli() {
  const require = createRequire(import.meta.url);
  const manifest = require.resolve('@gleanwork/auth/package.json');
  const { bin } = JSON.parse(readFileSync(manifest, 'utf8')) as {
    bin: Record<string, string>;
  };
  const cli = bin['glean-auth'];
  if (!cli) throw new Error('@gleanwork/auth does not ship glean-auth.');
  return path.join(path.dirname(manifest), cli);
}

/**
 * Run the same official sign-in as `npm run login`: glean-auth discovers the
 * OAuth server, registers a client dynamically, opens the approval page, and
 * stores refreshable credentials outside this project.
 */
export const runGleanAuthLogin: LoginRunner = (serverUrl, onOutput) =>
  new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        gleanAuthCli(),
        'login',
        '--scopes',
        SCOPES.join(','),
        '--server-url',
        serverUrl,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => onOutput(chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
      onOutput(chunk.toString());
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      // glean-auth redacts credentials from its own error messages.
      const last = stderr
        .trim()
        .split('\n')
        .at(-1)
        ?.replace(/^Error:\s*/, '');
      reject(new Error(last || `Sign-in exited with code ${code}.`));
    });
  });

export class Session {
  login: LoginState = { status: 'idle' };
  private readonly token: () => Promise<string>;

  constructor(
    readonly serverUrl: string,
    private readonly runLogin: LoginRunner = runGleanAuthLogin,
  ) {
    this.token = createGleanTokenProvider({ serverUrl, scopes: SCOPES });
  }

  /** Whether a request would be authenticated, without revealing the token. */
  async status() {
    if (process.env.GLEAN_API_TOKEN?.trim()) {
      return { signedIn: true, via: 'token' as const };
    }
    try {
      await this.token();
      return { signedIn: true, via: 'oauth' as const };
    } catch {
      return { signedIn: false, via: undefined };
    }
  }

  startLogin() {
    if (this.login.status === 'running') return;
    this.login = { status: 'running' };
    let output = '';
    this.runLogin(this.serverUrl, (text) => {
      output += text;
      const url = /Open this URL to continue:\s*(https:\/\/\S+)/u.exec(output);
      if (url) this.login = { ...this.login, authorizationUrl: url[1] };
    }).then(
      () => {
        this.login = { status: 'done' };
      },
      (error: unknown) => {
        this.login = {
          status: 'failed',
          message: error instanceof Error ? error.message : String(error),
        };
      },
    );
  }
}

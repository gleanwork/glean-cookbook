import { randomUUID } from 'node:crypto';
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import lockfile from 'proper-lockfile';

export interface StoredOAuthState {
  clientId?: string;
  redirectUri?: string;
  registrationScope?: string;
  grantedScope?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
}

function stateDirectory() {
  const base =
    process.env.XDG_STATE_HOME ?? path.join(os.homedir(), '.local', 'state');
  return path.join(base, 'glean-cookbook', 'search-with-discovered-filters');
}

export function oauthStateFile(issuer: URL) {
  return path.join(stateDirectory(), `${encodeURIComponent(issuer.host)}.json`);
}

async function ensureStateDirectory() {
  const directory = stateDirectory();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  return directory;
}

export async function withOAuthStateLock<T>(
  issuer: URL,
  action: () => Promise<T>,
) {
  const directory = await ensureStateDirectory();
  const target = path.join(
    directory,
    `${encodeURIComponent(issuer.host)}.lock-target`,
  );
  await writeFile(target, '', { flag: 'a', mode: 0o600 });
  await chmod(target, 0o600);
  const release = await lockfile.lock(target, {
    realpath: false,
    retries: {
      retries: 300,
      factor: 1.2,
      minTimeout: 100,
      maxTimeout: 1_000,
      randomize: true,
    },
  });
  try {
    return await action();
  } finally {
    await release();
  }
}

function optionalString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new Error(`Invalid OAuth state: ${key} must be a string.`);
  }
  return value;
}

export async function readOAuthState(issuer: URL): Promise<StoredOAuthState> {
  const file = oauthStateFile(issuer);
  let raw: string;
  try {
    const metadata = await lstat(file);
    if (metadata.isSymbolicLink()) {
      throw new Error('Refusing to read OAuth state through a symbolic link.');
    }
    raw = await readFile(file, 'utf8');
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }

  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid OAuth state file.');
  }
  const record = parsed as Record<string, unknown>;
  const expiresAt = record.expiresAt;
  if (expiresAt !== undefined && typeof expiresAt !== 'number') {
    throw new Error('Invalid OAuth state: expiresAt must be a number.');
  }

  return {
    clientId: optionalString(record, 'clientId'),
    redirectUri: optionalString(record, 'redirectUri'),
    registrationScope: optionalString(record, 'registrationScope'),
    grantedScope: optionalString(record, 'grantedScope'),
    accessToken: optionalString(record, 'accessToken'),
    refreshToken: optionalString(record, 'refreshToken'),
    expiresAt,
  };
}

export async function writeOAuthState(issuer: URL, state: StoredOAuthState) {
  const file = oauthStateFile(issuer);
  await ensureStateDirectory();

  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, {
      mode: 0o600,
      flag: 'wx',
    });
    await rename(temporary, file);
    await chmod(file, 0o600);
  } finally {
    await rm(temporary, { force: true });
  }
}

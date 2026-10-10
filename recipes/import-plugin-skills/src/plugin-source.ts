import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fromBufferPromise } from 'yauzl';

export interface SkippedEntry {
  path: string;
  reason: string;
}

export interface PluginSource {
  /** Absolute path of the folder or zip the developer passed. */
  location: string;
  /** Regular files, as POSIX paths relative to the plugin root. */
  files: ReadonlySet<string>;
  /** Entries that are never read, such as symbolic links. */
  skipped: SkippedEntry[];
  read(file: string): Promise<Uint8Array>;
}

// Version-control metadata and installed dependencies are never skill content.
const IGNORED_DIRECTORIES = new Set(['.git', 'node_modules']);

// Bounds for reading a zip in memory. A plugin repository is text; these stop a
// malformed or hostile archive from exhausting memory, not a legitimate plugin.
export const ZIP_LIMITS = {
  maxArchiveBytes: 200 * 1024 * 1024,
  maxEntries: 20_000,
  maxTotalBytes: 200 * 1024 * 1024,
};

export async function openPluginSource(input: string): Promise<PluginSource> {
  const location = path.resolve(input);
  const stats = await fs.stat(location).catch(() => undefined);
  if (!stats) throw new Error(`No plugin folder or zip at ${location}.`);
  if (stats.isDirectory()) return openDirectory(location);
  if (stats.isFile() && location.toLowerCase().endsWith('.zip')) {
    return openZip(location, stats.size);
  }
  throw new Error('Pass a plugin folder or a .zip file.');
}

async function openDirectory(root: string): Promise<PluginSource> {
  const files = new Set<string>();
  const skipped: SkippedEntry[] = [];

  async function walk(relative: string) {
    const entries = await fs.readdir(path.join(root, relative), {
      withFileTypes: true,
    });
    for (const entry of entries) {
      const child = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) await walk(child);
      } else if (entry.isFile()) {
        files.add(child);
      } else if (entry.isSymbolicLink()) {
        // A link can point outside the plugin, so it is never followed or uploaded.
        skipped.push({ path: child, reason: 'symbolic link' });
      }
    }
  }

  await walk('');
  return {
    location: root,
    files,
    skipped,
    read: async (file) => {
      if (!files.has(file)) throw new Error(`Not a plugin file: ${file}`);
      return new Uint8Array(await fs.readFile(path.join(root, file)));
    },
  };
}

async function readBounded(stream: Readable, maxBytes: number) {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const buffer = chunk as Buffer;
    total += buffer.byteLength;
    if (total > maxBytes) {
      stream.destroy();
      throw new Error('Zip entry is larger than its declared size.');
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

async function openZip(location: string, size: number): Promise<PluginSource> {
  if (size > ZIP_LIMITS.maxArchiveBytes) {
    throw new Error(
      `The zip is larger than ${ZIP_LIMITS.maxArchiveBytes} bytes. Pass the unpacked folder instead.`,
    );
  }
  // strictFileNames rejects absolute paths, ".." segments, and backslashes.
  const zip = await fromBufferPromise(await fs.readFile(location), {
    lazyEntries: true,
    strictFileNames: true,
  });
  const contents = new Map<string, Uint8Array>();
  const skipped: SkippedEntry[] = [];
  let total = 0;
  try {
    if (zip.entryCount > ZIP_LIMITS.maxEntries) {
      throw new Error(
        `The zip has more than ${ZIP_LIMITS.maxEntries} entries.`,
      );
    }
    for await (const entry of zip.eachEntry()) {
      const name = entry.fileName;
      const segments = name.split('/');
      if (name.endsWith('/')) continue;
      if (segments.some((segment) => IGNORED_DIRECTORIES.has(segment))) {
        continue;
      }
      const fileType = (entry.externalFileAttributes >>> 16) & 0o170000;
      if (fileType === 0o120000) {
        skipped.push({ path: name, reason: 'symbolic link' });
        continue;
      }
      if (fileType !== 0 && fileType !== 0o100000) {
        skipped.push({ path: name, reason: 'not a regular file' });
        continue;
      }
      if (entry.isEncrypted()) {
        throw new Error(`Encrypted zip entries are not supported: ${name}`);
      }
      total += entry.uncompressedSize;
      if (total > ZIP_LIMITS.maxTotalBytes) {
        throw new Error(
          `The zip expands to more than ${ZIP_LIMITS.maxTotalBytes} bytes.`,
        );
      }
      const stream = await zip.openReadStreamPromise(entry);
      contents.set(name, await readBounded(stream, entry.uncompressedSize));
    }
  } finally {
    zip.close();
  }

  // GitHub's "Download ZIP" wraps the repository in one top-level folder.
  const names = [...contents.keys()];
  const first = names[0]?.split('/')[0];
  const wrapped =
    first !== undefined &&
    names.every((name) => name.startsWith(`${first}/`)) &&
    names.length > 0;
  const files = new Map<string, Uint8Array>();
  for (const [name, bytes] of contents) {
    files.set(wrapped ? name.slice(first.length + 1) : name, bytes);
  }

  return {
    location,
    files: new Set(files.keys()),
    skipped: skipped.map((entry) => ({
      ...entry,
      path:
        wrapped && entry.path.startsWith(`${first}/`)
          ? entry.path.slice(first.length + 1)
          : entry.path,
    })),
    read: (file) => {
      const bytes = files.get(file);
      if (!bytes)
        return Promise.reject(new Error(`Not a plugin file: ${file}`));
      return Promise.resolve(bytes);
    },
  };
}

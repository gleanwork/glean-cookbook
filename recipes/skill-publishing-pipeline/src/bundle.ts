import fs from 'node:fs/promises';
import path from 'node:path';
import yauzl, { type Entry, type ZipFile } from 'yauzl';

export interface BundleLimits {
  maxEntries: number;
  maxFileBytes: number;
  maxTotalBytes: number;
}

export const DEFAULT_LIMITS: BundleLimits = {
  maxEntries: 100,
  maxFileBytes: 2 * 1024 * 1024,
  maxTotalBytes: 10 * 1024 * 1024,
};

export async function readBundle(filePath: string) {
  const resolved = path.resolve(filePath);
  const stats = await fs.stat(resolved);
  if (!stats.isFile()) {
    throw new Error('Bundle must be a SKILL.md, .zip, or .skill file.');
  }
  const fileName = path.basename(resolved);
  if (
    fileName !== 'SKILL.md' &&
    !fileName.endsWith('.zip') &&
    !fileName.endsWith('.skill')
  ) {
    throw new Error('Bundle must be named SKILL.md or end in .zip or .skill.');
  }
  return { fileName, content: new Uint8Array(await fs.readFile(resolved)) };
}

export async function readStream(
  stream: ReadableStream<Uint8Array>,
  maxBytes = DEFAULT_LIMITS.maxTotalBytes,
): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`Downloaded bundle exceeds ${maxBytes} bytes.`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

function openZip(buffer: Buffer): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zipFile) => {
      if (error) reject(error);
      else if (!zipFile) reject(new Error('Could not open downloaded bundle.'));
      else resolve(zipFile);
    });
  });
}

function validateEntry(entry: Entry): {
  relativePath: string;
  directory: boolean;
} {
  const relativePath = entry.fileName;
  if (
    !relativePath ||
    relativePath.includes('\\') ||
    relativePath.includes('\0') ||
    path.posix.isAbsolute(relativePath) ||
    path.posix.normalize(relativePath) !== relativePath ||
    relativePath.split('/').includes('..')
  ) {
    throw new Error(`Unsafe bundle path: ${JSON.stringify(relativePath)}`);
  }
  if ((entry.generalPurposeBitFlag & 0x1) !== 0) {
    throw new Error(
      `Encrypted bundle entries are not supported: ${relativePath}`,
    );
  }

  const unixMode = entry.externalFileAttributes >>> 16;
  const fileType = unixMode & 0o170000;
  if (fileType === 0o120000) {
    throw new Error(`Symbolic links are not allowed: ${relativePath}`);
  }

  const directory = relativePath.endsWith('/');
  if (
    fileType !== 0 &&
    fileType !== 0o100000 &&
    !(directory && fileType === 0o040000)
  ) {
    throw new Error(
      `Only regular files and directories are allowed: ${relativePath}`,
    );
  }
  return { relativePath, directory };
}

function readEntry(
  zipFile: ZipFile,
  entry: Entry,
  maxBytes: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zipFile.openReadStream(entry, (error, stream) => {
      if (error) {
        reject(error);
        return;
      }
      if (!stream) {
        reject(new Error(`Could not read ${entry.fileName}.`));
        return;
      }
      const chunks: Buffer[] = [];
      let total = 0;
      let settled = false;
      stream.on('data', (chunk: Buffer) => {
        total += chunk.byteLength;
        if (total > maxBytes) {
          settled = true;
          stream.destroy();
          reject(
            new Error(`${entry.fileName} exceeds the per-file size limit.`),
          );
          return;
        }
        chunks.push(chunk);
      });
      stream.once('error', (error) => {
        if (!settled) reject(error);
      });
      stream.once('end', () => {
        if (!settled) resolve(Buffer.concat(chunks));
      });
    });
  });
}

export async function stageDownloadedBundle(
  archive: Buffer,
  destination: string,
  limits: BundleLimits = DEFAULT_LIMITS,
): Promise<string[]> {
  const root = path.resolve(destination);
  await fs.mkdir(path.dirname(root), { recursive: true });
  await fs.mkdir(root, { recursive: false, mode: 0o700 });

  const zipFile = await openZip(archive);
  const staged: string[] = [];
  let entries = 0;
  let totalBytes = 0;

  try {
    await new Promise<void>((resolve, reject) => {
      const fail = (error: unknown) => {
        zipFile.close();
        reject(error instanceof Error ? error : new Error(String(error)));
      };

      zipFile.once('error', fail);
      zipFile.once('end', resolve);
      zipFile.on('entry', (entry: Entry) => {
        void (async () => {
          entries += 1;
          if (entries > limits.maxEntries) {
            throw new Error(
              `Bundle contains more than ${limits.maxEntries} entries.`,
            );
          }
          const { relativePath, directory } = validateEntry(entry);
          const target = path.resolve(root, relativePath);
          if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
            throw new Error(`Bundle path escapes the sandbox: ${relativePath}`);
          }
          if (directory) {
            await fs.mkdir(target, { recursive: true, mode: 0o700 });
          } else {
            if (entry.uncompressedSize > limits.maxFileBytes) {
              throw new Error(
                `${relativePath} exceeds the per-file size limit.`,
              );
            }
            const content = await readEntry(
              zipFile,
              entry,
              limits.maxFileBytes,
            );
            if (content.byteLength > limits.maxFileBytes) {
              throw new Error(
                `${relativePath} exceeds the per-file size limit.`,
              );
            }
            totalBytes += content.byteLength;
            if (totalBytes > limits.maxTotalBytes) {
              throw new Error('Bundle exceeds the aggregate size limit.');
            }
            await fs.mkdir(path.dirname(target), {
              recursive: true,
              mode: 0o700,
            });
            await fs.writeFile(target, content, { flag: 'wx', mode: 0o600 });
            staged.push(relativePath);
          }
          zipFile.readEntry();
        })().catch(fail);
      });
      zipFile.readEntry();
    });
  } catch (error) {
    await fs.rm(root, { recursive: true, force: true });
    throw error;
  } finally {
    zipFile.close();
  }

  if (!staged.some((file) => path.posix.basename(file) === 'SKILL.md')) {
    await fs.rm(root, { recursive: true, force: true });
    throw new Error('Downloaded bundle does not contain SKILL.md.');
  }
  return staged;
}

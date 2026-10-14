import { createHash } from 'node:crypto';
import path from 'node:path';
import { Readable } from 'node:stream';
import { crc32 } from 'node:zlib';
import { zipSync, type Zippable } from 'fflate';
import { fromBufferPromise } from 'yauzl';
import type { DiscoveredSkill } from './discover.js';
import type { PluginSource } from './plugin-source.js';

export interface SkillBundle {
  skill: DiscoveredSkill;
  /** Upload name; the API accepts SKILL.md, .zip, or .skill bundles. */
  fileName: string;
  content: Uint8Array;
  files: Map<string, Uint8Array>;
  /** Identifies identical skill folders, such as per-harness copies. */
  digest: string;
}

// A fixed timestamp keeps the same folder producing the same archive bytes.
const ZIP_MTIME = new Date('2000-01-01T00:00:00Z');

export async function buildBundle(
  source: PluginSource,
  skill: DiscoveredSkill,
): Promise<SkillBundle> {
  const files = new Map<string, Uint8Array>();
  const hash = createHash('sha256');
  const zippable: Zippable = {};
  for (const file of skill.files) {
    const bytes = await source.read(skill.dir ? `${skill.dir}/${file}` : file);
    files.set(file, bytes);
    hash.update(`${file}\0${bytes.byteLength}\0`).update(bytes);
    zippable[file] = [bytes, { mtime: ZIP_MTIME }];
  }
  if (!files.has('SKILL.md')) {
    throw new Error(`${skill.dir || 'The plugin root'} has no SKILL.md.`);
  }
  const base = path.posix.basename(skill.dir) || 'skill';
  return {
    skill,
    fileName: `${base}.zip`,
    content: zipSync(zippable, { level: 6 }),
    files,
    digest: hash.digest('hex'),
  };
}

export async function readStream(
  stream: { getReader(): ReadableStreamDefaultReader<Uint8Array> },
  maxBytes: number,
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
      throw new Error(`Downloaded content exceeds ${maxBytes} bytes.`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * Compare a downloaded skill ZIP with the uploaded files, in memory. Compare
 * file bytes rather than archive bytes: compression and timestamps can change.
 */
export async function verifyDownloadedBundle(
  archive: Buffer,
  uploaded: Map<string, Uint8Array>,
) {
  const zip = await fromBufferPromise(archive, {
    lazyEntries: true,
    strictFileNames: true,
  });
  const seen = new Set<string>();
  try {
    for await (const entry of zip.eachEntry()) {
      if (entry.fileName.endsWith('/')) continue;
      const fileType = (entry.externalFileAttributes >>> 16) & 0o170000;
      const expected = uploaded.get(entry.fileName);
      if (!expected || (fileType !== 0 && fileType !== 0o100000)) {
        throw new Error(
          `Downloaded bundle has an unexpected entry: ${entry.fileName}`,
        );
      }
      if (entry.uncompressedSize !== expected.byteLength) {
        throw new Error(`${entry.fileName} does not match the uploaded file.`);
      }
      const stream = await zip.openReadStreamPromise(entry);
      const content = await readStream(
        Readable.toWeb(stream),
        expected.byteLength,
      );
      // yauzl validates sizes and decompression, but does not verify CRC-32.
      if (crc32(content) !== entry.crc32) {
        throw new Error(`${entry.fileName} failed its ZIP checksum.`);
      }
      if (!content.equals(Buffer.from(expected))) {
        throw new Error(`${entry.fileName} does not match the uploaded file.`);
      }
      seen.add(entry.fileName);
    }
  } finally {
    zip.close();
  }
  const missing = [...uploaded.keys()].filter((file) => !seen.has(file));
  if (missing.length > 0) {
    throw new Error(`Downloaded bundle is missing ${missing.join(', ')}.`);
  }
}

import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { crc32 } from 'node:zlib';
import { fromBufferPromise } from 'yauzl';

export const MAX_CONTENT_BYTES = 10 * 1024 * 1024;

export async function readSkillMd(filePath: string) {
  const resolved = path.resolve(filePath);
  const stats = await fs.stat(resolved);
  if (!stats.isFile() || path.basename(resolved) !== 'SKILL.md') {
    throw new Error('Provide a local SKILL.md file.');
  }
  return {
    fileName: 'SKILL.md',
    content: new Uint8Array(await fs.readFile(resolved)),
  };
}

export async function readStream(
  stream: { getReader(): ReadableStreamDefaultReader<Uint8Array> },
  maxBytes = MAX_CONTENT_BYTES,
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
      throw new Error(`Downloaded skill content exceeds ${maxBytes} bytes.`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

// A single Markdown upload is returned as a ZIP with one root SKILL.md.
// Compare file bytes, not ZIP bytes: archive timestamps and compression can change.
export async function verifyDownloadedSkill(
  archive: Buffer,
  uploaded: Uint8Array,
): Promise<void> {
  const zip = await fromBufferPromise(archive, {
    lazyEntries: true,
    strictFileNames: true,
  });
  try {
    const layoutError =
      'Downloaded bundle must contain exactly one regular SKILL.md file.';
    if (zip.entryCount !== 1) throw new Error(layoutError);
    for await (const entry of zip.eachEntry()) {
      const fileType = (entry.externalFileAttributes >>> 16) & 0o170000;
      if (
        entry.fileName !== 'SKILL.md' ||
        (entry.externalFileAttributes & 0x10) !== 0 || // DOS directory flag
        (fileType !== 0 && fileType !== 0o100000)
      ) {
        throw new Error(layoutError);
      }
      if (entry.uncompressedSize !== uploaded.byteLength) {
        throw new Error(
          'Downloaded SKILL.md does not match the uploaded file.',
        );
      }
      const stream = await zip.openReadStreamPromise(entry);
      const content = await readStream(
        Readable.toWeb(stream),
        uploaded.byteLength,
      );
      // yauzl validates sizes and decompression, but does not verify CRC-32.
      if (crc32(content) !== entry.crc32) {
        throw new Error('Downloaded SKILL.md failed its ZIP checksum.');
      }
      if (!content.equals(Buffer.from(uploaded))) {
        throw new Error(
          'Downloaded SKILL.md does not match the uploaded file.',
        );
      }
    }
  } finally {
    zip.close();
  }
}

export async function saveLatestContent(
  bytes: Buffer,
  destination: string,
): Promise<string> {
  const resolved = path.resolve(destination);
  await fs.mkdir(path.dirname(resolved), { recursive: true, mode: 0o700 });
  await fs.writeFile(resolved, bytes, { flag: 'wx', mode: 0o600 });
  return resolved;
}

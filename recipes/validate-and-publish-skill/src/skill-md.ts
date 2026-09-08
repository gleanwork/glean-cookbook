import fs from 'node:fs/promises';
import path from 'node:path';

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
  stream: ReadableStream<Uint8Array>,
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

export async function saveLatestContent(
  bytes: Buffer,
  destination: string,
): Promise<string> {
  const resolved = path.resolve(destination);
  await fs.mkdir(path.dirname(resolved), { recursive: true, mode: 0o700 });
  await fs.writeFile(resolved, bytes, { flag: 'wx', mode: 0o600 });
  return resolved;
}

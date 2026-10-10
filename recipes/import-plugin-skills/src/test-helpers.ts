import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const roots: string[] = [];

export function skillMd(name: string, description = `Use ${name}.`) {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`;
}

/** Write a file tree into a new temporary folder and return its path. */
export async function writeTree(files: Record<string, string | object>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'plugin-import-'));
  roots.push(root);
  for (const [file, content] of Object.entries(files)) {
    const target = path.join(root, file);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(
      target,
      typeof content === 'string' ? content : JSON.stringify(content),
    );
  }
  return root;
}

export async function removeTrees() {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
}

import path from 'node:path';

import fs from 'fs-extra';

export function defineArtifacts(definitions) {
  return definitions;
}

export async function compileArtifacts(definitions, context) {
  const outputs = (
    await Promise.all(
      definitions.map(async (definition) => {
        const [content, targets] = await Promise.all([
          definition.content(context),
          definition.targets(context),
        ]);
        return targets.map((target) => ({
          group: definition.id,
          file: path.resolve(context.repoRoot, target),
          content: Buffer.isBuffer(content) ? content : Buffer.from(content),
          mode: definition.mode,
        }));
      }),
    )
  ).flat();

  const owners = new Map();
  for (const output of outputs) {
    const previous = owners.get(output.file);
    if (previous) {
      throw new Error(
        `${path.relative(context.repoRoot, output.file)} is produced by both ${previous} and ${output.group}`,
      );
    }
    owners.set(output.file, output.group);
  }
  return outputs.sort((a, b) => a.file.localeCompare(b.file));
}

export async function materializeArtifacts(outputs, { check = false } = {}) {
  const changes = [];
  for (const output of outputs) {
    const current = await fs.readFile(output.file).catch((error) => {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    });
    if (current?.equals(output.content)) continue;
    changes.push(output);
    if (!check) {
      await fs.outputFile(output.file, output.content, {
        mode: output.mode,
      });
    }
  }
  return changes;
}

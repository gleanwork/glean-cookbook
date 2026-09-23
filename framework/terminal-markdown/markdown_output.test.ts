import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NO_COLOR = '1';
delete process.env.FORCE_COLOR;
process.env.FORCE_HYPERLINK = '1';
const markdownOutputModule = await import('./markdown_output.js');
const { createMarkdownOutput, outputFormats, parseOutputFormat } =
  markdownOutputModule;

function capture(isTTY = false) {
  const chunks: string[] = [];
  const target = {
    columns: 80,
    isTTY,
    write(chunk: string) {
      chunks.push(chunk);
    },
  };
  return { chunks, target };
}

test('exports the centralized output-format policy without changing caller environment', () => {
  assert.equal(process.env.FORCE_COLOR, undefined);
  assert.equal(process.env.FORCE_HYPERLINK, '1');
  assert.deepEqual(Object.keys(markdownOutputModule), [
    'createMarkdownOutput',
    'outputFormats',
    'parseOutputFormat',
  ]);
  assert.deepEqual(outputFormats, ['auto', 'terminal', 'markdown']);
  for (const format of outputFormats)
    assert.equal(parseOutputFormat(format), format);
  assert.throws(() => parseOutputFormat('html'), /auto, terminal, or markdown/);
  assert.throws(
    () => createMarkdownOutput('html' as never, capture().target),
    /auto, terminal, or markdown/,
  );
});

const markdown = `# Release notes

- Parent
  - Nested item

Read [the guide](https://example.com/guide).

\`\`\`ts
const ready = true;
\`\`\`

| Name | State |
| --- | --- |
| API | Ready |`;

test('auto resolves once and raw documents preserve Markdown with a final newline', () => {
  const { chunks, target } = capture(false);
  const output = createMarkdownOutput('auto', target);
  target.isTTY = true;

  assert.deepEqual(Object.keys(output).sort(), ['document', 'plain', 'stream']);
  output.document(markdown);
  output.document('already complete\n');

  assert.equal(chunks[0], `${markdown}\n`);
  assert.equal(chunks[1], 'already complete\n');
});

test('terminal documents render common Markdown, keep links visible, and end with a newline', () => {
  const { chunks, target } = capture(true);
  const output = createMarkdownOutput('auto', target);

  output.document(markdown);

  const rendered = chunks.join('');
  assert.match(rendered, /# Release notes/);
  assert.match(rendered, /Parent[\s\S]*Nested item/);
  assert.match(rendered, /the guide \(https:\/\/example\.com\/guide\)/);
  assert.match(rendered, /const ready = true;/);
  assert.match(rendered, /Name[\s\S]*State[\s\S]*API[\s\S]*Ready/);
  assert.doesNotMatch(rendered, /```|\| --- \|/);
  assert.doesNotMatch(rendered, /\u001B/);
  assert.ok(rendered.endsWith('\n'));
});

test('raw output never parses or sanitizes Markdown', () => {
  const hostile =
    '# **literal**\u0007\n' +
    '\u001B]8;;https://attacker.example\u0007click\u001B]8;;\u0007';
  const { chunks, target } = capture();
  const output = createMarkdownOutput('markdown', target);

  output.plain(hostile);
  output.document(hostile);

  assert.equal(chunks[0], hostile);
  assert.equal(chunks[1], `${hostile}\n`);
});

test('terminal plain text removes unsafe controls without parsing Markdown', () => {
  const hostile =
    '**Policy**\t[guide](https://safe.example)\n' +
    'safe \u001B[31mred\u001B[0m ' +
    '\u001B]8;;https://esc.example\u0007click\u001B]8;;\u0007 ' +
    '\u009D8;;https://c1.example\u0007open\u009D8;;\u0007 ' +
    '\u001BPdrop-me\u001B\\kept \u009Fdrop-too\u009Cvisible ' +
    'bell\u0007 back\bspace raw\u001B escape incomplete\u001B[\nnext';
  const { chunks, target } = capture(true);
  const output = createMarkdownOutput('terminal', target);

  output.plain(hostile);

  const rendered = chunks.join('');
  assert.ok(rendered.startsWith('**Policy**\t[guide](https://safe.example)\n'));
  assert.match(rendered, /safe red click open/);
  assert.match(rendered, /drop-me.*kept.*drop-too.*visible/);
  assert.match(rendered, /bell backspace raw escape incomplete/);
  assert.doesNotMatch(rendered, /esc\.example|c1\.example/);
  assert.doesNotMatch(rendered, /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/u);
});

test('real deltas write exactly once and completion adds only the final newline', () => {
  const { chunks, target } = capture();
  const stream = createMarkdownOutput('markdown', target).stream();

  assert.equal(stream.delta('# Release'), undefined);
  assert.equal(stream.delta(' notes'), undefined);
  assert.deepEqual(chunks, ['# Release', ' notes']);
  assert.equal(stream.complete(), undefined);
  assert.deepEqual(chunks, ['# Release', ' notes', '\n']);

  assert.throws(() => stream.delta(' late'), /after stream completion/);
  assert.throws(
    () => stream.snapshot('# Release notes'),
    /after stream completion/,
  );
  assert.throws(() => stream.complete(), /already complete/);
});

test('cumulative snapshots emit only new text and reject rewrites', () => {
  const { chunks, target } = capture();
  const stream = createMarkdownOutput('markdown', target).stream();

  assert.equal(stream.snapshot('# Release'), undefined);
  assert.equal(stream.snapshot('# Release notes'), undefined);
  assert.equal(stream.snapshot('# Release notes'), undefined);
  assert.throws(() => stream.snapshot('# Replacement'), /must be cumulative/);
  assert.equal(stream.complete(), undefined);

  assert.deepEqual(chunks, ['# Release', ' notes', '\n']);
});

test('streams reject switching between delta and snapshot modes', () => {
  const deltaStream = createMarkdownOutput(
    'markdown',
    capture().target,
  ).stream();
  deltaStream.delta('one');
  assert.throws(() => deltaStream.snapshot('one two'), /delta to snapshot/);

  const snapshotStream = createMarkdownOutput(
    'markdown',
    capture().target,
  ).stream();
  snapshotStream.snapshot('one');
  assert.throws(() => snapshotStream.delta(' two'), /snapshot to delta/);
});

test('terminal streams buffer and render the complete accumulated document once', () => {
  const { chunks, target } = capture(true);
  const stream = createMarkdownOutput('terminal', target).stream();

  stream.delta('# Release');
  stream.delta(' notes\n\nRead [the guide](https://example.com/guide).');
  assert.deepEqual(chunks, []);

  assert.equal(stream.complete(), undefined);
  assert.equal(chunks.length, 1);
  assert.match(chunks[0] ?? '', /the guide \(https:\/\/example\.com\/guide\)/);
  assert.ok((chunks[0] ?? '').endsWith('\n'));
});

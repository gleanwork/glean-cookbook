// GLEAN_FRAMEWORK_FEATURE: terminal-markdown/typescript
import { createRequire } from 'node:module';
import stripAnsi from 'strip-ansi';

export const outputFormats = ['auto', 'terminal', 'markdown'] as const;
export type OutputFormat = (typeof outputFormats)[number];

export function parseOutputFormat(value: unknown): OutputFormat {
  if (
    typeof value === 'string' &&
    outputFormats.includes(value as OutputFormat)
  ) {
    return value as OutputFormat;
  }
  throw new Error('--format must be auto, terminal, or markdown.');
}

interface OutputTarget {
  columns?: number;
  isTTY?: boolean;
  write(chunk: string): unknown;
}

interface MarkdownStream {
  delta(chunk: string): void;
  snapshot(document: string): void;
  complete(): void;
}

interface MarkdownOutput {
  plain(text: string): void;
  document(markdown: string): void;
  stream(): MarkdownStream;
}

interface TerminalRendererOptions {
  reflowText?: boolean;
  tableOptions?: {
    style?: {
      border?: string[];
      head?: string[];
    };
  };
  width?: number;
}

interface MarkdownParser {
  parse(markdown: string): string | Promise<string>;
}

type MarkedExtension = unknown;

// marked-terminal loads hyperlink support once. Force visible URLs only while
// loading it, then restore the caller's process environment. Chalk observes
// NO_COLOR directly; cli-table3 receives its no-color style below.
const previousForceHyperlink = process.env.FORCE_HYPERLINK;
process.env.FORCE_HYPERLINK = '0';

const require = createRequire(import.meta.url);
const { Marked } = require('marked') as {
  Marked: new (...extensions: MarkedExtension[]) => MarkdownParser;
};
const { markedTerminal } = require('marked-terminal') as {
  markedTerminal: (options?: TerminalRendererOptions) => MarkedExtension;
};

if (previousForceHyperlink === undefined) delete process.env.FORCE_HYPERLINK;
else process.env.FORCE_HYPERLINK = previousForceHyperlink;

const c1ToEsc = new Map([
  ['\u0090', '\u001BP'],
  ['\u0098', '\u001BX'],
  ['\u009B', '\u001B['],
  ['\u009C', '\u001B\\'],
  ['\u009D', '\u001B]'],
  ['\u009E', '\u001B^'],
  ['\u009F', '\u001B_'],
]);
const c1Sequence = /[\u0090\u0098\u009B-\u009F]/gu;
const unsafeTerminalControls = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/gu;

function sanitizeTerminalText(text: string): string {
  const normalized = text.replace(
    c1Sequence,
    (control) => c1ToEsc.get(control) ?? control,
  );
  return stripAnsi(normalized).replace(unsafeTerminalControls, '');
}

function withFinalNewline(text: string): string {
  return text.endsWith('\n') ? text : `${text}\n`;
}

export function createMarkdownOutput(
  format: OutputFormat,
  target: OutputTarget = process.stdout,
): MarkdownOutput {
  const validFormat = parseOutputFormat(format);
  const isTerminal =
    validFormat === 'terminal' ||
    (validFormat === 'auto' && target.isTTY === true);

  function render(markdown: string): string {
    const renderer = new Marked(
      markedTerminal({
        reflowText: false,
        tableOptions:
          process.env.NO_COLOR === undefined
            ? undefined
            : { style: { border: [], head: [] } },
        width: target.columns ?? 80,
      }),
    );
    const rendered = renderer.parse(sanitizeTerminalText(markdown));
    if (typeof rendered !== 'string') {
      throw new Error(
        'Terminal Markdown rendering unexpectedly became asynchronous.',
      );
    }
    return withFinalNewline(rendered.trimEnd());
  }

  function writeDocument(markdown: string): void {
    target.write(isTerminal ? render(markdown) : withFinalNewline(markdown));
  }

  return {
    plain(text) {
      target.write(isTerminal ? sanitizeTerminalText(text) : text);
    },
    document: writeDocument,
    stream() {
      let completed = false;
      let mode: 'delta' | 'snapshot' | undefined;
      let text = '';

      function prepareWrite(nextMode: 'delta' | 'snapshot'): void {
        if (completed) throw new Error('Cannot write after stream completion.');
        if (mode !== undefined && mode !== nextMode) {
          throw new Error(
            `Cannot switch Markdown stream from ${mode} to ${nextMode} mode.`,
          );
        }
        mode = nextMode;
      }

      return {
        delta(chunk) {
          prepareWrite('delta');
          text += chunk;
          if (!isTerminal) target.write(chunk);
        },
        snapshot(document) {
          prepareWrite('snapshot');
          if (!document.startsWith(text)) {
            throw new Error('Markdown stream snapshots must be cumulative.');
          }
          const delta = document.slice(text.length);
          text = document;
          if (!isTerminal && delta) target.write(delta);
        },
        complete() {
          if (completed)
            throw new Error('Markdown stream is already complete.');
          completed = true;
          if (isTerminal) target.write(render(text));
          else if (!text.endsWith('\n')) target.write('\n');
        },
      };
    },
  };
}

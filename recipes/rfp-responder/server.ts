import 'dotenv/config';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  dedupe,
  extractRows,
  parseCsv,
  similarity,
  type ColumnMapping,
} from './lib/questionnaire.ts';
import { classify } from './lib/grounding.ts';
import { askChat } from './lib/chat.ts';
import * as library from './lib/answer-library.ts';
import { findRow, log, requireRun, state, type RowState } from './lib/state.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REVIEWER = process.env.RFP_REVIEWER ?? 'sam.reyes@sample.example.com';

function json(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req: http.IncomingMessage): Promise<Record<string, never>> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

/** Step 1 + 2: parse, map columns, dedup, and pre-fill from the answer library. */
function handleParse(csv: string, mapping: ColumnMapping, sourceName: string) {
  const records = parseCsv(csv);
  const parsed = extractRows(records, mapping);
  const { unique, links, mergeCandidates } = dedupe(parsed);
  const uniqueIds = new Set(unique.map((row) => row.rowId));

  const rows: RowState[] = parsed.map((row) => {
    const remembered = uniqueIds.has(row.rowId)
      ? library.lookup(row.question)
      : undefined;
    return {
      ...row,
      status: remembered ? 'drafted' : 'pending',
      answer: remembered?.answer ?? '',
      citations: remembered?.citations ?? [],
      confidence: remembered ? 'strong' : null,
      reason: remembered
        ? 'Pre-filled from the answer library (previously accepted by a reviewer).'
        : '',
      editedByReviewer: false,
      fromLibrary: Boolean(remembered),
      inheritedFrom: links.find((link) => link.rowId === row.rowId)
        ?.duplicateOfRowId,
    };
  });

  state.run = {
    rows,
    duplicates: links,
    mergeCandidates,
    approvals: [],
    sourceName,
  };

  return {
    sourceName,
    tabs: [...new Set(parsed.map((row) => row.tab))],
    parsed: parsed.length,
    unique: unique.length,
    autoMerged: links.length,
    mergeCandidates: mergeCandidates.slice(0, 10),
    rows,
  };
}

/** Step 3: batched Chat calls with progress streamed over SSE. */
async function handleRun(res: http.ServerResponse): Promise<void> {
  const run = requireRun();
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const send = (event: string, data: unknown) =>
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  // Only rows that own their answer get a call. Duplicates inherit, library
  // pre-fills are already answered.
  const todo = run.rows.filter(
    (row) => row.inheritedFrom === undefined && !row.fromLibrary,
  );
  send('start', { total: todo.length, skipped: run.rows.length - todo.length });

  for (const [index, row] of todo.entries()) {
    try {
      const { answer, citations } = await askChat(row.questionId, row.question);
      const verdict = classify(row.question, answer, citations);
      // From the verdict, not the raw reply: a row routed to a human must not
      // keep the prose or the citations that were refused.
      row.answer = verdict.answer;
      row.citations = verdict.citations;
      row.confidence = verdict.confidence;
      row.reason = verdict.reason;
      row.status = verdict.needsSme ? 'needs-sme' : 'drafted';
    } catch (error) {
      row.status = 'needs-sme';
      row.confidence = 'none';
      row.reason = `Retrieval failed: ${(error as Error).message}`;
    }
    send('progress', { done: index + 1, total: todo.length, row });
  }

  // Duplicates inherit whatever their source row ended up with.
  for (const row of run.rows) {
    if (row.inheritedFrom === undefined) continue;
    const source = findRow(run, row.inheritedFrom);
    row.answer = source.answer;
    row.citations = source.citations;
    row.confidence = source.confidence;
    row.status = source.status;
    row.reason = `Inherited from ${source.questionId} (identical question).`;
  }

  send('done', { rows: run.rows });
  res.end();
}

const server = http.createServer(async (req, res) => {
  try {
    if (
      req.method === 'GET' &&
      (req.url === '/' || req.url === '/index.html')
    ) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(path.join(__dirname, 'public', 'index.html')));
      return;
    }

    // Convenience for the demo: load the committed questionnaire fixture.
    if (req.method === 'GET' && req.url === '/api/sample') {
      const csv = fs.readFileSync(
        path.join(__dirname, 'fixtures', 'sample-security-questionnaire.csv'),
        'utf8',
      );
      json(res, 200, { csv, columns: Object.keys(parseCsv(csv)[0] ?? {}) });
      return;
    }

    if (req.method === 'POST' && req.url === '/api/parse') {
      const body = (await readBody(req)) as unknown as {
        csv: string;
        mapping: ColumnMapping;
        sourceName?: string;
      };
      json(
        res,
        200,
        handleParse(
          body.csv,
          body.mapping,
          body.sourceName ?? 'sample-security-questionnaire.csv',
        ),
      );
      return;
    }

    if (req.method === 'POST' && req.url === '/api/run') {
      await handleRun(res);
      return;
    }

    if (req.method === 'POST' && req.url === '/api/regenerate') {
      const { rowId, steering } = (await readBody(req)) as unknown as {
        rowId: number;
        steering?: string;
      };
      const run = requireRun();
      const row = findRow(run, rowId);
      const { answer, citations } = await askChat(
        row.questionId,
        row.question,
        steering,
      );
      const verdict = classify(row.question, answer, citations);
      // From the verdict, not the raw reply: a row routed to a human must not
      // keep the prose or the citations that were refused.
      row.answer = verdict.answer;
      row.citations = verdict.citations;
      row.confidence = verdict.confidence;
      row.reason = verdict.reason;
      row.status = verdict.needsSme ? 'needs-sme' : 'drafted';
      json(res, 200, row);
      return;
    }

    if (req.method === 'POST' && req.url === '/api/accept') {
      const { rowId, answer } = (await readBody(req)) as unknown as {
        rowId: number;
        answer?: string;
      };
      const run = requireRun();
      const row = findRow(run, rowId);

      if (row.confidence === 'none' && !answer) {
        json(res, 400, {
          error:
            'Row has no supporting evidence. Assign it to an SME or supply an answer explicitly.',
        });
        return;
      }

      const edited = typeof answer === 'string' && answer !== row.answer;
      if (edited) {
        row.answer = answer;
        row.editedByReviewer = true;
      }
      row.status = 'accepted';

      library.remember({
        question: row.question,
        answer: row.answer,
        citations: row.citations,
        acceptedAt: new Date().toISOString(),
        acceptedBy: REVIEWER,
      });
      log(run, {
        actor: REVIEWER,
        action: edited ? 'edit-and-accept' : 'accept',
        rowId: row.rowId,
        questionId: row.questionId,
      });

      // Identical questions inherit the accepted answer.
      for (const other of run.rows) {
        if (other.rowId === row.rowId) continue;
        if (similarity(other.question, row.question) !== 1) continue;
        other.answer = row.answer;
        other.citations = row.citations;
        other.confidence = row.confidence;
        other.status = 'accepted';
        other.inheritedFrom = row.rowId;
        other.reason = `Inherited from ${row.questionId} (identical question).`;
      }

      json(res, 200, { rows: run.rows, approvals: run.approvals });
      return;
    }

    if (req.method === 'POST' && req.url === '/api/assign-sme') {
      const { rowId, assignee } = (await readBody(req)) as unknown as {
        rowId: number;
        assignee: string;
      };
      const run = requireRun();
      const row = findRow(run, rowId);
      row.status = 'needs-sme';
      row.smeAssignee = assignee;
      log(run, {
        actor: REVIEWER,
        action: 'assign-sme',
        rowId: row.rowId,
        questionId: row.questionId,
        detail: assignee,
      });
      json(res, 200, row);
      return;
    }

    if (req.method === 'POST' && req.url === '/api/export') {
      const run = requireRun();
      const unaccepted = run.rows.filter((row) => row.status !== 'accepted');
      const { confirmed } = (await readBody(req)) as unknown as {
        confirmed?: boolean;
      };
      if (!confirmed) {
        json(res, 409, {
          needsConfirmation: true,
          unaccepted: unaccepted.length,
          message: `${unaccepted.length} of ${run.rows.length} rows are not accepted. They will export blank, flagged for an SME.`,
        });
        return;
      }
      log(run, {
        actor: REVIEWER,
        action: 'export',
        detail: `${run.rows.length - unaccepted.length}/${run.rows.length} accepted`,
      });
      // Structure-preserving: original row order and ids, answers filled in place.
      const header =
        'row_id,tab,question_id,question,answer,citations,status,sme_assignee';
      const escape = (value: string) => `"${value.replace(/"/gu, '""')}"`;
      const body = run.rows.map((row) =>
        [
          row.rowId,
          escape(row.tab),
          escape(row.questionId),
          escape(row.question),
          escape(row.status === 'accepted' ? row.answer : ''),
          escape(row.citations.map((citation) => citation.url).join(' ')),
          escape(row.status),
          escape(row.smeAssignee ?? ''),
        ].join(','),
      );
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition':
          'attachment; filename="sample-security-questionnaire-answered.csv"',
      });
      res.end([header, ...body].join('\n'));
      return;
    }

    if (req.method === 'GET' && req.url === '/api/audit') {
      json(res, 200, requireRun().approvals);
      return;
    }

    res.writeHead(404);
    res.end();
  } catch (error) {
    json(res, 500, { error: (error as Error).message });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => {
  console.log(`RFP responder running at http://localhost:${port}`);
  if (process.env.GLEAN_USE_FIXTURE === 'true') {
    console.log('Fixture mode: no credentials used, no network calls made.');
  }
});

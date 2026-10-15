import type { DocumentsClient } from './client.js';
import type { DocumentSpec, DocumentsBatchResponse } from './documents.js';

/**
 * Documents Glean returns are printed from `results`. A document ID or URL
 * Glean does not return is printed under `warnings` on the same HTTP 200,
 * matched by `index`. The command still exits 0. If the HTTP call fails,
 * the command fails. If you asked for extracted text and Glean cannot read
 * it, the command fails instead of leaving `content` out.
 */
export async function batchRetrieveDocuments(
  client: DocumentsClient,
  input: { specs: readonly DocumentSpec[]; includeContent: boolean },
): Promise<DocumentsBatchResponse> {
  return client.batchGet(input.specs, input.includeContent);
}

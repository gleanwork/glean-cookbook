import type { DocumentsClient } from './client.js';
import type { DocumentSpec, DocumentsBatchResponse } from './documents.js';

/**
 * Found selectors are `results`. Complete misses are `warnings` on the same
 * HTTP 200, correlated by `index`. A transport or server error fails the
 * whole batch. Requested content that cannot be read also fails the batch
 * instead of omitting `content`.
 */
export async function batchRetrieveDocuments(
  client: DocumentsClient,
  input: { specs: readonly DocumentSpec[]; includeContent: boolean },
): Promise<DocumentsBatchResponse> {
  return client.batchGet(input.specs, input.includeContent);
}

// Shared assertions for `integrate` recipes. These ship no code of their own --
// the reader adapts the pattern into an app we don't have -- so what's
// verifiable is the platform behaviour the recipe promises: that Glean answers
// the recipe's demo queries with real citations, permission-filtered.
//
// This deliberately does not claim to verify a reader's integration. It
// verifies the foundation that integration rests on; if this fails, the recipe
// is telling people to build on something that doesn't work.

export async function chat(query, actAs) {
  const response = await fetch(
    `https://${process.env.GLEAN_INSTANCE}-be.glean.com/rest/api/v1/chat`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GLEAN_API_TOKEN}`,
        'Content-Type': 'application/json',
        ...(actAs ? { 'X-Glean-Act-As': actAs } : {}),
      },
      body: JSON.stringify({
        messages: [
          {
            author: 'USER',
            messageType: 'CONTENT',
            fragments: [{ text: query }],
          },
        ],
      }),
    },
  );
  if (!response.ok) {
    throw new Error(
      `/chat returned ${response.status}: ${(await response.text()).slice(0, 200)}`,
    );
  }
  return response.json();
}

/**
 * Pulls answer text and citations the way the cookbook's own recipes do:
 * CONTENT messages only (UPDATE messages narrate search/read steps and would
 * otherwise be prepended to the answer), and citations per fragment rather than
 * the deprecated top-level message.citations. This mirrors the fix that shipped
 * after a live run found citations[] silently empty.
 */
export function extractAnswer(body) {
  const messages = (body.messages ?? []).filter(
    (m) => m.messageType === 'CONTENT',
  );
  const fragments = messages.flatMap((m) => m.fragments ?? []);
  const answer = fragments
    .map((f) => f.text ?? '')
    .join('')
    .trim();
  const citations = [];
  const seen = new Set();
  for (const fragment of fragments) {
    const doc = fragment.citation?.sourceDocument;
    if (!doc?.url || seen.has(doc.url)) continue;
    seen.add(doc.url);
    citations.push({ title: doc.title, url: doc.url });
  }
  return { answer, citations };
}

/** Returns null on success, or a string naming the promised behaviour that failed. */
export async function assertCitedAnswer(query, actAs) {
  const { answer, citations } = extractAnswer(await chat(query, actAs));
  if (!answer) return 'chat returned no answer text for the query';
  if (citations.length === 0) {
    return 'chat answered with no citations — the recipe promises cited, grounded answers';
  }
  const untitled = citations.filter((c) => !c.title);
  if (untitled.length > 0) {
    return `${untitled.length} citation(s) missing a title: ${JSON.stringify(untitled)}`;
  }
  return null;
}

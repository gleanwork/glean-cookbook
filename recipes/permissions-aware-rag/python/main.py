"""Permissions-aware RAG — Glean Search as the retrieval layer for your own LLM app.

Verified against the actually installed pinned SDKs:
- glean-api-client==0.15.4: glean.client.search.query() (the Client API's
  /rest/api/v1/search) -- NOT the top-level glean.search.query(), which is
  a separate, newer data-retrieval API still in RFC as of this writing.
  Matches the same glean.client.* pattern already verified for the
  acme-answers recipe's chat.create() call.
- anthropic==0.120.0: messages.create() with model="claude-sonnet-5".

Per-user enforcement: a global/admin Glean token can impersonate a specific
user via the X-Glean-Act-As header (confirmed against internal auth docs,
not guessed) -- there is no "act_as" parameter on search.query() itself.
"""

from __future__ import annotations

import argparse
import os

from anthropic import Anthropic
from glean.api_client import Glean

MODEL = "claude-sonnet-5"


def retrieve(question: str, act_as: str | None) -> list[dict]:
    glean = Glean(
        api_token=os.environ["GLEAN_API_TOKEN"],
        instance=os.environ["GLEAN_INSTANCE"],
    )

    http_headers = {"X-Glean-Act-As": act_as} if act_as else None

    response = glean.client.search.query(
        query=question,
        page_size=8,
        http_headers=http_headers,
    )

    sources = []
    for result in response.results or []:
        if not result.title or not result.snippets:
            continue
        text = "\n".join(
            snippet.text for snippet in result.snippets if snippet.text
        )
        if text:
            sources.append({"title": result.title, "url": result.url, "text": text})
    return sources


def answer(question: str, sources: list[dict]) -> str:
    if not sources:
        return "I don't have information on that."

    context = "\n\n".join(
        f"[{i + 1}] {source['title']}\n{source['text']}"
        for i, source in enumerate(sources)
    )
    prompt = (
        f"Answer the question using ONLY the numbered sources below. "
        f"Cite sources inline like [1]. If the sources don't cover the "
        f"question, say you don't have information on that.\n\n"
        f"Sources:\n{context}\n\nQuestion: {question}"
    )

    client = Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    message = client.messages.create(
        model=MODEL,
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("question")
    parser.add_argument(
        "--act-as",
        help="Email to impersonate (requires a global/admin Glean token). "
        "Omit to search as the token's own identity.",
    )
    args = parser.parse_args()

    sources = retrieve(args.question, args.act_as)
    print(answer(args.question, sources))
    print("\nSources:")
    for i, source in enumerate(sources):
        print(f"  [{i + 1}] {source['title']} — {source['url']}")


if __name__ == "__main__":
    main()

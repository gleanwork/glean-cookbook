# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "anthropic==0.120.0",
#     "glean-api-client==0.15.4",
#     "python-dotenv==1.1.1",
# ]
# ///
"""Permissions-aware RAG — Glean's data-first Platform API as the retrieval
layer for your own LLM app.

Verified against the actually installed pinned SDKs (real HTTP round-trip
against a local echo server, headers and all -- not just constructed and
inspected):
- glean-api-client==0.15.4: the top-level glean.search.query() (not
  glean.client.search.query() -- that's the older Client/REST API, a
  different surface entirely). This is Glean's newer, data-first retrieval
  API (POST /api/search): launched publicly 2026-07 but still Experimental,
  so every call must opt in with X_GLEAN_INCLUDE_EXPERIMENTAL=true (env var,
  read automatically by the SDK -- there's no argument for this on
  search.query() itself). Response shape is deliberately plain: each result's
  `snippets` is a list of strings, not a list of {text: ...} objects like the
  Client API's search.query() -- one less unwrap.
- anthropic==0.120.0: messages.create() with model="claude-sonnet-5".

Per-user enforcement: a global/admin Glean token can impersonate a specific
"""

from __future__ import annotations

import argparse
import os

from anthropic import Anthropic
from dotenv import load_dotenv
from glean.api_client import Glean

# Every recipe README says to `cp .env.example .env`; uv run doesn't read that
# file and neither did this script, so following the documented setup failed on
# a missing credential. Loading it here makes the instructions true.
load_dotenv()

MODEL = "claude-sonnet-5"


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value


def retrieve(question: str) -> list[dict]:
    glean = Glean(
        api_token=require_env("GLEAN_API_TOKEN"),
        instance=require_env("GLEAN_INSTANCE"),
    )

    response = glean.search.query(
        query=question,
        page_size=8,
    )

    sources = []
    for result in response.results or []:
        if not result.title or not result.snippets:
            continue
        text = "\n".join(snippet for snippet in result.snippets if snippet)
        if text:
            sources.append({"title": result.title, "url": result.url, "text": text})
    return sources


def answer(question: str, sources: list[dict]) -> str:
    if not sources:
        return "I don't have information on that."

    context = "\n\n".join(
        f"[{i + 1}] {source['title']}\n{source['text']}" for i, source in enumerate(sources)
    )
    prompt = (
        f"Answer the question using ONLY the numbered sources below. "
        f"Cite sources inline like [1]. If the sources don't cover the "
        f"question, say you don't have information on that.\n\n"
        f"Sources:\n{context}\n\nQuestion: {question}"
    )

    client = Anthropic(api_key=require_env("ANTHROPIC_API_KEY"))
    message = client.messages.create(
        model=MODEL,
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )
    # content blocks are a union (text, tool-use, container-upload, ...); only
    # a text block carries .text, so narrow rather than assume, the same way
    # the TypeScript variant does.
    block = message.content[0]
    return block.text if block.type == "text" else ""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("question")
    args = parser.parse_args()

    sources = retrieve(args.question)
    print(answer(args.question, sources))
    print("\nSources:")
    for i, source in enumerate(sources):
        print(f"  [{i + 1}] {source['title']} — {source['url']}")


if __name__ == "__main__":
    main()

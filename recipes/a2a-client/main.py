# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "a2a-sdk==0.3.26",
#     "httpx==0.28.1",
#     "python-dotenv==1.1.1",
# ]
# ///
"""Call a Glean agent from an A2A client: card discovery, message/send,
multi-turn via context_id, and streaming.

Verified against the actually installed a2a-sdk==0.3.26 (spec 0.3 --
Glean's per-agent A2A server speaks 0.3 today; a2a-sdk 1.x will not
interop until the server upgrades, see EN-1972098):

- a2a.client.A2AClient (the class whose method names literally match
  "message/send" naming) is marked [DEPRECATED] in this pinned version
  itself, warning "Use ClientFactory to create a client with a JSON-RPC
  transport." This recipe uses the recommended ClientFactory/Client path
  instead, so it doesn't ship a cookbook example that immediately warns.
- Client.send_message() is always an async iterator -- it auto-selects
  streaming vs non-streaming based on ClientConfig(streaming=...) and the
  server's capabilities. There's no separate "stream" method to call;
  which ClientConfig you build the client with is what controls it.
- Message text lives at message.parts[i].root.text (Part is a
  discriminated union of TextPart/FilePart/DataPart).
"""

from __future__ import annotations

import asyncio
import os

import httpx
from a2a.client import A2ACardResolver, ClientConfig, ClientFactory
from a2a.client.helpers import create_text_message_object
from a2a.types import Message, Role, Task
from dotenv import load_dotenv

# Every recipe README says to `cp .env.example .env`; uv run doesn't read that
# file and neither did this script, so following the documented setup failed on
# a missing credential. Loading it here makes the instructions true.
load_dotenv()


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value


def extract_text(message: Message) -> str:
    return "".join(part.root.text for part in message.parts if part.root.kind == "text")


def unpack_event(event: Message | tuple[Task, object]) -> tuple[str, str | None]:
    """Returns (text, context_id) for either response shape send_message can yield.

    Simple chat-message-trigger agents (what this recipe targets) reply with
    a plain Message. Task-based agents yield (Task, UpdateEvent) pairs
    instead -- ClientEvent = tuple[Task, UpdateEvent] -- where the reply
    text is the last message in the task's history.
    """
    if isinstance(event, Message):
        return extract_text(event), event.context_id

    task, _update = event
    reply = task.history[-1] if task.history else None
    text = extract_text(reply) if reply else ""
    return text, task.context_id


async def main() -> None:
    card_url = require_env("GLEAN_A2A_CARD_URL")
    token = require_env("GLEAN_A2A_TOKEN")

    base_url, _, card_path = card_url.rpartition("/")
    auth_headers = {"Authorization": f"Bearer {token}"}

    async with httpx.AsyncClient(headers=auth_headers) as httpx_client:
        resolver = A2ACardResolver(httpx_client, base_url, agent_card_path=card_path)
        card = await resolver.get_agent_card()
        assert "/a2a/agents/" in card.url, f"Unexpected agent URL: {card.url}"

        # 1. message/send -- a plain, non-streaming call.
        sync_client = ClientFactory(
            ClientConfig(httpx_client=httpx_client, streaming=False)
        ).create(card)
        question = create_text_message_object(
            role=Role.user, content="Who owns the payments service?"
        )

        context_id = None
        async for event in sync_client.send_message(question):
            text, context_id = unpack_event(event)
            print(f"[turn 1] {text}")

        # 2. A follow-up reusing context_id proves multi-turn.
        follow_up = create_text_message_object(
            role=Role.user, content="Who's on call for it this week?"
        )
        follow_up.context_id = context_id

        async for event in sync_client.send_message(follow_up):
            text, _ = unpack_event(event)
            print(f"[turn 2, same context] {text}")

        # 3. Streaming: a separate client built with streaming=True.
        stream_client = ClientFactory(
            ClientConfig(httpx_client=httpx_client, streaming=True)
        ).create(card)
        long_question = create_text_message_object(
            role=Role.user,
            content="Summarize everything you know about the PAY-2114 incident in detail.",
        )
        print("[turn 3, streaming]", end=" ", flush=True)
        async for event in stream_client.send_message(long_question):
            text, _ = unpack_event(event)
            print(text, end="", flush=True)
        print()


if __name__ == "__main__":
    asyncio.run(main())

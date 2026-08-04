# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "glean-api-client==0.15.4",
#     "python-dotenv==1.1.1",
# ]
# ///
"""Invoke the incident-triage agent and demo the governed-tool branch.

Verified against the actually installed glean-api-client==0.15.4:
- Agents use glean.client.agents.run() (or .run_stream()), NOT the
  chat/search Message models -- agents.run() takes models.Message /
  models.MessageTextBlock, a distinct shape from chat.create's
  ChatMessage / ChatMessageFragment.
- run_stream() returns the raw SSE response body as a plain str, not a
  parsed event iterator -- if you want real per-event streaming you parse
  that text yourself. run() (wait-for-completion) is simpler and used
  here since this recipe cares about the final messages, not live tokens.
- The agent runs as whoever the credential belongs to. Glean forwards that
  identity to a custom tool as the Glean-User-Email header, which is where
  the tool server enforces its own authorization -- see ../tool-server/.

The agent itself (instructions, retrieval, the incident-ticket tool
attached) is built in the Glean Agent Builder UI -- there's no API to
create one from scratch. Find its ID from the builder URL or
glean.client.agents.list(), and pass it as GLEAN_AGENT_ID.
"""

from __future__ import annotations

import os

from dotenv import load_dotenv
from glean.api_client import Glean
from glean.api_client.models import ContentType, Message, MessageTextBlock

# Every recipe README says to `cp .env.example .env`; uv run doesn't read that
# file and neither did this script, so following the documented setup failed on
# a missing credential. Loading it here makes the instructions true.
load_dotenv()


def requireEnv(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value


def ask(glean: Glean, agent_id: str, question: str) -> None:
    response = glean.client.agents.run(
        agent_id=agent_id,
        messages=[
            Message(role="USER", content=[MessageTextBlock(text=question, type=ContentType.TEXT)])
        ],
    )

    status = response.run.status if response.run else None
    print(f"status: {status}")

    for message in response.messages or []:
        text = "".join(block.text for block in message.content or [])
        print(f"[{message.role}] {text}")


def main() -> None:
    glean = Glean(api_token=requireEnv("GLEAN_API_TOKEN"), instance=requireEnv("GLEAN_INSTANCE"))
    agent_id = requireEnv("GLEAN_AGENT_ID")
    question = (
        "Summarize open payments incidents and file a tracking ticket for the canary alarm issue."
    )

    # The agent runs as you, so both governance branches are demonstrated by
    # changing the tool server's allow-list rather than by impersonating anyone.
    # Run this once with your email in AUTHORIZED_EMAILS (the ticket is filed),
    # then once without it: the tool returns 403 and the agent falls back to a
    # read-only summary instead of failing the whole run. That fallback is the
    # behaviour worth seeing, and it comes from the agent's own instructions.
    ask(glean, agent_id, question)


if __name__ == "__main__":
    main()

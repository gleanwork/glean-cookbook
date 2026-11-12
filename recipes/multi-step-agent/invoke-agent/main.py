# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "glean-api-client==0.17.20",
#     "python-dotenv==1.1.1",
#     "rich==15.0.0",
# ]
# ///
"""Invoke the incident-triage agent and demo the governed-tool branch.

Current glean-api-client==0.17.20 contract:
- Run an agent with glean.agents.create_run(), not the chat models.
  messages take PlatformMessageInput / PlatformMessageTextBlockInput
  (role plus content blocks), a distinct shape from chat.create's
  ChatMessage / ChatMessageFragment.
- stream=False, with the default execution_mode REQUEST_BOUND, waits and
  returns PlatformAgentRunWaitResponse. stream=True returns the raw SSE
  body as a plain str, not a parsed event iterator. This recipe waits,
  because it only needs the final messages.
- The agent runs as whoever the credential belongs to. Glean forwards that
  identity to a custom tool as the Glean-User-Email header, which is where
  the tool server enforces its own authorization -- see ../tool-server/.

The agent itself (instructions, retrieval, the incident-ticket tool
attached) is built in the Glean Agent Builder UI -- there's no API to
create one from scratch. Find its ID from the builder URL or
glean.agents.search(), and pass it as GLEAN_AGENT_ID.
"""

from __future__ import annotations

import argparse
import os

from dotenv import load_dotenv
from glean.api_client import Glean
from glean.api_client.models import (
    PlatformAgentRunWaitResponse,
    PlatformContentType,
    PlatformMessageInput,
    PlatformMessageRole,
    PlatformMessageTextBlockInput,
)
from markdown_output import OUTPUT_FORMATS, MarkdownOutput, OutputFormat

# Load the local configuration created from .env.example.
load_dotenv()


def requireEnv(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value


def ask(
    glean: Glean,
    agent_id: str,
    question: str,
    output_format: OutputFormat,
) -> None:
    response = glean.agents.create_run(
        agent_id=agent_id,
        messages=[
            PlatformMessageInput(
                role=PlatformMessageRole.USER,
                content=[
                    PlatformMessageTextBlockInput(
                        text=question,
                        type=PlatformContentType.TEXT,
                    )
                ],
            )
        ],
        stream=False,
    )
    if not isinstance(response, PlatformAgentRunWaitResponse):
        raise SystemExit("Agent run did not return the completed response.")

    output = MarkdownOutput(output_format)
    status = response.run.status if response.run else None
    output.plain(f"status: {getattr(status, 'value', status)}\n")

    for message in response.messages or []:
        text = "".join(block.text for block in message.content or [])
        output.plain(f"[{getattr(message.role, 'value', message.role)}]\n")
        output.document(text)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--format",
        choices=OUTPUT_FORMATS,
        default="auto",
        help="output format (default: Rich on a TTY, raw Markdown otherwise)",
    )
    args = parser.parse_args()

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
    ask(glean, agent_id, question, args.format)


if __name__ == "__main__":
    main()

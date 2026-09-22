"""Render complete or streaming Markdown safely for terminals and pipelines."""

# GLEAN_FRAMEWORK_FEATURE: terminal-markdown/python

from __future__ import annotations

import os
import sys
from typing import Literal, TextIO

from rich.console import Console
from rich.markdown import Markdown
from rich.text import Text

OutputFormat = Literal["auto", "terminal", "markdown"]
OUTPUT_FORMATS: tuple[OutputFormat, ...] = ("auto", "terminal", "markdown")
_ResolvedOutputFormat = Literal["terminal", "markdown"]
_StreamMode = Literal["delta", "snapshot"]

__all__ = ["MarkdownOutput", "OUTPUT_FORMATS", "OutputFormat"]


def _safe_terminal_text(text: str) -> str:
    """Decode terminal instructions, then remove residual unsafe controls."""
    decoded = Text.from_ansi(text).plain
    return "".join(
        character for character in decoded if character in "\n\t" or character.isprintable()
    )


class _MarkdownStream:
    """Buffer one Markdown document and emit it according to its event contract."""

    def __init__(self, output: MarkdownOutput) -> None:
        self._output = output
        self._mode: _StreamMode | None = None
        self._text = ""
        self._completed = False

    def _accept(self, mode: _StreamMode) -> None:
        if self._completed:
            raise RuntimeError("Cannot write to a completed Markdown stream")
        if self._mode is not None and self._mode != mode:
            raise ValueError(f"Cannot switch a Markdown stream from {self._mode} to {mode}")
        self._mode = mode

    def delta(self, chunk: str) -> None:
        """Accept a true delta that contains only new Markdown."""
        self._accept("delta")
        self._text += chunk
        if not self._output._is_terminal:
            self._output._write(chunk)

    def snapshot(self, document: str) -> None:
        """Accept a cumulative snapshot and emit only its unseen suffix."""
        self._accept("snapshot")
        if not document.startswith(self._text):
            raise ValueError("Markdown snapshot is not cumulative")

        unseen = document[len(self._text) :]
        self._text = document
        if not self._output._is_terminal:
            self._output._write(unseen)

    def complete(self) -> None:
        """Finish the stream and render the buffered document when needed."""
        if self._completed:
            raise RuntimeError("Markdown stream is already completed")
        self._completed = True

        if self._output._is_terminal:
            self._output._render_terminal(self._text)
        elif not self._text.endswith("\n"):
            self._output._write("\n")
        else:
            self._output._flush()


class MarkdownOutput:
    """Write plain text and Markdown using one output format resolved at creation."""

    def __init__(self, output_format: OutputFormat, stream: TextIO | None = None) -> None:
        if output_format not in OUTPUT_FORMATS:
            raise ValueError("format must be auto, terminal, or markdown")

        self._target = sys.stdout if stream is None else stream
        resolved_format: _ResolvedOutputFormat = (
            "terminal"
            if output_format == "terminal" or (output_format == "auto" and self._target.isatty())
            else "markdown"
        )
        self._is_terminal = resolved_format == "terminal"
        self._console = (
            Console(file=self._target, no_color="NO_COLOR" in os.environ)
            if self._is_terminal
            else None
        )

    def _flush(self) -> None:
        self._target.flush()

    def _write(self, text: str) -> None:
        self._target.write(text)
        self._flush()

    def _render_terminal(self, markdown: str) -> None:
        assert self._console is not None
        self._console.print(Markdown(_safe_terminal_text(markdown), hyperlinks=False))

    def plain(self, text: str) -> None:
        """Write non-Markdown caller text, sanitizing only terminal output."""
        self._write(_safe_terminal_text(text) if self._is_terminal else text)

    def document(self, markdown: str) -> None:
        """Write one complete Markdown document."""
        output = self.stream()
        output.delta(markdown)
        output.complete()

    def stream(self) -> _MarkdownStream:
        """Create state for one streamed Markdown document."""
        return _MarkdownStream(self)

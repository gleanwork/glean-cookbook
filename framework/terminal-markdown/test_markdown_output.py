# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "rich==15.0.0",
# ]
# ///
"""Contract tests for the shared Python Markdown output module."""

from __future__ import annotations

import os
import re
import unittest
from io import StringIO
from unittest.mock import patch

import markdown_output
from markdown_output import MarkdownOutput

MARKDOWN = """# Release notes

- Parent
  - Nested item

Read [the guide](https://example.com/guide).

```python
ready = True
```

| Name | State |
| --- | --- |
| API | Ready |"""

CONTROLS = (
    "\rsafe "
    "\x1b[31mred\x1b[0m "
    "\x1b[2J"
    "\x1b]0;MODEL TITLE\x07"
    "\x1b]8;;https://evil.example\x07click\x1b]8;;\x07 "
    "\x9d8;;https://c1-evil.example\x07open\x9d8;;\x07 "
    "\x1b]52;c;Y2xpcGJvYXJk\x07"
    "\x1bPdevice-control\x1b\\ "
    "\x9b2J\x01\x7f"
    "bell\x07 backspaceX\x08Y tail\x1b"
)


class OutputBuffer(StringIO):
    def __init__(self, is_tty: bool = False) -> None:
        super().__init__()
        self.is_tty = is_tty
        self.flush_count = 0

    def isatty(self) -> bool:
        return self.is_tty

    def flush(self) -> None:
        self.flush_count += 1
        super().flush()


class MarkdownOutputTest(unittest.TestCase):
    def test_exports_the_output_contract_and_format_policy(self) -> None:
        self.assertEqual(
            markdown_output.__all__, ["MarkdownOutput", "OUTPUT_FORMATS", "OutputFormat"]
        )
        self.assertEqual(markdown_output.OUTPUT_FORMATS, ("auto", "terminal", "markdown"))

    def test_auto_resolves_once(self) -> None:
        raw = OutputBuffer()
        output = MarkdownOutput("auto", raw)
        raw.is_tty = True
        output.document("**raw**")
        self.assertEqual(raw.getvalue(), "**raw**\n")

        terminal = OutputBuffer(is_tty=True)
        output = MarkdownOutput("auto", terminal)
        terminal.is_tty = False
        output.document("**rendered**")
        self.assertIn("rendered", terminal.getvalue())
        self.assertNotIn("**rendered**", terminal.getvalue())

    def test_explicit_formats_override_tty_detection(self) -> None:
        raw = OutputBuffer(is_tty=True)
        MarkdownOutput("markdown", raw).document("# Raw")
        self.assertEqual(raw.getvalue(), "# Raw\n")

        terminal = OutputBuffer()
        MarkdownOutput("terminal", terminal).document("# Rendered")
        self.assertIn("Rendered", terminal.getvalue())
        self.assertNotIn("# Rendered", terminal.getvalue())

    def test_raw_document_preserves_markdown_and_adds_only_a_missing_newline(self) -> None:
        target = OutputBuffer()
        output = MarkdownOutput("markdown", target)
        self.assertIsNone(output.document(MARKDOWN))
        self.assertEqual(target.getvalue(), f"{MARKDOWN}\n")

        target = OutputBuffer()
        MarkdownOutput("markdown", target).document(f"{MARKDOWN}\n")
        self.assertEqual(target.getvalue(), f"{MARKDOWN}\n")

    def test_terminal_document_uses_rich_with_visible_link_destinations(self) -> None:
        target = OutputBuffer()
        MarkdownOutput("terminal", target).document(MARKDOWN)
        rendered = target.getvalue()

        for expected in (
            "Release notes",
            "Parent",
            "Nested item",
            "the guide",
            "https://example.com/guide",
            "ready = True",
            "Name",
            "Ready",
        ):
            self.assertIn(expected, rendered)
        for markdown_syntax in ("# Release notes", "```python", "| --- | --- |"):
            self.assertNotIn(markdown_syntax, rendered)

    def test_plain_is_not_markdown_and_sanitizes_only_terminal_output(self) -> None:
        text = "**status**\t[guide](https://example.com)\n"
        raw = OutputBuffer(is_tty=True)
        self.assertIsNone(MarkdownOutput("markdown", raw).plain(text + CONTROLS))
        self.assertEqual(raw.getvalue(), text + CONTROLS)

        terminal = OutputBuffer()
        self.assertIsNone(MarkdownOutput("terminal", terminal).plain(text + CONTROLS))
        rendered = terminal.getvalue()
        self.assertTrue(rendered.startswith(text))
        self.assertIn("safe red", rendered)
        self.assertIn("tail", rendered)
        self.assertNotIn("evil.example", rendered)
        self.assertIsNone(re.search(r"[\x00-\x08\x0b-\x1f\x7f-\x9f]", rendered))

    def test_osc_c1_dcs_and_incomplete_escapes_leave_no_executable_controls(self) -> None:
        cases = {
            "OSC": "before \x1b]0;unsafe title\x07 after",
            "C1": "before \x9d8;;https://unsafe.example\x9c after",
            "DCS": "before \x1bPdevice-control\x1b\\ after",
            "incomplete escape": "core content remains usable\x1b[",
        }
        for name, hostile in cases.items():
            with self.subTest(name=name):
                target = OutputBuffer()
                MarkdownOutput("terminal", target).plain(hostile)
                rendered = target.getvalue()
                self.assertIsNone(re.search(r"[\x00-\x08\x0b-\x1f\x7f-\x9f]", rendered))
                if name == "incomplete escape":
                    self.assertIn("core content remains usable", rendered)
                else:
                    self.assertIn("before", rendered)
                    self.assertIn("after", rendered)

    def test_terminal_document_sanitizes_controls(self) -> None:
        target = OutputBuffer()
        MarkdownOutput("terminal", target).document(CONTROLS)
        rendered = target.getvalue()
        self.assertIn("safe red", rendered)
        self.assertIn("tail", rendered)
        self.assertNotIn("MODEL TITLE", rendered)
        self.assertNotIn("evil.example", rendered)
        self.assertIsNone(re.search(r"[\x00-\x08\x0b-\x1f\x7f-\x9f]", rendered))

    def test_no_color_disables_color_sgr(self) -> None:
        with patch.dict(os.environ, {"NO_COLOR": "1"}):
            target = OutputBuffer(is_tty=True)
            MarkdownOutput("terminal", target).document(MARKDOWN)

        sgr_parameters = re.findall(r"\x1b\[([0-9;]*)m", target.getvalue())
        self.assertTrue(sgr_parameters, "Rich should retain non-color styles")
        for parameters in sgr_parameters:
            values = {int(value) for value in parameters.split(";") if value}
            self.assertFalse(
                any(
                    value in {38, 48, 58}
                    or 30 <= value <= 37
                    or 40 <= value <= 47
                    or 90 <= value <= 97
                    or 100 <= value <= 107
                    for value in values
                ),
                f"NO_COLOR output contained a color SGR: {parameters}",
            )

    def test_delta_stream_emits_each_chunk_once_without_exposing_text(self) -> None:
        target = OutputBuffer()
        stream = MarkdownOutput("markdown", target).stream()

        self.assertIsNone(stream.delta("# Release"))
        self.assertEqual(target.getvalue(), "# Release")
        self.assertIsNone(stream.delta(" notes\n\n- Ready"))
        self.assertEqual(target.getvalue(), "# Release notes\n\n- Ready")
        self.assertFalse(hasattr(stream, "text"))
        self.assertIsNone(stream.complete())
        self.assertEqual(target.getvalue(), "# Release notes\n\n- Ready\n")

    def test_snapshot_stream_emits_only_unseen_content(self) -> None:
        target = OutputBuffer()
        stream = MarkdownOutput("markdown", target).stream()

        self.assertIsNone(stream.snapshot("Hello"))
        self.assertIsNone(stream.snapshot("Hello, "))
        self.assertIsNone(stream.snapshot("Hello, world!"))
        self.assertIsNone(stream.snapshot("Hello, world!"))
        self.assertIsNone(stream.complete())
        self.assertEqual(target.getvalue(), "Hello, world!\n")

    def test_terminal_stream_renders_only_after_completion(self) -> None:
        target = OutputBuffer()
        stream = MarkdownOutput("terminal", target).stream()
        stream.delta("# Unique")
        stream.delta(" heading\n\n[guide](https://example.com)")
        self.assertEqual(target.getvalue(), "")

        self.assertIsNone(stream.complete())
        self.assertEqual(target.getvalue().count("Unique heading"), 1)
        self.assertIn("https://example.com", target.getvalue())

    def test_stream_rejects_non_cumulative_snapshots(self) -> None:
        target = OutputBuffer()
        stream = MarkdownOutput("markdown", target).stream()
        stream.snapshot("Hello")
        with self.assertRaisesRegex(ValueError, "not cumulative"):
            stream.snapshot("world")
        self.assertEqual(target.getvalue(), "Hello")

    def test_stream_rejects_event_mode_switches(self) -> None:
        delta_stream = MarkdownOutput("markdown", OutputBuffer()).stream()
        delta_stream.delta("Hello")
        with self.assertRaisesRegex(ValueError, "delta to snapshot"):
            delta_stream.snapshot("Hello")

        snapshot_stream = MarkdownOutput("markdown", OutputBuffer()).stream()
        snapshot_stream.snapshot("Hello")
        with self.assertRaisesRegex(ValueError, "snapshot to delta"):
            snapshot_stream.delta(" world")

    def test_stream_rejects_all_writes_after_completion(self) -> None:
        stream = MarkdownOutput("markdown", OutputBuffer()).stream()
        stream.complete()
        with self.assertRaisesRegex(RuntimeError, "completed"):
            stream.delta("late")
        with self.assertRaisesRegex(RuntimeError, "completed"):
            stream.snapshot("late")
        with self.assertRaisesRegex(RuntimeError, "already completed"):
            stream.complete()

    def test_empty_stream_completion_is_a_newline(self) -> None:
        target = OutputBuffer()
        stream = MarkdownOutput("markdown", target).stream()
        self.assertIsNone(stream.complete())
        self.assertEqual(target.getvalue(), "\n")

    def test_invalid_format_fails_early(self) -> None:
        with self.assertRaisesRegex(ValueError, "auto, terminal, or markdown"):
            MarkdownOutput("html", OutputBuffer())  # type: ignore[arg-type]


if __name__ == "__main__":
    unittest.main()

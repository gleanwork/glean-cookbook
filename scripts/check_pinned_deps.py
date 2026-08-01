#!/usr/bin/env python3
"""Checks that Python recipes pin their Glean SDK dependency exactly.

Runs against the uv lockfiles rather than the scripts themselves. uv already
parsed each script's PEP 723 block to produce `<script>.py.lock`, and the
lock's `[manifest].requirements` records the declared specifier for every
direct dependency -- so this reads uv's own parse with the standard library's
TOML reader instead of re-implementing PEP 723 extraction.

Reproducibility is covered separately, and more strongly, by
`uv lock --script <script> --check` in CI: the lock pins the entire transitive
tree with hashes, catching drift in dependencies-of-dependencies that an exact
direct pin never could. This check is the narrower editorial rule -- a recipe
should state which Glean SDK version it demonstrates, so upgrading is a
visible, deliberate edit.

Usage: python3 scripts/check_pinned_deps.py
"""

from __future__ import annotations

import sys
import tomllib
from pathlib import Path

GLEAN_SDKS = {"glean-api-client", "glean-indexing-sdk"}

repo_root = Path(__file__).resolve().parent.parent
recipes_dir = repo_root / "recipes"


def main() -> int:
    locks = sorted(recipes_dir.glob("**/*.py.lock"))
    scripts = [
        path
        for path in sorted(recipes_dir.glob("**/*.py"))
        if ".venv" not in path.parts
        and path.read_text(encoding="utf-8").startswith("# /// script")
    ]

    failed = False

    # A PEP 723 script with no lock beside it is transitively unpinned, however
    # exact its direct specifiers look.
    for script in scripts:
        lock = script.with_name(script.name + ".lock")
        if not lock.exists():
            failed = True
            rel = script.relative_to(repo_root)
            print(
                f"FAIL {rel}: declares inline dependencies but has no "
                f"{lock.name}. Run `uv lock --script {rel}` and commit it."
            )

    for lock in locks:
        rel = lock.relative_to(repo_root)
        data = tomllib.loads(lock.read_text(encoding="utf-8"))
        for requirement in data.get("manifest", {}).get("requirements", []):
            name = requirement.get("name", "")
            if name not in GLEAN_SDKS:
                continue
            specifier = requirement.get("specifier", "")
            if not specifier.startswith("=="):
                failed = True
                shown = specifier or " (unconstrained)"
                print(
                    f"FAIL {rel}: {name}{shown} is not pinned with == to an "
                    f"exact version"
                )
            else:
                print(f"ok   {rel}: {name}{specifier} pinned")

    if failed:
        return 1

    if not locks and not scripts:
        print("No PEP 723 Python recipes -- nothing to check.")
    else:
        print("\nAll Glean SDK dependencies in Python recipes are pinned exactly.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

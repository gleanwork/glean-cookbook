# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "glean-indexing-sdk==1.0.0b2",
# ]
# ///
"""Seed the sample catalog into a Glean instance.

The datasource is registered as a *test* datasource (see connector.py), which
turns off ranking signals and makes it visible to nobody by default. This
script then allow-lists GLEAN_BETA_USER_EMAILS so you can actually see what you
indexed — without that call you'd index successfully and then find nothing.

Requires GLEAN_INDEXING_API_TOKEN, GLEAN_SERVER_URL, and
GLEAN_BETA_USER_EMAILS in the environment (never hardcode credentials). Run
teardown.py before re-running this against the same instance if you want a
clean slate rather than an incremental update.

Usage:
    export GLEAN_INDEXING_API_TOKEN=...
    export GLEAN_SERVER_URL=...
    export GLEAN_BETA_USER_EMAILS=you@yourcompany.com
    uv run seed.py
"""

from __future__ import annotations

import os

from connector import (
    DATASOURCE_NAME,
    SampleCatalogConnector,
    SampleCatalogDataClient,
    SampleCatalogPeopleConnector,
)
from glean.api_client import Glean
from glean.indexing.models import ConnectorOptions, IndexingMode


def viewer_emails() -> list[str]:
    """Who should be able to see the test datasource.

    Read before any indexing happens: a test datasource is invisible to
    everyone until it's allow-listed, including to whoever indexed it, so
    discovering a missing value *after* the upload leaves content sitting in
    the instance that you can't see and didn't mean to leave there.
    """
    emails = [
        e.strip() for e in os.environ.get("GLEAN_BETA_USER_EMAILS", "").split(",") if e.strip()
    ]
    if not emails:
        raise SystemExit(
            "Set GLEAN_BETA_USER_EMAILS to a comma-separated list of emails "
            "(usually just your own). A test datasource is visible to nobody "
            "until they're allow-listed, so seeding without this leaves you "
            "unable to see anything you indexed."
        )
    return emails


def authorize_viewers(emails: list[str]) -> None:
    with Glean(
        api_token=os.environ["GLEAN_INDEXING_API_TOKEN"],
        server_url=os.environ["GLEAN_SERVER_URL"],
    ) as glean:
        glean.indexing.permissions.authorize_beta_users(datasource=DATASOURCE_NAME, emails=emails)
    print(f"Granted visibility on '{DATASOURCE_NAME}' to: {', '.join(emails)}")


def main() -> None:
    emails = viewer_emails()

    documents_connector = SampleCatalogConnector(DATASOURCE_NAME, SampleCatalogDataClient())
    documents_connector.configure_datasource()
    documents_connector.index_data(
        mode=IndexingMode.FULL,
        options=ConnectorOptions(disable_stale_deletion_check=False),
    )
    print(f"Indexed sample-data documents into datasource '{DATASOURCE_NAME}'.")

    # data_client is required by BasePeopleConnector's constructor but unused
    # here — SampleCatalogPeopleConnector overrides get_data() directly.
    people_connector = SampleCatalogPeopleConnector(
        "sample_catalog_people", SampleCatalogDataClient()
    )
    people_connector.index_data(mode=IndexingMode.FULL)
    print("Indexed the sample people as searchable employee profiles.")

    authorize_viewers(emails)


if __name__ == "__main__":
    main()

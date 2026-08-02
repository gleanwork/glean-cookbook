# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "glean-indexing-sdk==1.0.0b2",
# ]
# ///
"""Seed the sample catalog into a Glean instance.

Requires GLEAN_INDEXING_API_TOKEN and GLEAN_SERVER_URL in the environment
(per glean-indexing-sdk's own README) — never hardcode credentials. Run
teardown.py before re-running this against the same instance if you want
a clean slate rather than an incremental update.

Usage:
    export GLEAN_INDEXING_API_TOKEN=...
    export GLEAN_SERVER_URL=...
    python seed.py
"""

from __future__ import annotations

from connector import (
    DATASOURCE_NAME,
    SampleCatalogConnector,
    SampleCatalogDataClient,
    SampleCatalogPeopleConnector,
)
from glean.indexing.models import ConnectorOptions, IndexingMode


def main() -> None:
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


if __name__ == "__main__":
    main()

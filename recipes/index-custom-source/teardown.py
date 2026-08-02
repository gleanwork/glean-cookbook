# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "glean-indexing-sdk==1.0.0b2",
# ]
# ///
"""Tear down everything seed.py created, for a clean re-run.

IMPORTANT — verified against the pinned glean-api-client==0.15.4 (every
`def delete*` in the package: the only delete_all is on chat, not datasources):
this SDK version has no datasources.delete() call, only per-item deletes for
documents, permission users/groups/memberships, and employees. This script deletes every document,
group, permission-user, and employee profile the seed created; the
"acme_corpus" datasource *registration* itself (name, category, object
definitions) is left in place — orphaned but harmless, and ready to be
re-populated by seed.py on the next run. To fully remove the datasource
entity, use the Glean admin console; there's no verified API for it here.

Usage:
    export GLEAN_INDEXING_API_TOKEN=...
    export GLEAN_SERVER_URL=...
    python teardown.py
"""

from __future__ import annotations

from connector import DATASOURCE_NAME, _load_documents, _load_employees, _load_groups
from glean.indexing.common import api_client


def main() -> None:
    with api_client() as client:
        for doc in _load_documents():
            client.indexing.documents.delete(
                datasource=DATASOURCE_NAME, object_type="document", id=doc["id"]
            )
            print(f"deleted document {doc['id']}")

        # Deleting a group cascades its memberships (per the SDK's own docstring).
        for group in _load_groups():
            client.indexing.permissions.delete_group(
                datasource=DATASOURCE_NAME, group_name=group["name"]
            )
            print(f"deleted group {group['name']}")

        for employee in _load_employees():
            # Deleting a user cascades any remaining memberships.
            client.indexing.permissions.delete_user(
                datasource=DATASOURCE_NAME, email=employee["email"]
            )
            print(f"deleted datasource user {employee['email']}")

            client.indexing.people.delete(employee_email=employee["email"])
            print(f"deleted employee profile {employee['email']}")


if __name__ == "__main__":
    main()

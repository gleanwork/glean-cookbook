"""Acme Corpus connectors — glean-indexing-sdk==1.0.0b2.

Two connectors, both reading straight off the JSON fixtures in this directory
(no external system involved — the fixtures ARE the source of truth):

- AcmeCorpusConnector: a BaseDatasourceConnector that indexes documents/**/*.json
  into a custom "acme_corpus" datasource, and pushes the permission identities
  (users/groups/memberships from people/*.json) needed to evaluate each
  document's ACLs.
- AcmeCorpusPeopleConnector: a BasePeopleConnector that indexes people/employees.json
  as searchable employee profiles (a separate Glean capability from document
  permissions — this is what makes "who is Priya Natarajan" resolve to a person
  card, independent of any document ACL).

This code doubles as the working example for the index-custom-source recipe
(PACT-444) — the pattern here (JSON fixtures -> transform -> permissions) is
exactly what that recipe walks through.
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from datetime import datetime
from pathlib import Path
from typing import Any

from glean.api_client.models import (
    DatasourceBulkMembershipDefinition,
    DatasourceCategory,
    DatasourceGroupDefinition,
    DatasourceUserDefinition,
    DocumentPermissionsDefinition,
    EmployeeInfoDefinition,
    ObjectDefinition,
    UserReferenceDefinition,
)
from glean.indexing.connectors import BaseDatasourceConnector, BasePeopleConnector
from glean.indexing.connectors.base_data_client import BaseDataClient
from glean.indexing.models import (
    ContentDefinition,
    CustomDatasourceConfig,
    DatasourceIdentityDefinitions,
    DocumentDefinition,
)

CORPUS_ROOT = Path(__file__).parent
DOCUMENTS_DIR = CORPUS_ROOT / "documents"
PEOPLE_DIR = CORPUS_ROOT / "people"

DATASOURCE_NAME = "acme_corpus"


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text())


def _load_documents() -> list[dict]:
    return [_load_json(path) for path in sorted(DOCUMENTS_DIR.rglob("*.json"))]


def _load_employees() -> list[dict]:
    return _load_json(PEOPLE_DIR / "employees.json")


def _load_groups() -> list[dict]:
    return _load_json(PEOPLE_DIR / "groups.json")


def _load_memberships() -> list[dict]:
    return _load_json(PEOPLE_DIR / "memberships.json")


def _to_epoch_seconds(iso_timestamp: str) -> int:
    # DocumentDefinition.created_at/updated_at are epoch seconds (int), not ISO
    # strings — confirmed against the installed glean-api-client model, which
    # is why this conversion exists rather than passing the JSON value through.
    return int(datetime.fromisoformat(iso_timestamp.replace("Z", "+00:00")).timestamp())


def _permissions_from(spec: dict) -> DocumentPermissionsDefinition:
    if "groups" in spec:
        return DocumentPermissionsDefinition(allowed_groups=spec["groups"])
    if "users" in spec:
        return DocumentPermissionsDefinition(
            allowed_users=[UserReferenceDefinition(email=email) for email in spec["users"]]
        )
    raise ValueError(f"Document permission spec must have 'groups' or 'users': {spec!r}")


class AcmeCorpusDataClient(BaseDataClient[dict]):
    """Reads the seed documents straight off disk."""

    def get_source_data(self, **kwargs: Any) -> Sequence[dict]:
        return _load_documents()


class AcmeCorpusConnector(BaseDatasourceConnector[dict]):
    """Indexes acme-corpus/documents/**/*.json into the 'acme_corpus' datasource."""

    configuration: CustomDatasourceConfig = CustomDatasourceConfig(
        name=DATASOURCE_NAME,
        display_name="Acme Corpus",
        datasource_category=DatasourceCategory.KNOWLEDGE_HUB,
        url_regex="https://portal.acme.internal/.*",
        is_entity_datasource=False,
        is_test_datasource=False,
        is_user_referenced_by_email=True,
        object_definitions=[
            ObjectDefinition(
                name="document",
                display_label="Document",
                doc_category=DatasourceCategory.KNOWLEDGE_HUB,
            ),
        ],
    )

    def transform(self, data: Sequence[dict]) -> Sequence[DocumentDefinition]:
        return [
            DocumentDefinition(
                id=item["id"],
                title=item["title"],
                datasource=self.name,
                view_url=item["view_url"],
                object_type="document",
                body=ContentDefinition(mime_type="text/plain", text_content=item["body"]),
                permissions=_permissions_from(item["permission"]),
                created_at=_to_epoch_seconds(item["created_at"]),
                updated_at=_to_epoch_seconds(item["updated_at"]),
                tags=[item["department"]],
            )
            for item in data
        ]

    def get_identities(self) -> DatasourceIdentityDefinitions:
        employees = _load_employees()
        users = [
            DatasourceUserDefinition(
                email=employee["email"],
                name=f"{employee['first_name']} {employee['last_name']}",
                is_active=True,
            )
            for employee in employees
        ]
        groups = [DatasourceGroupDefinition(name=group["name"]) for group in _load_groups()]
        memberships = [
            DatasourceBulkMembershipDefinition(
                member_user_id=membership["member_user_id"],
                member_group_name=membership["member_group_name"],
            )
            for membership in _load_memberships()
        ]
        return DatasourceIdentityDefinitions(users=users, groups=groups, memberships=memberships)


class AcmeCorpusPeopleConnector(BasePeopleConnector[dict]):
    """Indexes people/employees.json as searchable employee profiles.

    Note: BasePeopleConnector's docstring says subclasses "must define a
    configuration attribute of type CustomDatasourceConfig", but its
    index_data() (verified by reading the installed source) never reads
    self.configuration and people.bulk_index() takes no datasource kwarg —
    employee profiles aren't scoped to a datasource the way documents are.
    Omitted here rather than adding dead config that nothing consumes.
    """

    def get_data(self, since: str | None = None) -> Sequence[dict]:
        return _load_employees()

    def transform(self, data: Sequence[dict]) -> Sequence[EmployeeInfoDefinition]:
        return [
            EmployeeInfoDefinition(
                email=employee["email"],
                department=employee["department"],
                first_name=employee.get("first_name"),
                last_name=employee.get("last_name"),
                title=employee.get("title"),
                manager_email=employee.get("manager_email"),
                start_date=employee.get("start_date"),
            )
            for employee in data
        ]

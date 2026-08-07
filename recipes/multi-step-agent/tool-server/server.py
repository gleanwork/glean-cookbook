# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "flask==3.1.3",
#     "python-dotenv==1.1.1",
# ]
# ///
"""A governed custom Tool server for an incident-tracking system.

Mirrors the verified pattern in this repo's own guides/tools/examples/
jira-issue-creation.mdx: Glean forwards the identity of the user whose
context an agent is running as via the Glean-User-Email header, so a
custom tool server can enforce its own authorization -- this is what
"governed" means here, not something Glean's admin UI does for you
automatically for scratch-built tools.

Governance rule for this recipe: only users on the allow-list may file a
payments-service incident ticket. Anyone else gets a 403, and the agent
(per its instructions -- see the recipe doc) falls back to a read-only
summary instead of a write it isn't allowed to make.
"""

import os

from dotenv import load_dotenv
from flask import Flask, jsonify, request

# Load the local configuration created from .env.example.
load_dotenv()

app = Flask(__name__)

# The allow-list comes from the environment so this runs against your own
# instance's real users -- there's no seeded roster to depend on. Set it to
# two real emails from your Glean instance: one that should be able to file
# tickets, and one that should not.
AUTHORIZED_EMAILS = {
    email.strip().lower()
    for email in os.environ.get("AUTHORIZED_EMAILS", "").split(",")
    if email.strip()
}

if not AUTHORIZED_EMAILS:
    raise SystemExit(
        "Set AUTHORIZED_EMAILS to a comma-separated list of emails allowed to "
        "file incident tickets (see .env.example). Starting with an empty "
        "allow-list would deny everyone and make the permitted branch of this "
        "recipe unobservable."
    )

TICKETS = []


@app.route("/file_incident_ticket", methods=["POST"])
def file_incident_ticket():
    user_email = request.headers.get("Glean-User-Email")
    if not user_email:
        return jsonify({"error": "Glean-User-Email header not found"}), 401

    if user_email.lower() not in AUTHORIZED_EMAILS:
        return jsonify(
            {
                "error": "Not authorized",
                "details": f"{user_email} is not authorized to file incident "
                "tickets for this service.",
            }
        ), 403

    payload = request.json or {}
    ticket_id = f"INC-{len(TICKETS) + 1}"
    TICKETS.append({"id": ticket_id, "reporter": user_email, **payload})

    return jsonify({"resultURL": f"https://incidents.example.com/{ticket_id}"}), 200


if __name__ == "__main__":
    app.run(port=8080)

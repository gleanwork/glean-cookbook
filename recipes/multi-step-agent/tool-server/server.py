# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "flask==3.1.3",
# ]
# ///
"""A governed custom Tool server for Acme's incident-tracking system.

Mirrors the verified pattern in this repo's own guides/tools/examples/
jira-issue-creation.mdx: Glean forwards the identity of the user whose
context an agent is running as via the Glean-User-Email header, so a
custom tool server can enforce its own authorization — this is what
"governed" means here, not something Glean's admin UI does for you
automatically for scratch-built tools.

Governance rule for this recipe: only users in the Engineering
department may file a payments-service incident ticket. Anyone else gets
a 403, and the agent (per its instructions — see the recipe doc) falls
back to a read-only summary instead of a write it isn't allowed to make.
"""

from flask import Flask, jsonify, request

app = Flask(__name__)

# Stand-in group membership: only Engineering may file incident tickets.
# The governance check is the point; the roster is deliberately trivial.
ENGINEERING_EMAILS = {
    "priya.natarajan@acme.example.com",
    "marcus.webb@acme.example.com",
    "alex.kim@acme.example.com",
}

TICKETS = []


@app.route("/file_incident_ticket", methods=["POST"])
def file_incident_ticket():
    user_email = request.headers.get("Glean-User-Email")
    if not user_email:
        return jsonify({"error": "Glean-User-Email header not found"}), 401

    if user_email not in ENGINEERING_EMAILS:
        return jsonify(
            {
                "error": "Not authorized",
                "details": f"{user_email} is not in Engineering; only "
                "Engineering can file incident tickets for this service.",
            }
        ), 403

    payload = request.json or {}
    ticket_id = f"INC-{len(TICKETS) + 1}"
    TICKETS.append({"id": ticket_id, "reporter": user_email, **payload})

    return jsonify({"resultURL": f"https://portal.acme.internal/incidents/{ticket_id}"}), 200


if __name__ == "__main__":
    app.run(port=8080)

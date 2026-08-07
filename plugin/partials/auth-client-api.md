Run the scaffold's shipped login command. It discovers the tenant from the user's work email, uses
OAuth when the tenant supports it, and writes local configuration to ignored `.env`. If OAuth is
unavailable, ask the user to enter a narrowly scoped Glean API token in `.env` without exposing it in
chat or command output. Never implement or modify an authentication flow while setting up a recipe.

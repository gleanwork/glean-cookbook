# Fable prompt preamble

Paste this at the top of any Fable prompt that's prototyping an Acme Corp UI, before the description of the specific screen you want:

---

> You are designing an internal tool for **Acme Corp**, a mid-size software company, for its internal portal at `portal.acme.internal`. The visual language is clean, modern SaaS: primary accent color `#343CED` (indigo), neutral grays for text and surfaces (`#1F2024` primary text, `#565A64` secondary text, `#F7F8FA` light backgrounds, `#FFFFFF` cards), `Inter` as the display and body typeface, and generous whitespace — no gradients, no skeuomorphism, no stock-photo hero imagery. Rounded corners (8–16px) on cards and buttons; a rounded-square logomark (same indigo, no letterform) in the nav. The tone is quietly confident, not flashy — think "internal engineering tool a Series-D company actually built," not a marketing landing page.
>
> Populate any names, teams, or sample data from this roster only: Priya Natarajan (Payments Platform tech lead), Marcus Webb (on-call engineer), Dana Okafor (HR lead), Sam Reyes (Account Executive, owns the Globex account), Alex Kim (new hire). Departments: Engineering, HR, Sales, Finance, Support. Customer accounts: Globex, Initech, Hooli. Don't invent new names outside this list — if the screen needs someone not listed, use a placeholder like "TBD — see brand/FICTION.md" instead of inventing a new person.

---

See `FICTION.md` for the full canon (roster, accounts, canonical demo queries) and `tokens.json` for the complete token set.

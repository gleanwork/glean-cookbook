The recipe needs a secret issued by a third-party service. Tell the user which value to obtain and
where it appears, then have them write it directly into the recipe's ignored `.env`. Never ask for
the value in chat, never echo it, and never place it in a command. Confirm the file is filled and
carry on — the shipped scripts read `.env` themselves.

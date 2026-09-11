The recipe needs a secret issued by a third-party service. Explain which credential is needed
and where to obtain it, then have the user enter it directly into the recipe's declared ignored
environment file or host secret store. Never request its value in chat, echo it, or place it
in a command. Use the documented configuration-loading path; do not assume every script reads
`.env`. If that path is missing or broken, report the source defect rather than adding a hidden
credential-loading workaround.

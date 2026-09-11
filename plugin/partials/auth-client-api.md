Use only the authentication path and scopes declared by the selected recipe. Run its shipped
login command when OAuth is selected; use the supported auth library for sign-in, refresh,
and credential storage. Do not assume login writes `.env`: follow the documented storage
and configuration contract. For token authentication, have the user enter the token directly
into the declared ignored environment file or host secret store, never chat or command output.
Do not implement or alter authentication while merely setting up a recipe. If the documented
path is wrong, stop and report the source defect rather than silently substituting another flow.

Indexing API operations accept Glean-issued tokens only — OAuth does not apply here regardless of
tenant configuration (per developers.glean.com/api-info/client/authentication/oauth). Don't run an
OAuth detection chain for an indexing recipe; go straight to asking for a Glean
Indexing API token (`GLEAN_INDEXING_API_TOKEN`) and server URL (`GLEAN_SERVER_URL`), the same way
`index-custom-source` already does.

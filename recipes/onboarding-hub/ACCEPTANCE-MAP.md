# Onboarding Hub acceptance map

| Behavior               | Web SDK                                                   | Platform Chat                                                  |
| ---------------------- | --------------------------------------------------------- | -------------------------------------------------------------- |
| Checklist source       | Validated `public/steps.json`                             | `GLEAN_ONBOARDING_STEPS_JSON` or `GLEAN_ONBOARDING_STEPS_FILE` |
| Authentication         | Viewer SSO in their normal browser, with explicit backend | Server-side token                                              |
| Progress               | localStorage completion and milestone groups              | Browser completion and milestone groups                        |
| Ask about a step       | Re-mount `renderChat` with preserved `chatId`             | Send a step-specific USER message                              |
| Supported answer       | Web SDK renders Glean's cited answer                      | App renders parsed answer and citations                        |
| Unsupported answer     | Glean owns the chat experience                            | App shows its escalation affordance                            |
| Empty transport output | Web SDK owns transport behavior                           | Retry once, then return a transport error                      |
| Done state             | Configured resource links or an empty state               | Completion summary                                             |

Verify cited first-day, VPN, and PTO answers on both paths. Verify the unsupported-answer escalation
only on Platform Chat.

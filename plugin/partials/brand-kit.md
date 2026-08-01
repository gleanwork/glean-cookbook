Primary accent: `#0E8C84` (teal). Use this for the primary button, header accent, or active
state — not Glean's own blue.

Use the real logomark, not a colored `<div>`/`<span>`. For light backgrounds:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="Acme Corp">
  <title>Acme Corp</title>
  <rect x="0" y="0" width="64" height="64" rx="18" fill="#0E8C84"></rect>
  <path fill-rule="evenodd" fill="#ffffff" d="M32 13 L55 52 L9 52 Z M32 29 L43 46 L21 46 Z"></path>
</svg>
```

For dark backgrounds/dark mode:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="Acme Corp">
  <title>Acme Corp</title>
  <rect x="0.75" y="0.75" width="62.5" height="62.5" rx="17.5" fill="#12B3A6" stroke="rgba(255,255,255,0.18)" stroke-width="1.5"></rect>
  <path fill-rule="evenodd" fill="#0A1615" d="M32 13 L55 52 L9 52 Z M32 29 L43 46 L21 46 Z"></path>
</svg>
```

Inline either `<svg>` directly, or save it as `logo.svg` and reference it — do not recreate the
mark from a text description. If you have filesystem/network access to the private
`gleanwork/glean-cookbook` repo, the canonical files are `brand/logomark-light.svg`,
`brand/logomark-dark.svg`, and `brand/tokens.json` (full color/type tokens); otherwise the SVGs
above are the complete, self-contained source.

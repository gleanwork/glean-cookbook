`renderChat`/`renderSearchBox`/`renderSearchResults` need an explicit-sized container
(`position: relative`, `display: block`, a real `width`, a real `height`) or the widget won't
render at all. Beyond that minimum:

- **Height**: 480–500px reads as a properly-proportioned embedded panel. Taller containers
  (560px+) leave visible dead space below Glean's own chat landing view, which is a fixed-height
  hero, not something that stretches to fill its container.
- **First paint**: pass `initialMessage` (a `ChatOptions` field) with the recipe's own first demo
  query, e.g. `renderChat(el, { initialMessage: "What's our PTO policy?" })`. This opens straight
  into a real, cited answer instead of an empty "Ask Assistant anything" landing screen — a much
  better first impression, and it doubles as an on-load verification that the integration works.

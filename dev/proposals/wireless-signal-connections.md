# Proposal: Wireless (signal) connections

Source: `hawwwran-simpleway/Drawflow` fork ([diff](https://github.com/jerosoler/Drawflow/compare/master...hawwwran-simpleway:Drawflow:master)), `src/core/wireless.ts` (TypeScript; port to plain JS required).

## Concept

Connections can carry a `signal` name. Two ports that share the same signal
name are logically connected **without drawing an SVG wire** — the port shows a
small label badge instead. This is the Node-RED "link in / link out" pattern:
it declutters flows where a long wire would cross the whole canvas.

## Data model

- `outputs.<port>.connections[i].signal?: string` — set on both sides of the
  connection, rides along in `export()`/`import()` like `points` and `label` do.
- `addConnection(id_output, id_input, output_class, input_class, options?)`
  gains `options.signal` and `options.skipDom` (don't draw the SVG).
- Ports render a `.df-wireless-label` badge showing the signal name; the badge
  gets a `--connected` class once the link is live.

## UX flow (from the fork)

1. User initiates a wireless link on a port (the fork opens a dialog on drop
   asking for a signal name, with a datalist of existing signal names and a
   "connect to existing" select). Their dialog uses SweetAlert2 classes — for
   us, expose events and let the app provide the UI, consistent with how
   `connectionDrop` works.
2. If the user picks an existing signal, `skipDom` connections are added on
   both sides; if a new one, the port is tagged `wireless: <name>` and waits
   for a peer.

## Suggested API surface (JS port)

- `addConnection(id_output, id_input, output_class, input_class, options)` —
  backward compatible (options optional).
- `setPortSignal(nodeId, portClass, type, signal)` / `getPortSignal(...)`.
- `listSignals(module?)` — used by the app to offer "connect to existing".
- Events: `signalAssigned`, `wirelessConnected`, `wirelessDisconnected`.
- Rendering: badge elements in `nodes.js`; CSS vars for badge colors.

## Size estimate

~600 lines of TS in the fork; expect ~400 lines JS in `src/parts/wireless.js`
plus small hooks in `connections.js` (`addConnection` options, skip drawing
when `signal` is set), `nodes.js` (badge rendering), `data.js` (export/import
passes through automatically), and `drawflow.css`.

## Open questions

- Trigger UX: their dialog-on-drop vs. a modifier key / port context action.
  Prefer events + app-side UI (like `connectionDrop`) over built-in dialogs.
- Should wireless connections appear in `export()` as normal connections
  (they do in the fork — good for the backend) — yes, keep.
- Interaction with multi-input ports: fork requires every connection on a
  wireless port to carry a signal before marking it wireless-only.

---

# Also worth porting (small, same fork)

## Edge auto-pan

`autoPanEdgeMargin` (px), `autoPanSpeed`, `autoPanMode` (`'connection' | 'node'`).
While dragging a node or a wire near the container edge, the canvas pans with
`requestAnimationFrame`. ~50 lines in `interactions.js` + `view.js`. Useful for
large flows; no API or data-model impact.

## `zoomFit` per-side padding

`zoomFit(paddingTop, paddingRight, paddingBottom, paddingLeft)` — fold into the
existing `zoomFit` (a few lines in `view.js`).

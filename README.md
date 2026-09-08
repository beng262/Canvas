# DrawNow!

A dependency-free browser drawing studio built with HTML Canvas.

## Highlights

- Zoom from 10% to 3200% with cursor-centered wheel zoom, Fit/100% controls, panning, pixel-perfect rendering, and an automatic pixel grid.
- True multi-layer editing with visibility, per-layer opacity, alpha clipping, rename, merge, and undo/redo.
- Studio brushes for round ink, pressure ink, graphite, marker, charcoal, watercolor, airbrush, pixel work, and stamps.
- Improved bucket fill with adjustable color tolerance, all-layer sampling, and 0-3 px gap closing.
- Composite eyedropper and a visual HSV color picker with editable hex input.
- Rectangle and lasso selection with move, resize, rotate, nudge, duplicate, flip, delete, and apply actions.

## Run

Open `index.html` directly, or serve the folder locally:

```bash
python -m http.server 4173
```

Then open `http://127.0.0.1:4173/`.

## Shortcuts

| Key | Action |
| --- | --- |
| Mouse wheel | Zoom at cursor |
| Space-drag / middle-drag | Pan |
| `+` / `-` | Zoom in / out |
| `Ctrl/Cmd+0` | Fit canvas |
| `B`, `E`, `G`, `I` | Brush, eraser, fill, eyedropper |
| `M`, `L` | Rectangle selection, lasso |
| Arrow keys | Nudge selected pixels 1 px |
| Shift + Arrow keys | Nudge selected pixels 10 px |
| Enter | Apply selection transform |
| Delete / Backspace | Delete selected pixels |
| `Ctrl/Cmd+Z` / `Ctrl/Cmd+Shift+Z` | Undo / redo |

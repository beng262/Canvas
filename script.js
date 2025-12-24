document.addEventListener('DOMContentLoaded', () => {
  // =========================
  // DOM + Canvas
  // =========================
  const canvas = document.getElementById('drawingCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const brushSizeInput = document.getElementById('brushSize');
  const brushSizeValue = document.getElementById('brushSizeValue');
  const opacityInput = document.getElementById('opacity');
  const opacityValue = document.getElementById('opacityValue');
  const brushColorInput = document.getElementById('brushColor');
  const toolSelect = document.getElementById('tool');
  const brushTypeSelect = document.getElementById('brushType');
  const backgroundPatternSelect = document.getElementById('backgroundPattern');
  const recentColorsDiv = document.getElementById('recentColors');

  const newCanvasButton = document.getElementById('newCanvas');
  const clearCanvasButton = document.getElementById('clearCanvas');
  const undoCanvasButton = document.getElementById('undoCanvas');
  const redoCanvasButton = document.getElementById('redoCanvas');

  const downloadFormatSelect = document.getElementById('downloadFormat');
  const downloadCanvasButton = document.getElementById('downloadCanvas');

  const flipCanvasButton = document.getElementById('flipCanvas');

  const addImageButton = document.getElementById('addImageButton');
  const addImageInput = document.getElementById('addImageInput');

  const darkModeToggle = document.getElementById('darkModeToggle');

  const shapeOptionsDiv = document.getElementById('shapeOptions');
  const shapeTypeSelect = document.getElementById('shapeType');
  const symmetryCheckbox = document.getElementById('symmetry');

  const canvasContainer = document.getElementById('canvasContainer');

  // overlays
  const selectionOverlay = document.getElementById('selectionOverlay');
  const lassoOverlay = document.getElementById('lassoOverlay');
  const cropOverlay = document.getElementById('cropOverlay');
  const transformBox = document.getElementById('transformBox');

  const lassoCtx = lassoOverlay ? lassoOverlay.getContext('2d') : null;

  // make overlay canvases match size
  if (lassoOverlay) {
    lassoOverlay.width = canvas.width;
    lassoOverlay.height = canvas.height;
  }

  // =========================
  // State
  // =========================
  let currentTool = toolSelect ? toolSelect.value : 'pen';
  let currentBrush = brushTypeSelect ? brushTypeSelect.value : 'round';

  let isDrawing = false;
  let lastX = 0, lastY = 0;

  // shapes
  let shapeActive = false;
  let shapeStart = { x: 0, y: 0 };
  let shapeSaved = null;

  // selection (rect)
  let isSelecting = false;
  let selectStart = { x: 0, y: 0 };
  let selectRect = null;

  // lasso
  let isLassoing = false;
  let lassoPoints = [];

  // crop (only on overlay)
  let isCropping = false;
  let cropStart = { x: 0, y: 0 };
  let cropRect = null;

  // overlay object (image or selection)
  // { img, x, y, w, h, angle }
  let overlayObj = null;
  let baseImageData = null;

  // transform interaction
  let transformMode = null; // 'move'|'resize'|'rotate'
  let activeHandle = null;
  let startMouse = { x: 0, y: 0 };
  let startState = null;

  // clipboard
  let clipboardObj = null;

  // history
  let undoStack = [];
  let redoStack = [];
  const MAX_HISTORY = 50;

  // =========================
  // Helpers
  // =========================
  function canvasPoint(evt) {
    const r = canvas.getBoundingClientRect();
    return { x: evt.clientX - r.left, y: evt.clientY - r.top };
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function hexToRgba(hex, opacity) {
    hex = String(hex || '#000000').replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const bigint = parseInt(hex, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r},${g},${b},${opacity / 100})`;
  }

  function hexToRgbaArray(hex, opacity) {
    hex = String(hex || '#000000').replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const bigint = parseInt(hex, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    const a = (opacity / 100) * 255;
    return [r, g, b, a];
  }

  // =========================
  // Theme
  // =========================
  const THEME_KEY = 'drawnow-theme';
  function applyTheme(mode) {
    const isDark = mode === 'dark';
    document.body.classList.toggle('dark', isDark);
    if (darkModeToggle) {
      darkModeToggle.textContent = isDark ? '🌙' : '☀️';
      darkModeToggle.setAttribute('aria-pressed', String(isDark));
      darkModeToggle.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
    }
  }
  function initTheme() {
    let stored = localStorage.getItem(THEME_KEY);
    if (stored !== 'dark' && stored !== 'light') stored = 'light';
    applyTheme(stored);
  }
  if (darkModeToggle) {
    darkModeToggle.addEventListener('click', () => {
      const isDark = document.body.classList.contains('dark');
      const next = isDark ? 'light' : 'dark';
      localStorage.setItem(THEME_KEY, next);
      applyTheme(next);
    });
  }
  initTheme();

  // =========================
  // History
  // =========================
  function saveState() {
    redoStack = [];
    try {
      undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
      if (undoStack.length > MAX_HISTORY) undoStack.shift();
    } catch (e) {}
  }

  function hideSelection() {
    if (!selectionOverlay) return;
    selectionOverlay.style.display = 'none';
  }

  function showSelection(x, y, w, h) {
    if (!selectionOverlay) return;
    selectionOverlay.style.display = 'block';
    Object.assign(selectionOverlay.style, {
      left: x + 'px',
      top: y + 'px',
      width: w + 'px',
      height: h + 'px'
    });
  }

  function clearLassoOverlay() {
    if (!lassoCtx || !lassoOverlay) return;
    lassoCtx.clearRect(0, 0, lassoOverlay.width, lassoOverlay.height);
  }

  function drawLassoOverlay(points, previewPoint = null) {
    if (!lassoCtx || !lassoOverlay) return;
    clearLassoOverlay();
    if (!points || !points.length) return;

    const pts = previewPoint ? [...points, previewPoint] : points;

    lassoCtx.save();
    lassoCtx.strokeStyle = '#22c55e';
    lassoCtx.fillStyle = 'rgba(34, 197, 94, 0.12)';
    lassoCtx.lineWidth = 1.5;
    lassoCtx.setLineDash([6, 4]);
    lassoCtx.beginPath();
    pts.forEach((p, i) => {
      if (i === 0) lassoCtx.moveTo(p.x, p.y);
      else lassoCtx.lineTo(p.x, p.y);
    });
    if (!previewPoint && pts.length > 2) lassoCtx.closePath();
    lassoCtx.stroke();
    if (pts.length > 2) lassoCtx.fill();
    lassoCtx.restore();
  }

  function resetLasso() {
    isLassoing = false;
    lassoPoints = [];
    clearLassoOverlay();
  }

  function updateTransformBox() {
    if (!transformBox) return;

    if (!overlayObj || currentTool !== 'transform') {
      transformBox.style.display = 'none';
      return;
    }
    transformBox.style.display = 'block';
    transformBox.style.width = overlayObj.w + 'px';
    transformBox.style.height = overlayObj.h + 'px';
    transformBox.style.transform = `translate(${overlayObj.x}px, ${overlayObj.y}px) rotate(${overlayObj.angle || 0}rad)`;
  }

  function renderOverlay() {
    if (!overlayObj || !baseImageData) return;
    ctx.putImageData(baseImageData, 0, 0);

    ctx.save();
    ctx.translate(overlayObj.x, overlayObj.y);
    ctx.rotate(overlayObj.angle || 0);
    ctx.drawImage(overlayObj.img, 0, 0, overlayObj.w, overlayObj.h);
    ctx.restore();
  }

  function commitOverlay() {
    if (!overlayObj || !baseImageData) return;
    saveState();
    renderOverlay();
    baseImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    overlayObj = null;
    updateTransformBox();
  }

  function flattenOverlayIfAny() {
    if (!overlayObj || !baseImageData) return;
    renderOverlay();
    baseImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    overlayObj = null;
    updateTransformBox();
  }

  function clearActiveOverlayUI() {
    overlayObj = null;
    baseImageData = null;
    updateTransformBox();
    hideSelection();
    resetLasso();
    if (cropOverlay) cropOverlay.style.display = 'none';
  }

  function undo() {
    if (!undoStack.length) return;
    try {
      redoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
      const prev = undoStack.pop();
      ctx.putImageData(prev, 0, 0);
      clearActiveOverlayUI();
    } catch (e) {}
  }

  function redo() {
    if (!redoStack.length) return;
    try {
      undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
      const next = redoStack.pop();
      ctx.putImageData(next, 0, 0);
      clearActiveOverlayUI();
    } catch (e) {}
  }

  // =========================
  // Brushes
  // =========================
  function drawStar(cx, cy, spikes, outerRadius, innerRadius) {
    let rot = (Math.PI / 2) * 3;
    const step = Math.PI / spikes;
    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
      ctx.lineTo(cx + Math.cos(rot) * outerRadius, cy + Math.sin(rot) * outerRadius);
      rot += step;
      ctx.lineTo(cx + Math.cos(rot) * innerRadius, cy + Math.sin(rot) * innerRadius);
      rot += step;
    }
    ctx.closePath();
    ctx.stroke();
  }

  function drawHeart(cx, cy, size) {
    ctx.save();
    ctx.beginPath();
    ctx.translate(cx, cy);
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(0, -size * 0.3, -size, -size * 0.3, -size, 0);
    ctx.bezierCurveTo(-size, size * 0.5, 0, size, 0, size * 1.2);
    ctx.bezierCurveTo(0, size, size, size * 0.5, size, 0);
    ctx.bezierCurveTo(size, -size * 0.3, 0, -size * 0.3, 0, 0);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  const brushFunctions = {
    round(e, x, y, size, color, opacity) {
      ctx.strokeStyle = hexToRgba(color, opacity);
      ctx.lineWidth = size;
      ctx.lineCap = 'round';
      ctx.lineTo(x, y);
      ctx.stroke();
    },
    square(e, x, y, size, color, opacity) {
      ctx.fillStyle = hexToRgba(color, opacity);
      ctx.fillRect(x - size / 2, y - size / 2, size, size);
    },
    dotted(e, x, y, size, color, opacity) {
      ctx.fillStyle = hexToRgba(color, opacity);
      ctx.beginPath();
      ctx.arc(x, y, size / 2, 0, Math.PI * 2);
      ctx.fill();
    },
    spray(e, x, y, size, color, opacity) {
      ctx.fillStyle = hexToRgba(color, opacity);
      for (let i = 0; i < 30; i++) {
        const ox = (Math.random() - 0.5) * size * 2;
        const oy = (Math.random() - 0.5) * size * 2;
        ctx.fillRect(x + ox, y + oy, 1, 1);
      }
    },
    calligraphy(e, x, y, size, color, opacity) {
      ctx.strokeStyle = hexToRgba(color, opacity);
      ctx.lineWidth = size;
      ctx.lineCap = 'butt';
      ctx.lineTo(x + size / 2, y);
      ctx.stroke();
    },
    splatter(e, x, y, size, color, opacity) {
      ctx.fillStyle = hexToRgba(color, opacity);
      for (let i = 0; i < 20; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * size;
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, size / 10, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    watercolor(e, x, y, size, color, opacity) {
      ctx.strokeStyle = hexToRgba(color, opacity * 0.7);
      ctx.lineWidth = size;
      ctx.lineCap = 'round';
      ctx.lineTo(x, y);
      ctx.stroke();
    },
    chalk(e, x, y, size, color, opacity) {
      ctx.fillStyle = hexToRgba(color, opacity * 0.5);
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc(x + Math.random() * size - size / 2, y + Math.random() * size - size / 2, size / 4, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    oil(e, x, y, size, color, opacity) {
      ctx.fillStyle = hexToRgba(color, opacity);
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    },
    pencil(e, x, y, size, color, opacity) {
      ctx.strokeStyle = hexToRgba(color, opacity * 0.8);
      ctx.lineWidth = size / 2;
      ctx.lineCap = 'round';
      ctx.lineTo(x, y);
      ctx.stroke();
    },
    neon(e, x, y, size, color, opacity) {
      ctx.strokeStyle = hexToRgba(color, opacity);
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.lineWidth = size;
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.shadowBlur = 0;
    },
    glitter(e, x, y, size, color, opacity) {
      ctx.fillStyle = hexToRgba(color, opacity);
      for (let i = 0; i < 10; i++) {
        ctx.fillRect(x + Math.random() * size - size / 2, y + Math.random() * size - size / 2, 2, 2);
      }
    },
    textured(e, x, y, size, color, opacity) {
      ctx.strokeStyle = hexToRgba(color, opacity);
      ctx.lineWidth = size;
      ctx.lineTo(x, y);
      ctx.stroke();
    },
    pattern(e, x, y, size, color, opacity) {
      ctx.fillStyle = hexToRgba(color, opacity);
      ctx.beginPath();
      ctx.arc(x, y, size / 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + size / 2, y, size / 6, 0, Math.PI * 2);
      ctx.fill();
    },
    airbrush(e, x, y, size, color, opacity) {
      for (let i = 0; i < 20; i++) {
        const ox = (Math.random() - 0.5) * size;
        const oy = (Math.random() - 0.5) * size;
        ctx.fillStyle = hexToRgba(color, opacity * Math.random());
        ctx.fillRect(x + ox, y + oy, 1, 1);
      }
    },
    star(e, x, y, size, color, opacity) {
      ctx.strokeStyle = hexToRgba(color, opacity);
      drawStar(x, y, 5, size, size / 2);
    },
    heart(e, x, y, size, color, opacity) {
      ctx.strokeStyle = hexToRgba(color, opacity);
      drawHeart(x, y, size);
    },
    zigzag(e, x, y, size, color, opacity) {
      ctx.strokeStyle = hexToRgba(color, opacity);
      ctx.lineWidth = size;
      ctx.lineTo(x + (Math.random() - 0.5) * size, y + (Math.random() - 0.5) * size);
      ctx.stroke();
    },
    scatter(e, x, y, size, color, opacity) {
      ctx.fillStyle = hexToRgba(color, opacity);
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc(x + Math.random() * size - size / 2, y + Math.random() * size - size / 2, size / 6, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    crayon(e, x, y, size, color, opacity) {
      ctx.strokeStyle = hexToRgba(color, opacity * 0.9);
      ctx.lineWidth = size;
      ctx.lineCap = 'round';
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  };

  // =========================
  // OPTIMIZED Fill (tolerant + 1px edge expand)
  // =========================
  function colorDistSq(r1, g1, b1, a1, r2, g2, b2, a2) {
    const dr = r1 - r2, dg = g1 - g2, db = b1 - b2, da = a1 - a2;
    return dr * dr + dg * dg + db * db + da * da;
  }

  function matchesTargetWithTolerance(i, target, data, tolSq, alphaMin = 0) {
    const a = data[i + 3];
    if (a < alphaMin) return false;
    return (
      colorDistSq(
        data[i], data[i + 1], data[i + 2], a,
        target[0], target[1], target[2], target[3]
      ) <= tolSq
    );
  }

  function setPixel(i, rgba, data) {
    data[i] = rgba[0];
    data[i + 1] = rgba[1];
    data[i + 2] = rgba[2];
    data[i + 3] = rgba[3];
  }

  function floodFill(startX, startY, fillHex) {
    const width = canvas.width, height = canvas.height;
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    // Tuning knobs
    const TOL = 28;         // increase if you still see gaps
    const TOL_EDGE = 40;    // slightly higher for edge expand
    const EDGE_EXPAND = 1;  // "under outline" by ~1px
    const alphaMin = 0;

    const tolSq = TOL * TOL;
    const tolEdgeSq = TOL_EDGE * TOL_EDGE;

    const startPos = (startY * width + startX) * 4;
    const target = [data[startPos], data[startPos + 1], data[startPos + 2], data[startPos + 3]];
    const fill = hexToRgbaArray(fillHex, opacityInput ? opacityInput.value : 100);

    // if already basically same
    if (colorDistSq(target[0], target[1], target[2], target[3], fill[0], fill[1], fill[2], fill[3]) <= 1) return;

    const visited = new Uint8Array(width * height);
    const stack = [startX + startY * width];

    while (stack.length) {
      const idx = stack.pop();
      if (visited[idx]) continue;
      visited[idx] = 1;

      const x = idx % width;
      const y = (idx / width) | 0;
      const i = idx * 4;

      if (!matchesTargetWithTolerance(i, target, data, tolSq, alphaMin)) continue;

      setPixel(i, fill, data);

      if (x > 0) stack.push(idx - 1);
      if (x < width - 1) stack.push(idx + 1);
      if (y > 0) stack.push(idx - width);
      if (y < height - 1) stack.push(idx + width);
    }

    // edge expand pass (fills fringe that is still close to target)
    for (let pass = 0; pass < EDGE_EXPAND; pass++) {
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const idx = x + y * width;
          const i = idx * 4;

          // already fill
          if (data[i] === fill[0] && data[i + 1] === fill[1] && data[i + 2] === fill[2] && data[i + 3] === fill[3]) {
            continue;
          }
          if (!matchesTargetWithTolerance(i, target, data, tolEdgeSq, alphaMin)) continue;

          // if any neighbor is fill, fill this pixel too (8-way)
          const n = [
            (idx - 1) * 4, (idx + 1) * 4, (idx - width) * 4, (idx + width) * 4,
            (idx - width - 1) * 4, (idx - width + 1) * 4, (idx + width - 1) * 4, (idx + width + 1) * 4
          ];
          let hasFilledNeighbor = false;
          for (let k = 0; k < n.length; k++) {
            const j = n[k];
            if (data[j] === fill[0] && data[j + 1] === fill[1] && data[j + 2] === fill[2] && data[j + 3] === fill[3]) {
              hasFilledNeighbor = true;
              break;
            }
          }
          if (hasFilledNeighbor) setPixel(i, fill, data);
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  // =========================
  // Text tool
  // =========================
  function addTextAt(x, y) {
    flattenOverlayIfAny();

    const text = prompt('Enter text (Use \\n for new lines):', 'Text');
    if (!text) return;

    saveState();

    const size = Math.max(6, parseInt(brushSizeInput ? brushSizeInput.value : 24, 10) || 24);
    const opacity = clamp(parseFloat(opacityInput ? opacityInput.value : 100), 0, 100);
    const color = brushColorInput ? brushColorInput.value : '#000000';

    ctx.save();
    ctx.fillStyle = hexToRgba(color, opacity);
    ctx.textBaseline = 'top';
    ctx.font = `${size}px Arial`;

    const lines = String(text).split('\n');
    const lineHeight = Math.round(size * 1.2);
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], x, y + i * lineHeight);
    }
    ctx.restore();

    baseImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  }

  // =========================
  // Clipboard overlay
  // =========================
  function copyOverlayToClipboard() {
    if (!overlayObj) return;
    const off = document.createElement('canvas');
    off.width = Math.max(1, Math.round(overlayObj.w));
    off.height = Math.max(1, Math.round(overlayObj.h));
    const offCtx = off.getContext('2d');
    offCtx.drawImage(overlayObj.img, 0, 0, off.width, off.height);
    clipboardObj = { dataUrl: off.toDataURL('image/png'), w: off.width, h: off.height };
  }

  function cutOverlayToClipboard() {
    if (!overlayObj) return;
    saveState();
    copyOverlayToClipboard();
    if (baseImageData) ctx.putImageData(baseImageData, 0, 0);
    overlayObj = null;
    updateTransformBox();
  }

  function pasteClipboardAsOverlay() {
    if (!clipboardObj) return;
    const img = new Image();
    img.onload = () => {
      saveState();
      baseImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const w = clipboardObj.w, h = clipboardObj.h;
      const x = Math.floor((canvas.width - w) / 2);
      const y = Math.floor((canvas.height - h) / 2);
      overlayObj = { img, x, y, w, h, angle: 0 };
      if (toolSelect) toolSelect.value = 'transform';
      currentTool = 'transform';
      updateTransformBox();
      renderOverlay();
    };
    img.src = clipboardObj.dataUrl;
  }

  // =========================
  // Flip canvas
  // =========================
  function flipCanvasHorizontal() {
    saveState();
    flattenOverlayIfAny();

    const off = document.createElement('canvas');
    off.width = canvas.width;
    off.height = canvas.height;
    off.getContext('2d').drawImage(canvas, 0, 0);

    ctx.save();
    ctx.setTransform(-1, 0, 0, 1, canvas.width, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(off, 0, 0);
    ctx.restore();

    baseImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  }

  // =========================
  // Transform interactions
  // =========================
  if (transformBox) {
    transformBox.addEventListener('pointerdown', (e) => {
      if (!overlayObj || currentTool !== 'transform') return;
      transformBox.setPointerCapture(e.pointerId);

      if (!baseImageData) baseImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      const t = e.target;
      const isRotate = t && t.dataset && t.dataset.rotate === 'true';
      const handle = t && t.dataset ? (t.dataset.handle || null) : null;

      transformMode = isRotate ? 'rotate' : (handle ? 'resize' : 'move');
      activeHandle = handle;

      startMouse = canvasPoint(e);
      startState = {
        x: overlayObj.x,
        y: overlayObj.y,
        w: overlayObj.w,
        h: overlayObj.h,
        angle: overlayObj.angle || 0
      };

      e.preventDefault();
    });

    transformBox.addEventListener('pointermove', (e) => {
      if (!overlayObj || currentTool !== 'transform' || !transformMode) return;

      const p = canvasPoint(e);
      const dx = p.x - startMouse.x;
      const dy = p.y - startMouse.y;

      if (transformMode === 'move') {
        overlayObj.x = startState.x + dx;
        overlayObj.y = startState.y + dy;
      } else if (transformMode === 'resize') {
        let x = startState.x, y = startState.y, w = startState.w, h = startState.h;
        const aspect = w / h;
        const keepAspect = e.shiftKey;

        const applyResize = (left, top, right, bottom) => {
          if (left)  { x = startState.x + dx; w = startState.w - dx; }
          if (right) { w = startState.w + dx; }
          if (top)   { y = startState.y + dy; h = startState.h - dy; }
          if (bottom){ h = startState.h + dy; }

          w = Math.max(5, w);
          h = Math.max(5, h);

          if (keepAspect) {
            const newAspect = w / h;
            if (newAspect > aspect) h = w / aspect;
            else w = h * aspect;
          }

          if (left) x = startState.x + (startState.w - w);
          if (top)  y = startState.y + (startState.h - h);
        };

        const map = {
          nw: [true, true, false, false],
          n:  [false, true, false, false],
          ne: [false, true, true, false],
          e:  [false, false, true, false],
          se: [false, false, true, true],
          s:  [false, false, false, true],
          sw: [true, false, false, true],
          w:  [true, false, false, false]
        };

        const sides = map[activeHandle] || [false, false, false, false];
        applyResize(...sides);

        overlayObj.x = x; overlayObj.y = y; overlayObj.w = w; overlayObj.h = h;
      } else if (transformMode === 'rotate') {
        const cx = startState.x + startState.w / 2;
        const cy = startState.y + startState.h / 2;
        const angle0 = Math.atan2(startMouse.y - cy, startMouse.x - cx);
        const angle1 = Math.atan2(p.y - cy, p.x - cx);
        overlayObj.angle = startState.angle + (angle1 - angle0);
      }

      updateTransformBox();
      renderOverlay();
    });

    transformBox.addEventListener('pointerup', (e) => {
      if (!transformMode) return;
      try { transformBox.releasePointerCapture(e.pointerId); } catch {}
      transformMode = null;
      activeHandle = null;
    });

    // dblclick commits overlay to canvas
    transformBox.addEventListener('dblclick', () => commitOverlay());
  }

  // =========================
  // Crop tool (on overlay only, non-rotated)
  // =========================
  if (cropOverlay) cropOverlay.style.pointerEvents = 'none';

  function showCropOverlay(r) {
    if (!cropOverlay) return;
    Object.assign(cropOverlay.style, {
      left: r.x + 'px',
      top: r.y + 'px',
      width: r.w + 'px',
      height: r.h + 'px',
      display: 'block'
    });
  }

  function hideCropOverlay() {
    if (!cropOverlay) return;
    cropOverlay.style.display = 'none';
  }

  function applyCrop() {
    if (!overlayObj || !cropRect) return;

    // Only supports non-rotated
    if (Math.abs(overlayObj.angle || 0) > 0.0001) {
      alert('Crop supports only non-rotated image/selection. Set rotation to 0 first.');
      return;
    }

    const ix1 = Math.max(cropRect.x, overlayObj.x);
    const iy1 = Math.max(cropRect.y, overlayObj.y);
    const ix2 = Math.min(cropRect.x + cropRect.w, overlayObj.x + overlayObj.w);
    const iy2 = Math.min(cropRect.y + cropRect.h, overlayObj.y + overlayObj.h);
    const iw = Math.max(0, ix2 - ix1);
    const ih = Math.max(0, iy2 - iy1);
    if (iw <= 0 || ih <= 0) return;

    const imgW = overlayObj.img.naturalWidth || overlayObj.img.width;
    const imgH = overlayObj.img.naturalHeight || overlayObj.img.height;

    const scaleX = imgW / overlayObj.w;
    const scaleY = imgH / overlayObj.h;

    const sx = (ix1 - overlayObj.x) * scaleX;
    const sy = (iy1 - overlayObj.y) * scaleY;
    const sw = iw * scaleX;
    const sh = ih * scaleY;

    const off = document.createElement('canvas');
    off.width = Math.max(1, Math.round(sw));
    off.height = Math.max(1, Math.round(sh));
    const offCtx = off.getContext('2d');
    offCtx.drawImage(overlayObj.img, sx, sy, sw, sh, 0, 0, off.width, off.height);

    const croppedImg = new Image();
    croppedImg.onload = () => {
      saveState();
      overlayObj.img = croppedImg;
      overlayObj.x = ix1;
      overlayObj.y = iy1;
      overlayObj.w = iw;
      overlayObj.h = ih;
      overlayObj.angle = 0;

      if (!baseImageData) baseImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      updateTransformBox();
      renderOverlay();
    };
    croppedImg.src = off.toDataURL('image/png');
  }

  // =========================
  // Unified Canvas Input Handlers
  // (prevents conflicts / ensures tools work)
  // =========================
  canvas.addEventListener('mousedown', (e) => {
    const p = canvasPoint(e);

    // ensure overlay stays visible during transform/crop
    if (currentTool === 'transform') return;

    if (currentTool === 'fill') {
      saveState();
      floodFill(Math.floor(p.x), Math.floor(p.y), brushColorInput.value);
      return;
    }

    if (currentTool === 'text') {
      addTextAt(p.x, p.y);
      return;
    }

    if (currentTool === 'shape') {
      shapeActive = true;
      shapeStart = p;
      shapeSaved = ctx.getImageData(0, 0, canvas.width, canvas.height);
      saveState();
      return;
    }

    if (currentTool === 'select') {
      isSelecting = true;
      selectStart = p;
      selectRect = null;
      hideSelection();
      resetLasso();
      return;
    }

    if (currentTool === 'lasso') {
      isLassoing = true;
      lassoPoints = [p];
      hideSelection();
      drawLassoOverlay(lassoPoints);
      return;
    }

    if (currentTool === 'cropImage') {
      if (!overlayObj) return;
      if (Math.abs(overlayObj.angle || 0) > 0.0001) {
        alert('Crop supports only non-rotated image/selection. Set rotation to 0 first.');
        return;
      }
      isCropping = true;
      cropStart = p;
      cropRect = null;
      return;
    }

    // Drawing tools (pen/eraser)
    if (currentTool === 'pen' || currentTool === 'eraser') {
      // commit overlay when starting drawing
      if (overlayObj && currentTool !== 'transform') commitOverlay();

      saveState();
      isDrawing = true;
      lastX = p.x;
      lastY = p.y;
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      return;
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    const p = canvasPoint(e);

    // Shape preview
    if (currentTool === 'shape' && shapeActive && shapeSaved) {
      ctx.putImageData(shapeSaved, 0, 0);

      ctx.strokeStyle = hexToRgba(brushColorInput.value, opacityInput.value);
      ctx.lineWidth = parseInt(brushSizeInput.value, 10) || 1;

      const w = p.x - shapeStart.x;
      const h = p.y - shapeStart.y;
      const shape = shapeTypeSelect.value;

      if (shape === 'line' || shape === 'dottedLine') {
        ctx.beginPath();
        ctx.moveTo(shapeStart.x, shapeStart.y);
        if (shape === 'dottedLine') ctx.setLineDash([2, 6]);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (shape === 'rectangle' || shape === 'dottedRectangle') {
        if (shape === 'dottedRectangle') ctx.setLineDash([2, 6]);
        ctx.strokeRect(shapeStart.x, shapeStart.y, w, h);
        ctx.setLineDash([]);
      } else if (shape === 'circle') {
        const r = Math.sqrt(w * w + h * h);
        ctx.beginPath();
        ctx.arc(shapeStart.x, shapeStart.y, r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (shape === 'ellipse' || shape === 'oval') {
        ctx.beginPath();
        ctx.ellipse(shapeStart.x + w / 2, shapeStart.y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (shape === 'star') {
        const r = Math.max(Math.abs(w), Math.abs(h));
        drawStar(shapeStart.x, shapeStart.y, 5, r, r / 2);
      } else if (shape === 'heart') {
        drawHeart(shapeStart.x, shapeStart.y, Math.max(Math.abs(w), Math.abs(h)));
      }
      return;
    }

    // Rect select preview
    if (currentTool === 'select' && isSelecting) {
      const x1 = Math.min(selectStart.x, p.x);
      const y1 = Math.min(selectStart.y, p.y);
      const w = Math.abs(p.x - selectStart.x);
      const h = Math.abs(p.y - selectStart.y);
      selectRect = { x: x1, y: y1, w, h };
      showSelection(x1, y1, w, h);
      return;
    }

    // Lasso preview
    if (currentTool === 'lasso' && isLassoing) {
      const last = lassoPoints[lassoPoints.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) > 1) {
        lassoPoints.push(p);
        drawLassoOverlay(lassoPoints);
      }
      return;
    }

    // Crop preview
    if (currentTool === 'cropImage' && isCropping) {
      const x1 = Math.min(cropStart.x, p.x);
      const y1 = Math.min(cropStart.y, p.y);
      const w = Math.abs(p.x - cropStart.x);
      const h = Math.abs(p.y - cropStart.y);
      cropRect = { x: x1, y: y1, w, h };
      showCropOverlay(cropRect);
      return;
    }

    // Drawing
    if ((currentTool === 'pen' || currentTool === 'eraser') && isDrawing) {
      const size = parseInt(brushSizeInput.value, 10) || 1;
      const opacity = parseFloat(opacityInput.value) || 100;
      const color = brushColorInput.value;

      ctx.globalCompositeOperation = (currentTool === 'eraser') ? 'destination-out' : 'source-over';

      // symmetry option
      const drawOne = (x0, y0, x1, y1) => {
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        brushFunctions[currentBrush](e, x1, y1, size, color, opacity);
      };

      if (symmetryCheckbox && symmetryCheckbox.checked) {
        drawOne(lastX, lastY, p.x, p.y);
        drawOne(canvas.width - lastX, lastY, canvas.width - p.x, p.y);
      } else {
        drawOne(lastX, lastY, p.x, p.y);
      }

      lastX = p.x;
      lastY = p.y;
      return;
    }
  });

  canvas.addEventListener('mouseup', () => {
    // end drawing
    isDrawing = false;

    // finish shape
    if (currentTool === 'shape') {
      shapeActive = false;
      shapeSaved = null;
      return;
    }

    // finish selection -> make overlay
    if (currentTool === 'select') {
      if (!isSelecting) return;
      isSelecting = false;
      hideSelection();
      if (!selectRect || selectRect.w < 1 || selectRect.h < 1) return;

      const off = document.createElement('canvas');
      off.width = Math.max(1, Math.round(selectRect.w));
      off.height = Math.max(1, Math.round(selectRect.h));
      const offCtx = off.getContext('2d');

      offCtx.drawImage(canvas, selectRect.x, selectRect.y, selectRect.w, selectRect.h, 0, 0, off.width, off.height);

      const img = new Image();
      img.onload = () => {
        saveState();
        ctx.clearRect(selectRect.x, selectRect.y, selectRect.w, selectRect.h);
        baseImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        overlayObj = { img, x: selectRect.x, y: selectRect.y, w: selectRect.w, h: selectRect.h, angle: 0 };

        if (toolSelect) toolSelect.value = 'transform';
        currentTool = 'transform';
        updateTransformBox();
        renderOverlay();
        selectRect = null;
      };
      img.src = off.toDataURL('image/png');
      return;
    }

    // finish lasso -> make overlay
    if (currentTool === 'lasso') {
      if (!isLassoing) return;
      isLassoing = false;

      if (lassoPoints.length < 3) {
        resetLasso();
        return;
      }

      // bounds
      const xs = lassoPoints.map(p => p.x);
      const ys = lassoPoints.map(p => p.y);
      const bounds = {
        x: Math.min(...xs),
        y: Math.min(...ys),
        w: Math.max(1, Math.round(Math.max(...xs) - Math.min(...xs))),
        h: Math.max(1, Math.round(Math.max(...ys) - Math.min(...ys)))
      };

      const off = document.createElement('canvas');
      off.width = bounds.w;
      off.height = bounds.h;
      const offCtx = off.getContext('2d');

      // clip lasso path
      offCtx.beginPath();
      lassoPoints.forEach((pt, i) => {
        const x = pt.x - bounds.x;
        const y = pt.y - bounds.y;
        if (i === 0) offCtx.moveTo(x, y);
        else offCtx.lineTo(x, y);
      });
      offCtx.closePath();
      offCtx.save();
      offCtx.clip();
      offCtx.drawImage(canvas, -bounds.x, -bounds.y);
      offCtx.restore();

      const img = new Image();
      img.onload = () => {
        saveState();

        // clear lasso region from main canvas
        ctx.save();
        ctx.beginPath();
        lassoPoints.forEach((pt, i) => {
          if (i === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.closePath();
        ctx.clip();
        ctx.clearRect(bounds.x, bounds.y, bounds.w, bounds.h);
        ctx.restore();

        baseImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        overlayObj = { img, x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h, angle: 0 };

        if (toolSelect) toolSelect.value = 'transform';
        currentTool = 'transform';
        updateTransformBox();
        renderOverlay();
      };
      img.src = off.toDataURL('image/png');

      resetLasso();
      return;
    }

    // finish crop
    if (currentTool === 'cropImage') {
      if (!isCropping) return;
      isCropping = false;
      hideCropOverlay();
      if (!cropRect) return;
      applyCrop();
      cropRect = null;
      return;
    }
  });

  canvas.addEventListener('mouseout', () => {
    isDrawing = false;
  });

  // =========================
  // UI wiring
  // =========================
  if (brushTypeSelect) {
    brushTypeSelect.addEventListener('change', () => {
      currentBrush = brushTypeSelect.value;
    });
  }

  if (brushSizeInput && brushSizeValue) {
    brushSizeInput.addEventListener('input', () => {
      brushSizeValue.textContent = brushSizeInput.value;
    });
  }
  if (opacityInput && opacityValue) {
    opacityInput.addEventListener('input', () => {
      opacityValue.textContent = opacityInput.value;
    });
  }

  // Recent colors
  let recentColors = [];
  function addRecentColor(color) {
    if (!recentColorsDiv) return;
    if (!recentColors.includes(color)) {
      recentColors.push(color);
      const swatch = document.createElement('div');
      swatch.className = 'color-swatch';
      swatch.style.backgroundColor = color;
      swatch.onclick = () => { brushColorInput.value = color; };
      recentColorsDiv.appendChild(swatch);
    }
  }
  if (brushColorInput) {
    brushColorInput.addEventListener('change', () => addRecentColor(brushColorInput.value));
  }

  // Background selector
  if (backgroundPatternSelect && canvasContainer) {
    backgroundPatternSelect.addEventListener('change', () => {
      const pattern = backgroundPatternSelect.value;
      canvasContainer.className = 'canvas-container ' + pattern;
    });
  }

  // Tool change
  if (toolSelect) {
    toolSelect.addEventListener('change', () => {
      const nextTool = toolSelect.value;

      // show/hide shapes
      if (shapeOptionsDiv) shapeOptionsDiv.style.display = nextTool === 'shape' ? 'inline-block' : 'none';

      // leaving transform commits
      if (currentTool === 'transform' && nextTool !== 'transform' && nextTool !== 'cropImage') {
        commitOverlay();
      }

      currentTool = nextTool;

      // crop overlay visibility
      if (cropOverlay) cropOverlay.style.display = (currentTool === 'cropImage') ? 'block' : 'none';
      if (currentTool !== 'cropImage') hideCropOverlay();

      // cleanup selection visuals when leaving
      if (currentTool !== 'select') hideSelection();
      if (currentTool !== 'lasso') resetLasso();

      // transform box
      if (currentTool === 'transform') {
        if (!baseImageData) baseImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        updateTransformBox();
        renderOverlay();
      } else {
        updateTransformBox();
        if (currentTool === 'cropImage' && overlayObj && baseImageData) renderOverlay();
      }
    });
  }

  // Add Image
  if (addImageButton && addImageInput) {
    addImageButton.addEventListener('click', () => addImageInput.click());
    addImageInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          saveState();

          baseImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

          const scale = Math.min(canvas.width / img.width, canvas.height / img.height, 1);
          const w = Math.floor(img.width * scale);
          const h = Math.floor(img.height * scale);
          const x = Math.floor((canvas.width - w) / 2);
          const y = Math.floor((canvas.height - h) / 2);

          overlayObj = { img, x, y, w, h, angle: 0 };

          if (toolSelect) toolSelect.value = 'transform';
          currentTool = 'transform';
          updateTransformBox();
          renderOverlay();
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
      addImageInput.value = '';
    });
  }

  // Flip Canvas
  if (flipCanvasButton) {
    flipCanvasButton.addEventListener('click', flipCanvasHorizontal);
  }

  // Undo/Redo buttons
  if (undoCanvasButton) undoCanvasButton.addEventListener('click', undo);
  if (redoCanvasButton) redoCanvasButton.addEventListener('click', redo);

  // New/Clear
  function resetAll() {
    ctx.globalCompositeOperation = 'source-over';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    undoStack = [];
    redoStack = [];
    clearActiveOverlayUI();
  }
  if (newCanvasButton) newCanvasButton.addEventListener('click', resetAll);
  if (clearCanvasButton) clearCanvasButton.addEventListener('click', resetAll);

  // Download
  function getExportBackgroundFill(format) {
    if (format === 'png-transparent') return null;

    const selectedPattern = backgroundPatternSelect ? backgroundPatternSelect.value : 'plain';
    if (selectedPattern === 'dark') return '#000000';
    if (selectedPattern === 'plain') return '#ffffff';

    const computedColor = canvasContainer ? getComputedStyle(canvasContainer).backgroundColor : '#ffffff';
    if (computedColor && computedColor !== 'rgba(0, 0, 0, 0)' && computedColor !== 'transparent') return computedColor;
    return '#ffffff';
  }

  function buildExportCanvas(fillColor) {
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = canvas.width;
    exportCanvas.height = canvas.height;
    const exportCtx = exportCanvas.getContext('2d');

    if (fillColor) {
      exportCtx.fillStyle = fillColor;
      exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    }

    // ensure overlay is included in export
    if (overlayObj && baseImageData) {
      exportCtx.putImageData(baseImageData, 0, 0);
      exportCtx.save();
      exportCtx.translate(overlayObj.x, overlayObj.y);
      exportCtx.rotate(overlayObj.angle || 0);
      exportCtx.drawImage(overlayObj.img, 0, 0, overlayObj.w, overlayObj.h);
      exportCtx.restore();
    } else {
      exportCtx.drawImage(canvas, 0, 0);
    }
    return exportCanvas;
  }

  function getDownloadDataUrl(format) {
    const fillColor = getExportBackgroundFill(format);
    const exportCanvas = buildExportCanvas(fillColor);
    if (format === 'jpg' || format === 'jpeg') return exportCanvas.toDataURL('image/jpeg', 0.92);
    return exportCanvas.toDataURL('image/png');
  }

  function getDownloadFilename(format) {
    const ext = format === 'png-transparent' ? 'png' : format;
    return `DrawNow_art.${ext}`;
  }

  if (downloadCanvasButton) {
    downloadCanvasButton.addEventListener('click', () => {
      const format = downloadFormatSelect ? downloadFormatSelect.value : 'png';
      const a = document.createElement('a');
      a.download = getDownloadFilename(format);
      a.href = getDownloadDataUrl(format);
      a.click();
    });
  }

  // =========================
  // Keyboard shortcuts
  // =========================
  document.addEventListener('keydown', (e) => {
    const key = (e.key || '').toLowerCase();
    const ctrlOrCmd = e.ctrlKey || e.metaKey;

    const t = e.target;
    const isTypingTarget =
      t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);

    if (!ctrlOrCmd) return;

    const prevent = () => { e.preventDefault(); e.stopPropagation(); };

    // Undo / Redo
    if (key === 'z' && !e.shiftKey) {
      if (!isTypingTarget) { prevent(); undo(); }
      return;
    }
    if (key === 'y' || (key === 'z' && e.shiftKey)) {
      if (!isTypingTarget) { prevent(); redo(); }
      return;
    }

    // Copy/Cut/Paste overlay
    if (key === 'c') {
      if (!isTypingTarget) { prevent(); copyOverlayToClipboard(); }
      return;
    }
    if (key === 'x') {
      if (!isTypingTarget) { prevent(); cutOverlayToClipboard(); }
      return;
    }
    if (key === 'v') {
      if (!isTypingTarget) { prevent(); pasteClipboardAsOverlay(); }
      return;
    }

    // Download
    if (key === 's') {
      if (!isTypingTarget && downloadCanvasButton) { prevent(); downloadCanvasButton.click(); }
      return;
    }

    // Enter commits overlay
    if (key === 'enter') {
      if (!isTypingTarget && currentTool === 'transform' && overlayObj) {
        prevent();
        commitOverlay();
      }
    }

    // Escape cancels temp states
    if (key === 'escape') {
      prevent();
      isSelecting = false;
      isCropping = false;
      shapeActive = false;
      hideSelection();
      hideCropOverlay();
      resetLasso();
      transformMode = null;
      activeHandle = null;
    }
  });

  // =========================
  // Initial UI state
  // =========================
  if (shapeOptionsDiv) shapeOptionsDiv.style.display = (currentTool === 'shape') ? 'inline-block' : 'none';
  updateTransformBox();
});

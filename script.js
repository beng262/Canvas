document.addEventListener('DOMContentLoaded', () => {
  // =========================
  // Layered canvases (3 max)
  // =========================
  const layerCanvases = [
    document.getElementById('layerCanvas0'),
    document.getElementById('layerCanvas1'),
    document.getElementById('layerCanvas2')
  ];

  const layers = layerCanvases.map((c) => ({
    canvas: c,
    ctx: c.getContext('2d', { willReadFrequently: true }),
    enabled: true,
    visible: true,
    undo: [],
    redo: [],
  }));

  const MAX_HISTORY = 50;
  let activeLayer = 0;

  function active() { return layers[activeLayer]; }
  function W() { return layers[0].canvas.width; }
  function H() { return layers[0].canvas.height; }

  // =========================
  // UI elements
  // =========================
  const brushSizeInput = document.getElementById('brushSize');
  const brushSizeValue = document.getElementById('brushSizeValue');
  const opacityInput = document.getElementById('opacity');
  const opacityValue = document.getElementById('opacityValue');
  const brushColorInput = document.getElementById('brushColor');

  const toolSelect = document.getElementById('tool');
  const brushTypeSelect = document.getElementById('brushType');
  const shapeOptionsDiv = document.getElementById('shapeOptions');
  const shapeTypeSelect = document.getElementById('shapeType');

  const clearCanvasButton = document.getElementById('clearCanvas');
  const undoCanvasButton = document.getElementById('undoCanvas');
  const redoCanvasButton = document.getElementById('redoCanvas');

  const downloadFormatSelect = document.getElementById('downloadFormat');
  const downloadCanvasButton = document.getElementById('downloadCanvas');
  const flipCanvasButton = document.getElementById('flipCanvas');

  const addImageButton = document.getElementById('addImageButton');
  const addImageInput = document.getElementById('addImageInput');

  const backgroundPatternSelect = document.getElementById('backgroundPattern');
  const canvasContainer = document.getElementById('canvasContainer');
  const symmetryCheckbox = document.getElementById('symmetry');

  const darkModeToggle = document.getElementById('darkModeToggle');

  // layers UI
  const addLayerBtn = document.getElementById('addLayerBtn');
  const layerVis = [
    document.getElementById('layerVis0'),
    document.getElementById('layerVis1'),
    document.getElementById('layerVis2'),
  ];
  const layerRadios = Array.from(document.querySelectorAll('input[name="activeLayer"]'));

  // overlays
  const selectionOverlay = document.getElementById('selectionOverlay');
  const lassoOverlay = document.getElementById('lassoOverlay');
  const lassoCtx = lassoOverlay.getContext('2d', { willReadFrequently: true });
  const cropOverlay = document.getElementById('cropOverlay');
  const transformBox = document.getElementById('transformBox');

  // color picker
  const pickerType = document.getElementById('pickerType');
  const colorPickerBox = document.getElementById('colorPickerBox');
  const colorPickerCanvas = document.getElementById('colorPickerCanvas');
  const pickerCtx = colorPickerCanvas.getContext('2d', { willReadFrequently: true });

  // =========================
  // Tool state
  // =========================
  let currentTool = toolSelect.value;
  let currentBrush = brushTypeSelect.value;

  let isDrawing = false;
  let lastX = 0, lastY = 0;

  // stamp spacing control (fixes star/heart spam)
  let lastStampX = null, lastStampY = null;

  const stampBrushes = new Set([
    'square','dotted','spray','splatter','glitter','pattern','airbrush','star','heart','scatter','oil'
  ]);

  function stampSpacingPx(brush, size) {
    // More spacing for shape stamps
    if (brush === 'star' || brush === 'heart') return Math.max(10, size * 1.6);
    if (brush === 'splatter') return Math.max(8, size * 1.2);
    if (brush === 'scatter' || brush === 'glitter') return Math.max(6, size * 1.0);
    if (brush === 'spray' || brush === 'airbrush') return Math.max(3, size * 0.6);
    return Math.max(4, size * 0.8);
  }

  // selection
  let isSelecting = false;
  let selectStart = { x: 0, y: 0 };
  let selectRect = null;

  // lasso
  let isLassoing = false;
  let lassoPoints = [];

  // shape
  let shapeActive = false;
  let shapeStart = { x: 0, y: 0 };
  let savedImageData = null;

  // overlay object: applies to ACTIVE layer only
  let overlayObj = null;    // { img, x, y, w, h, angle }
  let baseImageData = null; // snapshot of active layer

  let transformMode = null;
  let activeHandle = null;
  let startMouse = { x: 0, y: 0 };
  let startState = null;

  // crop
  let isCropping = false;
  let cropStart = { x: 0, y: 0 };
  let cropRect = null;

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
  // Helpers
  // =========================
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function canvasPoint(evt) {
    const r = canvasContainer.getBoundingClientRect();
    return { x: evt.clientX - r.left, y: evt.clientY - r.top };
  }

  function hexToRgba(hex, opacity) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const bigint = parseInt(hex, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r},${g},${b},${opacity / 100})`;
  }

  function hexToRgbaArray(hex, opacity) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const bigint = parseInt(hex, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    const a = (opacity / 100) * 255;
    return [r, g, b, a];
  }

  // =========================
  // Layer control
  // =========================
  function setLayerVisible(i, vis) {
    layers[i].visible = vis;
    layers[i].canvas.style.display = vis ? 'block' : 'none';
  }

  function setActiveLayer(i) {
    if (!layers[i].enabled) return;
    commitOverlay(); // commit any overlay before switching layers
    activeLayer = i;
  }

  function enableLayer(i) {
    layers[i].enabled = true;
    layers[i].canvas.style.opacity = '1';
    layers[i].canvas.style.display = 'block';
    setLayerVisible(i, true);
  }

  // Start with only Layer1 enabled; allow adding up to 3
  enableLayer(0);
  layers[1].enabled = false; layers[2].enabled = false;
  layers[1].canvas.style.display = 'none';
  layers[2].canvas.style.display = 'none';

  layerVis.forEach((cb, i) => {
    cb.checked = true;
    cb.addEventListener('change', () => setLayerVisible(i, cb.checked));
  });

  layerRadios.forEach(r => {
    r.addEventListener('change', () => setActiveLayer(parseInt(r.value, 10)));
  });

  if (addLayerBtn) {
    addLayerBtn.addEventListener('click', () => {
      const idx = layers.findIndex(l => !l.enabled);
      if (idx === -1) return;
      enableLayer(idx);
      const radio = layerRadios.find(r => parseInt(r.value, 10) === idx);
      if (radio) radio.checked = true;
      setActiveLayer(idx);
    });
  }

  // =========================
  // History per layer
  // =========================
  function saveStateLayer(layerIndex = activeLayer) {
    const L = layers[layerIndex];
    L.redo = [];
    try {
      L.undo.push(L.ctx.getImageData(0, 0, W(), H()));
      if (L.undo.length > MAX_HISTORY) L.undo.shift();
    } catch {}
  }

  function undoLayer() {
    const L = active();
    if (!L.undo.length) return;
    try {
      L.redo.push(L.ctx.getImageData(0, 0, W(), H()));
      const prev = L.undo.pop();
      L.ctx.putImageData(prev, 0, 0);
      clearOverlayUI();
    } catch {}
  }

  function redoLayer() {
    const L = active();
    if (!L.redo.length) return;
    try {
      L.undo.push(L.ctx.getImageData(0, 0, W(), H()));
      const next = L.redo.pop();
      L.ctx.putImageData(next, 0, 0);
      clearOverlayUI();
    } catch {}
  }

  // =========================
  // Overlay helpers (ACTIVE layer)
  // =========================
  function clearOverlayUI() {
    overlayObj = null;
    baseImageData = null;
    updateTransformBox();
    hideSelection();
    resetLasso();
    if (cropOverlay) cropOverlay.style.display = 'none';
  }

  function renderOverlay() {
    if (!overlayObj || !baseImageData) return;
    const ctxA = active().ctx;
    ctxA.putImageData(baseImageData, 0, 0);

    ctxA.save();
    ctxA.translate(overlayObj.x, overlayObj.y);
    ctxA.rotate(overlayObj.angle || 0);
    ctxA.drawImage(overlayObj.img, 0, 0, overlayObj.w, overlayObj.h);
    ctxA.restore();
  }

  function commitOverlay() {
    if (!overlayObj || !baseImageData) return;
    saveStateLayer(activeLayer);
    renderOverlay();
    baseImageData = active().ctx.getImageData(0, 0, W(), H());
    overlayObj = null;
    updateTransformBox();
  }

  function flattenOverlayIfAny() {
    if (!overlayObj || !baseImageData) return;
    renderOverlay();
    baseImageData = active().ctx.getImageData(0, 0, W(), H());
    overlayObj = null;
    updateTransformBox();
  }

  // =========================
  // Selection overlay
  // =========================
  function showSelection(x, y, w, h) {
    selectionOverlay.style.display = 'block';
    Object.assign(selectionOverlay.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
  }
  function hideSelection() { selectionOverlay.style.display = 'none'; }

  // =========================
  // Lasso overlay + path helpers
  // =========================
  lassoOverlay.width = W(); lassoOverlay.height = H();

  function clearLassoOverlay() {
    lassoCtx.clearRect(0, 0, lassoOverlay.width, lassoOverlay.height);
  }

  function drawLassoOverlay(points) {
    clearLassoOverlay();
    if (!points.length) return;
    lassoCtx.save();
    lassoCtx.strokeStyle = '#22c55e';
    lassoCtx.fillStyle = 'rgba(34, 197, 94, 0.12)';
    lassoCtx.lineWidth = 1.5;
    lassoCtx.setLineDash([6, 4]);
    lassoCtx.beginPath();
    points.forEach((p, i) => i === 0 ? lassoCtx.moveTo(p.x, p.y) : lassoCtx.lineTo(p.x, p.y));
    if (points.length > 2) lassoCtx.closePath();
    lassoCtx.stroke();
    if (points.length > 2) lassoCtx.fill();
    lassoCtx.restore();
  }

  function resetLasso() {
    isLassoing = false;
    lassoPoints = [];
    clearLassoOverlay();
  }

  function buildPathFromPoints(ctx, points) {
    ctx.beginPath();
    points.forEach((pt, i) => i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y));
    ctx.closePath();
  }

  // =========================
  // Transform box
  // =========================
  function updateTransformBox() {
    if (!overlayObj || currentTool !== 'transform') {
      transformBox.style.display = 'none';
      return;
    }
    transformBox.style.display = 'block';
    transformBox.style.width = overlayObj.w + 'px';
    transformBox.style.height = overlayObj.h + 'px';
    transformBox.style.transform = `translate(${overlayObj.x}px, ${overlayObj.y}px) rotate(${overlayObj.angle || 0}rad)`;
  }

  // =========================
  // Shapes helpers
  // =========================
  function drawStar(ctx, cx, cy, spikes, outerRadius, innerRadius) {
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

  function drawHeart(ctx, cx, cy, size) {
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

  // =========================
  // Brushes (improved variety)
  // =========================
  function jitter(n) { return (Math.random() - 0.5) * n; }

  const brushFunctions = {
    round(ctx, x, y, size, color, opacity) {
      ctx.strokeStyle = hexToRgba(color, opacity);
      ctx.lineWidth = size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineTo(x, y); ctx.stroke();
    },

    // stamp square
    square(ctx, x, y, size, color, opacity) {
      ctx.fillStyle = hexToRgba(color, opacity);
      ctx.fillRect(x - size / 2, y - size / 2, size, size);
    },

    dotted(ctx, x, y, size, color, opacity) {
      ctx.fillStyle = hexToRgba(color, opacity);
      ctx.beginPath(); ctx.arc(x, y, size / 2, 0, Math.PI * 2); ctx.fill();
    },

    spray(ctx, x, y, size, color, opacity) {
      ctx.fillStyle = hexToRgba(color, opacity);
      const count = 40;
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * size * 1.2;
        ctx.fillRect(x + Math.cos(a) * r, y + Math.sin(a) * r, 1, 1);
      }
    },

    calligraphy(ctx, x, y, size, color, opacity) {
      // angled pen look
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-Math.PI / 6);
      ctx.fillStyle = hexToRgba(color, opacity);
      ctx.fillRect(-size * 0.6, -size * 0.15, size * 1.2, size * 0.3);
      ctx.restore();
    },

    splatter(ctx, x, y, size, color, opacity) {
      ctx.fillStyle = hexToRgba(color, opacity);
      const blobs = 16;
      for (let i = 0; i < blobs; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * size * 1.8;
        const rad = Math.max(1, (Math.random() * size) / 6);
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    },

    watercolor(ctx, x, y, size, color, opacity) {
      // softer edge + multi-pass
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = hexToRgba(color, opacity * 0.45);
      ctx.lineWidth = size * 1.2;
      ctx.lineTo(x + jitter(0.7), y + jitter(0.7));
      ctx.stroke();

      ctx.strokeStyle = hexToRgba(color, opacity * 0.25);
      ctx.lineWidth = size * 1.8;
      ctx.lineTo(x + jitter(1.0), y + jitter(1.0));
      ctx.stroke();
      ctx.restore();
    },

    chalk(ctx, x, y, size, color, opacity) {
      // dusty stamps
      ctx.save();
      const count = 10;
      for (let i = 0; i < count; i++) {
        ctx.fillStyle = hexToRgba(color, opacity * (0.25 + Math.random() * 0.25));
        ctx.beginPath();
        ctx.arc(x + jitter(size), y + jitter(size), Math.max(0.8, size / 5), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },

    oil(ctx, x, y, size, color, opacity) {
      // thick paint blob
      ctx.save();
      ctx.fillStyle = hexToRgba(color, opacity);
      ctx.beginPath();
      ctx.ellipse(x, y, size * 0.8, size * 0.55, Math.random(), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    },

    pencil(ctx, x, y, size, color, opacity) {
      // multiple light strokes + tiny jitter
      ctx.save();
      ctx.strokeStyle = hexToRgba(color, opacity * 0.4);
      ctx.lineWidth = Math.max(1, size / 6);
      ctx.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        ctx.lineTo(x + jitter(1.2), y + jitter(1.2));
        ctx.stroke();
      }
      ctx.restore();
    },

    neon(ctx, x, y, size, color, opacity) {
      ctx.save();
      ctx.strokeStyle = hexToRgba(color, opacity);
      ctx.shadowColor = color;
      ctx.shadowBlur = 14;
      ctx.lineWidth = size;
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.restore();
    },

    glitter(ctx, x, y, size, color, opacity) {
      ctx.save();
      const n = 14;
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = hexToRgba(color, opacity * (0.2 + Math.random() * 0.8));
        const s = 1 + Math.random() * 2;
        ctx.fillRect(x + jitter(size), y + jitter(size), s, s);
      }
      ctx.restore();
    },

    textured(ctx, x, y, size, color, opacity) {
      // rough stroke (tiny offset segments)
      ctx.save();
      ctx.strokeStyle = hexToRgba(color, opacity * 0.7);
      ctx.lineWidth = Math.max(1, size * 0.55);
      ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        ctx.lineTo(x + jitter(size * 0.15), y + jitter(size * 0.15));
        ctx.stroke();
      }
      ctx.restore();
    },

    pattern(ctx, x, y, size, color, opacity) {
      // little cluster of circles
      ctx.save();
      ctx.fillStyle = hexToRgba(color, opacity);
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc(x + jitter(size), y + jitter(size), Math.max(1, size / 6), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },

    airbrush(ctx, x, y, size, color, opacity) {
      // soft cloud
      ctx.save();
      const dots = 60;
      for (let i = 0; i < dots; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * size;
        ctx.fillStyle = hexToRgba(color, opacity * Math.random() * 0.25);
        ctx.fillRect(x + Math.cos(a) * r, y + Math.sin(a) * r, 1, 1);
      }
      ctx.restore();
    },

    star(ctx, x, y, size, color, opacity) {
      ctx.save();
      ctx.strokeStyle = hexToRgba(color, opacity);
      ctx.lineWidth = Math.max(1, size / 8);
      drawStar(ctx, x, y, 5, size * 0.9, size * 0.45);
      ctx.restore();
    },

    heart(ctx, x, y, size, color, opacity) {
      ctx.save();
      ctx.strokeStyle = hexToRgba(color, opacity);
      ctx.lineWidth = Math.max(1, size / 8);
      drawHeart(ctx, x, y, size * 0.9);
      ctx.restore();
    },

    zigzag(ctx, x, y, size, color, opacity) {
      ctx.strokeStyle = hexToRgba(color, opacity);
      ctx.lineWidth = size;
      ctx.lineTo(x + jitter(size * 0.8), y + jitter(size * 0.8));
      ctx.stroke();
    },

    scatter(ctx, x, y, size, color, opacity) {
      ctx.save();
      ctx.fillStyle = hexToRgba(color, opacity);
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.arc(x + jitter(size * 1.2), y + jitter(size * 1.2), Math.max(1, size / 6), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },

    crayon(ctx, x, y, size, color, opacity) {
      // waxy: thick + small gaps
      ctx.save();
      ctx.strokeStyle = hexToRgba(color, opacity * 0.75);
      ctx.lineWidth = size * 0.9;
      ctx.lineCap = 'butt';
      ctx.setLineDash([size * 0.6, size * 0.35]);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  };

  // =========================
  // Fill tool (tolerant + 1px edge expand)
  // =========================
  function floodFill(startX, startY, fillColor) {
    const ctxA = active().ctx;
    const width = W(), height = H();
    const imageData = ctxA.getImageData(0, 0, width, height);
    const data = imageData.data;

    const TOL = 28;
    const TOL_EDGE = 45;
    const EDGE_EXPAND = 1;

    const startPos = (startY * width + startX) * 4;
    const target = [data[startPos], data[startPos + 1], data[startPos + 2], data[startPos + 3]];
    const fill = hexToRgbaArray(fillColor, parseFloat(opacityInput.value || '100'));

    const distSq = (a, b) => {
      const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2], da = a[3] - b[3];
      return dr * dr + dg * dg + db * db + da * da;
    };

    if (distSq(target, fill) <= 1) return;

    const tolSq = TOL * TOL;
    const tolEdgeSq = TOL_EDGE * TOL_EDGE;

    const visited = new Uint8Array(width * height);
    const stack = [startX + startY * width];

    const matchTol = (i, tol) => {
      const dr = data[i] - target[0];
      const dg = data[i + 1] - target[1];
      const db = data[i + 2] - target[2];
      const da = data[i + 3] - target[3];
      return (dr * dr + dg * dg + db * db + da * da) <= tol;
    };

    const setPixel = (i) => {
      data[i] = fill[0]; data[i + 1] = fill[1]; data[i + 2] = fill[2]; data[i + 3] = fill[3];
    };

    while (stack.length) {
      const idx = stack.pop();
      if (visited[idx]) continue;
      visited[idx] = 1;

      const x = idx % width;
      const y = (idx / width) | 0;
      const i = idx * 4;

      if (!matchTol(i, tolSq)) continue;

      setPixel(i);

      if (x > 0) stack.push(idx - 1);
      if (x < width - 1) stack.push(idx + 1);
      if (y > 0) stack.push(idx - width);
      if (y < height - 1) stack.push(idx + width);
    }

    // 1px edge expand to reduce tiny gaps near outline
    for (let pass = 0; pass < EDGE_EXPAND; pass++) {
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const idx = x + y * width;
          const i = idx * 4;

          if (data[i] === fill[0] && data[i + 1] === fill[1] && data[i + 2] === fill[2] && data[i + 3] === fill[3]) continue;
          if (!matchTol(i, tolEdgeSq)) continue;

          const n = [
            (idx - 1) * 4, (idx + 1) * 4, (idx - width) * 4, (idx + width) * 4,
            (idx - width - 1) * 4, (idx - width + 1) * 4, (idx + width - 1) * 4, (idx + width + 1) * 4
          ];
          let neighborFill = false;
          for (const j of n) {
            if (data[j] === fill[0] && data[j + 1] === fill[1] && data[j + 2] === fill[2] && data[j + 3] === fill[3]) {
              neighborFill = true; break;
            }
          }
          if (neighborFill) setPixel(i);
        }
      }
    }

    ctxA.putImageData(imageData, 0, 0);
  }

  // =========================
  // Color pickers (wheel/square/spectrum)
  // =========================
  function hsvToRgb(h, s, v) {
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    return [
      Math.round((r + m) * 255),
      Math.round((g + m) * 255),
      Math.round((b + m) * 255),
    ];
  }

  function rgbToHex(r, g, b) {
    const to = (n) => n.toString(16).padStart(2, '0');
    return `#${to(r)}${to(g)}${to(b)}`;
  }

  function drawPicker(type) {
    pickerCtx.clearRect(0, 0, colorPickerCanvas.width, colorPickerCanvas.height);
    const w = colorPickerCanvas.width;
    const h = colorPickerCanvas.height;

    if (type === 'wheel') {
      const cx = w / 2, cy = h / 2;
      const r = Math.min(cx, cy) - 2;
      const img = pickerCtx.createImageData(w, h);
      const d = img.data;

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const dx = x - cx, dy = y - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const i = (y * w + x) * 4;

          if (dist > r) { d[i + 3] = 0; continue; }

          const ang = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
          const sat = clamp(dist / r, 0, 1);
          const val = 1;

          const [rr, gg, bb] = hsvToRgb(ang, sat, val);
          d[i] = rr; d[i + 1] = gg; d[i + 2] = bb; d[i + 3] = 255;
        }
      }
      pickerCtx.putImageData(img, 0, 0);
      return;
    }

    if (type === 'spectrum') {
      const grad = pickerCtx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, '#ff0000');
      grad.addColorStop(1/6, '#ffff00');
      grad.addColorStop(2/6, '#00ff00');
      grad.addColorStop(3/6, '#00ffff');
      grad.addColorStop(4/6, '#0000ff');
      grad.addColorStop(5/6, '#ff00ff');
      grad.addColorStop(1, '#ff0000');
      pickerCtx.fillStyle = grad;
      pickerCtx.fillRect(0, 0, w, h);

      const white = pickerCtx.createLinearGradient(0, 0, 0, h);
      white.addColorStop(0, 'rgba(255,255,255,0)');
      white.addColorStop(1, 'rgba(255,255,255,0.65)');
      pickerCtx.fillStyle = white;
      pickerCtx.fillRect(0, 0, w, h);

      const black = pickerCtx.createLinearGradient(0, 0, 0, h);
      black.addColorStop(0, 'rgba(0,0,0,0.0)');
      black.addColorStop(1, 'rgba(0,0,0,0.55)');
      pickerCtx.fillStyle = black;
      pickerCtx.fillRect(0, 0, w, h);
      return;
    }

    // square
    const img = pickerCtx.createImageData(w, h);
    const d = img.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const hue = (x / (w - 1)) * 360;
        const sat = 1;
        const val = 1 - (y / (h - 1));
        const [rr, gg, bb] = hsvToRgb(hue, sat, val);
        const i = (y * w + x) * 4;
        d[i] = rr; d[i + 1] = gg; d[i + 2] = bb; d[i + 3] = 255;
      }
    }
    pickerCtx.putImageData(img, 0, 0);
  }

  function pickColorFromPicker(evt) {
    const r = colorPickerCanvas.getBoundingClientRect();
    const x = Math.floor(evt.clientX - r.left);
    const y = Math.floor(evt.clientY - r.top);
    const px = pickerCtx.getImageData(x, y, 1, 1).data;
    if (px[3] === 0) return;
    const hex = rgbToHex(px[0], px[1], px[2]);
    brushColorInput.value = hex;
    addRecentColor(hex);
  }

  pickerType.addEventListener('change', () => {
    const t = pickerType.value;
    colorPickerBox.style.display = (t === 'none') ? 'none' : 'inline-flex';
    if (t !== 'none') drawPicker(t);
  });

  colorPickerCanvas.addEventListener('mousedown', pickColorFromPicker);

  // =========================
  // Recent colors
  // =========================
  let recentColors = [];
  function addRecentColor(color) {
    if (recentColors.includes(color)) return;
    recentColors.push(color);
    const swatch = document.createElement('div');
    swatch.className = 'color-swatch';
    swatch.style.backgroundColor = color;
    swatch.onclick = () => { brushColorInput.value = color; };
    document.getElementById('recentColors').appendChild(swatch);
  }
  brushColorInput.addEventListener('change', () => addRecentColor(brushColorInput.value));

  // =========================
  // Background selector
  // =========================
  backgroundPatternSelect.addEventListener('change', () => {
    const pattern = backgroundPatternSelect.value;
    canvasContainer.className = 'canvas-container ' + pattern;
  });

  // =========================
  // Buttons
  // =========================
  undoCanvasButton.addEventListener('click', undoLayer);
  redoCanvasButton.addEventListener('click', redoLayer);

  // Clear ACTIVE layer (undoable)
  clearCanvasButton.addEventListener('click', () => {
    commitOverlay();
    saveStateLayer(activeLayer);
    const ctxA = active().ctx;
    ctxA.setTransform(1, 0, 0, 1, 0, 0);
    ctxA.globalCompositeOperation = 'source-over';
    ctxA.clearRect(0, 0, W(), H());
    clearOverlayUI();
  });

  // Flip ACTIVE layer
  function flipActiveLayerHorizontal() {
    commitOverlay();
    saveStateLayer(activeLayer);
    const ctxA = active().ctx;

    const off = document.createElement('canvas');
    off.width = W();
    off.height = H();
    off.getContext('2d').drawImage(active().canvas, 0, 0);

    ctxA.save();
    ctxA.setTransform(-1, 0, 0, 1, W(), 0);
    ctxA.clearRect(0, 0, W(), H());
    ctxA.drawImage(off, 0, 0);
    ctxA.restore();
  }
  flipCanvasButton.addEventListener('click', flipActiveLayerHorizontal);

  // =========================
  // Image insertion -> overlay on active layer
  // =========================
  addImageButton.addEventListener('click', () => addImageInput.click());
  addImageInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        commitOverlay();
        saveStateLayer(activeLayer);

        baseImageData = active().ctx.getImageData(0, 0, W(), H());

        const scale = Math.min(W() / img.width, H() / img.height, 1);
        const w = Math.floor(img.width * scale);
        const h = Math.floor(img.height * scale);
        const x = Math.floor((W() - w) / 2);
        const y = Math.floor((H() - h) / 2);

        overlayObj = { img, x, y, w, h, angle: 0 };
        toolSelect.value = 'transform';
        currentTool = 'transform';
        updateTransformBox();
        renderOverlay();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
    addImageInput.value = '';
  });

  // =========================
  // Tool switching
  // =========================
  toolSelect.addEventListener('change', () => {
    const nextTool = toolSelect.value;

    shapeOptionsDiv.style.display = (nextTool === 'shape') ? 'inline-block' : 'none';

    if (currentTool === 'transform' && nextTool !== 'transform' && nextTool !== 'cropImage') {
      commitOverlay();
    }

    currentTool = nextTool;

    if (currentTool !== 'select') hideSelection();
    if (currentTool !== 'lasso') resetLasso();

    if (currentTool === 'transform') {
      if (!baseImageData) baseImageData = active().ctx.getImageData(0, 0, W(), H());
      updateTransformBox();
      renderOverlay();
    } else {
      updateTransformBox();
    }
  });

  brushTypeSelect.addEventListener('change', () => { currentBrush = brushTypeSelect.value; });

  brushSizeInput.addEventListener('input', () => { brushSizeValue.textContent = brushSizeInput.value; });
  opacityInput.addEventListener('input', () => { opacityValue.textContent = opacityInput.value; });

  // =========================
  // Drawing events
  // =========================
  canvasContainer.addEventListener('mousedown', (e) => {
    if (currentTool === 'transform') return;

    const p = canvasPoint(e);
    const ctxA = active().ctx;

    // reset stamp spacing start
    lastStampX = p.x;
    lastStampY = p.y;

    if (currentTool === 'fill') {
      commitOverlay();
      saveStateLayer(activeLayer);
      floodFill(Math.floor(p.x), Math.floor(p.y), brushColorInput.value);
      return;
    }

    if (currentTool === 'text') {
      flattenOverlayIfAny();
      const text = prompt('Enter text (Use \\n for new lines):', 'Text');
      if (!text) return;

      saveStateLayer(activeLayer);

      const size = Math.max(6, parseInt(brushSizeInput.value, 10) || 24);
      const opacity = clamp(parseFloat(opacityInput.value) || 100, 0, 100);
      const color = brushColorInput.value;

      ctxA.save();
      ctxA.fillStyle = hexToRgba(color, opacity);
      ctxA.textBaseline = 'top';
      ctxA.font = `${size}px Arial`;
      const lines = String(text).split('\n');
      const lh = Math.round(size * 1.2);
      lines.forEach((line, i) => ctxA.fillText(line, p.x, p.y + i * lh));
      ctxA.restore();
      return;
    }

    if (currentTool === 'shape') {
      commitOverlay();
      shapeActive = true;
      shapeStart = p;
      savedImageData = ctxA.getImageData(0, 0, W(), H());
      saveStateLayer(activeLayer);
      return;
    }

    if (currentTool === 'select') {
      commitOverlay();
      isSelecting = true;
      selectStart = p;
      selectRect = null;
      hideSelection();
      resetLasso();
      return;
    }

    if (currentTool === 'lasso') {
      commitOverlay();
      isLassoing = true;
      lassoPoints = [p];
      hideSelection();
      drawLassoOverlay(lassoPoints);
      return;
    }

    if (currentTool === 'cropImage') {
      if (!overlayObj) return;
      if (Math.abs(overlayObj.angle || 0) > 0.0001) {
        alert('Crop supports only non-rotated overlays. Set rotation to 0 first.');
        return;
      }
      isCropping = true;
      cropStart = p;
      cropRect = null;
      return;
    }

    // pen/eraser
    if (currentTool === 'pen' || currentTool === 'eraser') {
      commitOverlay();
      saveStateLayer(activeLayer);

      isDrawing = true;
      lastX = p.x; lastY = p.y;

      ctxA.beginPath();
      ctxA.moveTo(lastX, lastY);

      // if it's a stamp brush, do an initial stamp immediately
      const size = parseInt(brushSizeInput.value, 10);
      const opacity = parseFloat(opacityInput.value);
      const color = brushColorInput.value;
      ctxA.globalCompositeOperation = (currentTool === 'eraser') ? 'destination-out' : 'source-over';

      if (stampBrushes.has(currentBrush) && currentTool !== 'eraser') {
        brushFunctions[currentBrush](ctxA, p.x, p.y, size, color, opacity);
      }
    }
  });

  canvasContainer.addEventListener('mousemove', (e) => {
    const p = canvasPoint(e);
    const ctxA = active().ctx;

    if (currentTool === 'shape' && shapeActive && savedImageData) {
      ctxA.putImageData(savedImageData, 0, 0);
      ctxA.strokeStyle = hexToRgba(brushColorInput.value, opacityInput.value);
      ctxA.lineWidth = parseInt(brushSizeInput.value, 10);

      const shape = shapeTypeSelect.value;
      const w = p.x - shapeStart.x, h = p.y - shapeStart.y;

      if (shape === 'line' || shape === 'dottedLine') {
        ctxA.beginPath(); ctxA.moveTo(shapeStart.x, shapeStart.y);
        if (shape === 'dottedLine') ctxA.setLineDash([2, 6]);
        ctxA.lineTo(p.x, p.y); ctxA.stroke(); ctxA.setLineDash([]);
      } else if (shape === 'rectangle' || shape === 'dottedRectangle') {
        if (shape === 'dottedRectangle') ctxA.setLineDash([2, 6]);
        ctxA.strokeRect(shapeStart.x, shapeStart.y, w, h);
        ctxA.setLineDash([]);
      } else if (shape === 'circle') {
        const r = Math.sqrt(w*w + h*h);
        ctxA.beginPath(); ctxA.arc(shapeStart.x, shapeStart.y, r, 0, Math.PI*2); ctxA.stroke();
      } else if (shape === 'ellipse' || shape === 'oval') {
        ctxA.beginPath();
        ctxA.ellipse(shapeStart.x + w/2, shapeStart.y + h/2, Math.abs(w/2), Math.abs(h/2), 0, 0, Math.PI*2);
        ctxA.stroke();
      } else if (shape === 'star') {
        const r = Math.max(Math.abs(w), Math.abs(h));
        drawStar(ctxA, shapeStart.x, shapeStart.y, 5, r, r/2);
      } else if (shape === 'heart') {
        drawHeart(ctxA, shapeStart.x, shapeStart.y, Math.max(Math.abs(w), Math.abs(h)));
      }
      return;
    }

    if (currentTool === 'select' && isSelecting) {
      const x1 = Math.min(selectStart.x, p.x);
      const y1 = Math.min(selectStart.y, p.y);
      const w = Math.abs(p.x - selectStart.x);
      const h = Math.abs(p.y - selectStart.y);
      selectRect = { x: x1, y: y1, w, h };
      showSelection(x1, y1, w, h);
      return;
    }

    if (currentTool === 'lasso' && isLassoing) {
      const last = lassoPoints[lassoPoints.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) > 1) {
        lassoPoints.push(p);
        drawLassoOverlay(lassoPoints);
      }
      return;
    }

    if (currentTool === 'cropImage' && isCropping) {
      const x1 = Math.min(cropStart.x, p.x);
      const y1 = Math.min(cropStart.y, p.y);
      const w = Math.abs(p.x - cropStart.x);
      const h = Math.abs(p.y - cropStart.y);
      cropRect = { x: x1, y: y1, w, h };
      Object.assign(cropOverlay.style, {
        left: x1 + 'px', top: y1 + 'px', width: w + 'px', height: h + 'px', display: 'block'
      });
      return;
    }

    if (!isDrawing) return;
    if (!(currentTool === 'pen' || currentTool === 'eraser')) return;

    const size = parseInt(brushSizeInput.value, 10);
    const opacity = parseFloat(opacityInput.value);
    const color = brushColorInput.value;

    ctxA.globalCompositeOperation = (currentTool === 'eraser') ? 'destination-out' : 'source-over';

    const drawOne = (x0, y0, x1, y1) => {
      if (stampBrushes.has(currentBrush) && currentTool !== 'eraser') {
        // spacing for stamp brushes
        const sp = stampSpacingPx(currentBrush, size);
        const d = Math.hypot(x1 - lastStampX, y1 - lastStampY);
        if (d < sp) return;

        lastStampX = x1;
        lastStampY = y1;
        brushFunctions[currentBrush](ctxA, x1, y1, size, color, opacity);
        return;
      }

      // continuous stroke brushes
      ctxA.beginPath();
      ctxA.moveTo(x0, y0);
      brushFunctions[currentBrush](ctxA, x1, y1, size, color, opacity);
    };

    if (symmetryCheckbox.checked) {
      drawOne(lastX, lastY, p.x, p.y);
      drawOne(W() - lastX, lastY, W() - p.x, p.y);
    } else {
      drawOne(lastX, lastY, p.x, p.y);
    }

    lastX = p.x; lastY = p.y;
  });

  canvasContainer.addEventListener('mouseup', () => {
    isDrawing = false;

    if (currentTool === 'shape') shapeActive = false;

    if (currentTool === 'select') {
      if (!isSelecting || !selectRect) return;
      isSelecting = false;
      hideSelection();

      if (selectRect.w < 1 || selectRect.h < 1) return;

      const ctxA = active().ctx;
      const off = document.createElement('canvas');
      off.width = Math.round(selectRect.w);
      off.height = Math.round(selectRect.h);
      const offCtx = off.getContext('2d');
      offCtx.drawImage(active().canvas, selectRect.x, selectRect.y, selectRect.w, selectRect.h, 0, 0, off.width, off.height);

      const img = new Image();
      img.onload = () => {
        saveStateLayer(activeLayer);
        ctxA.clearRect(selectRect.x, selectRect.y, selectRect.w, selectRect.h);
        baseImageData = ctxA.getImageData(0, 0, W(), H());
        overlayObj = { img, x: selectRect.x, y: selectRect.y, w: selectRect.w, h: selectRect.h, angle: 0 };
        toolSelect.value = 'transform';
        currentTool = 'transform';
        updateTransformBox();
        renderOverlay();
        selectRect = null;
      };
      img.src = off.toDataURL('image/png');
      return;
    }

    // ✅ FIXED LASSO (no duplication)
    if (currentTool === 'lasso') {
      if (!isLassoing) return;
      isLassoing = false;

      if (lassoPoints.length < 3) { resetLasso(); return; }

      const ctxA = active().ctx;

      // bounds
      const xs = lassoPoints.map(p => p.x);
      const ys = lassoPoints.map(p => p.y);
      const bounds = {
        x: Math.min(...xs),
        y: Math.min(...ys),
        w: Math.max(1, Math.round(Math.max(...xs) - Math.min(...xs))),
        h: Math.max(1, Math.round(Math.max(...ys) - Math.min(...ys)))
      };

      // extract into off-canvas using clip
      const off = document.createElement('canvas');
      off.width = bounds.w; off.height = bounds.h;
      const offCtx = off.getContext('2d');

      offCtx.save();
      offCtx.translate(-bounds.x, -bounds.y);
      buildPathFromPoints(offCtx, lassoPoints);
      offCtx.clip();
      offCtx.drawImage(active().canvas, 0, 0);
      offCtx.restore();

      const img = new Image();
      img.onload = () => {
        // history snapshot BEFORE erasing
        saveStateLayer(activeLayer);

        // ERASE ORIGINAL AREA using destination-out (reliable)
        ctxA.save();
        ctxA.globalCompositeOperation = 'destination-out';
        ctxA.fillStyle = 'rgba(0,0,0,1)';
        buildPathFromPoints(ctxA, lassoPoints);
        ctxA.fill();
        ctxA.restore();

        // now base snapshot is without the selected pixels
        baseImageData = ctxA.getImageData(0, 0, W(), H());

        overlayObj = { img, x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h, angle: 0 };

        toolSelect.value = 'transform';
        currentTool = 'transform';
        updateTransformBox();
        renderOverlay();
      };
      img.src = off.toDataURL('image/png');

      resetLasso();
      return;
    }

    if (currentTool === 'cropImage') {
      if (!isCropping || !overlayObj || !cropRect) return;
      isCropping = false;
      cropOverlay.style.display = 'none';

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
        saveStateLayer(activeLayer);
        overlayObj.img = croppedImg;
        overlayObj.x = ix1;
        overlayObj.y = iy1;
        overlayObj.w = iw;
        overlayObj.h = ih;
        overlayObj.angle = 0;
        if (!baseImageData) baseImageData = active().ctx.getImageData(0, 0, W(), H());
        updateTransformBox();
        renderOverlay();
      };
      croppedImg.src = off.toDataURL('image/png');
      cropRect = null;
      return;
    }
  });

  canvasContainer.addEventListener('mouseleave', () => {
    isDrawing = false;
  });

  // =========================
  // Transform interactions (overlay)
  // =========================
  transformBox.addEventListener('pointerdown', (e) => {
    if (!overlayObj || currentTool !== 'transform') return;
    transformBox.setPointerCapture(e.pointerId);

    if (!baseImageData) baseImageData = active().ctx.getImageData(0, 0, W(), H());

    const t = e.target;
    const isRotate = t.dataset.rotate === 'true';
    const handle = t.dataset.handle || null;

    transformMode = isRotate ? 'rotate' : (handle ? 'resize' : 'move');
    activeHandle = handle;

    startMouse = canvasPoint(e);
    startState = { x: overlayObj.x, y: overlayObj.y, w: overlayObj.w, h: overlayObj.h, angle: overlayObj.angle || 0 };

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

      const map = {
        nw: [true,true,false,false], n: [false,true,false,false], ne: [false,true,true,false],
        e: [false,false,true,false], se: [false,false,true,true], s: [false,false,false,true],
        sw: [true,false,false,true], w: [true,false,false,false]
      };
      const [left, top, right, bottom] = map[activeHandle] || [false,false,false,false];

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

      overlayObj.x = x; overlayObj.y = y; overlayObj.w = w; overlayObj.h = h;
    } else if (transformMode === 'rotate') {
      const cx = startState.x + startState.w / 2;
      const cy = startState.y + startState.h / 2;
      const a0 = Math.atan2(startMouse.y - cy, startMouse.x - cx);
      const a1 = Math.atan2(p.y - cy, p.x - cx);
      overlayObj.angle = startState.angle + (a1 - a0);
    }

    updateTransformBox();
    renderOverlay();
  });

  transformBox.addEventListener('pointerup', (e) => {
    if (!transformMode) return;
    transformBox.releasePointerCapture(e.pointerId);
    transformMode = null;
    activeHandle = null;
  });

  transformBox.addEventListener('dblclick', () => {
    commitOverlay();
  });

  // =========================
  // Download (merge layers)
  // =========================
  function getExportBackgroundFill(format) {
    if (format === 'png-transparent') return null;

    const selectedPattern = backgroundPatternSelect ? backgroundPatternSelect.value : 'plain';
    if (selectedPattern === 'dark') return '#000000';
    if (selectedPattern === 'plain') return '#ffffff';

    const computedColor = getComputedStyle(canvasContainer).backgroundColor;
    if (computedColor && computedColor !== 'rgba(0, 0, 0, 0)' && computedColor !== 'transparent') return computedColor;
    return '#ffffff';
  }

  function buildExportCanvas(fillColor) {
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = W();
    exportCanvas.height = H();
    const exportCtx = exportCanvas.getContext('2d');

    if (fillColor) {
      exportCtx.fillStyle = fillColor;
      exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    }

    for (let i = 0; i < 3; i++) {
      if (!layers[i].enabled || !layers[i].visible) continue;
      exportCtx.drawImage(layers[i].canvas, 0, 0);
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

  downloadCanvasButton.addEventListener('click', () => {
    const format = downloadFormatSelect.value;
    const a = document.createElement('a');
    a.download = getDownloadFilename(format);
    a.href = getDownloadDataUrl(format);
    a.click();
  });

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

    if (key === 'z' && !e.shiftKey) {
      if (!isTypingTarget) { prevent(); undoLayer(); }
      return;
    }
    if (key === 'y' || (key === 'z' && e.shiftKey)) {
      if (!isTypingTarget) { prevent(); redoLayer(); }
      return;
    }
    if (key === 's') {
      if (!isTypingTarget) { prevent(); downloadCanvasButton.click(); }
      return;
    }
    if (key === 'enter') {
      if (!isTypingTarget && currentTool === 'transform' && overlayObj) { prevent(); commitOverlay(); }
      return;
    }
    if (key === 'escape') {
      prevent();
      isSelecting = false;
      isCropping = false;
      hideSelection();
      resetLasso();
      transformMode = null;
      activeHandle = null;
      cropOverlay.style.display = 'none';
      return;
    }
  });

  // =========================
  // Init
  // =========================
  shapeOptionsDiv.style.display = (currentTool === 'shape') ? 'inline-block' : 'none';
  updateTransformBox();
});

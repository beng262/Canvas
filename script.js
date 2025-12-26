document.addEventListener('DOMContentLoaded', () => {
  // =========================
  // Init: DOM + Layer Canvases
  // =========================
  const layerCanvases = [
    document.getElementById('layerCanvas0'),
    document.getElementById('layerCanvas1'),
    document.getElementById('layerCanvas2')
  ];

  const layers = layerCanvases.map((c, i) => ({
    canvas: c,
    ctx: c.getContext('2d', { willReadFrequently: true }),
    enabled: i === 0,
    visible: true,
    undo: [],
    redo: [],
    index: i
  }));

  const MAX_HISTORY = 50;
  let activeLayer = 0;

  function W() { return layers[0].canvas.width; }
  function H() { return layers[0].canvas.height; }
  function active() { return layers[activeLayer]; }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  // =========================
  // Init: UI Elements
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

  // Layers UI
  const addLayerBtn = document.getElementById('addLayerBtn');
  const layerRows = [
    document.getElementById('layerRow0'),
    document.getElementById('layerRow1'),
    document.getElementById('layerRow2')
  ];
  const layerRadios = Array.from(document.querySelectorAll('input[name="activeLayer"]'));
  const layerVis = [
    document.getElementById('layerVis0'),
    document.getElementById('layerVis1'),
    document.getElementById('layerVis2')
  ];
  const deleteLayer1Btn = document.getElementById('deleteLayer1');
  const deleteLayer2Btn = document.getElementById('deleteLayer2');

  // Overlays
  const selectionOverlay = document.getElementById('selectionOverlay');
  const lassoOverlay = document.getElementById('lassoOverlay');
  const lassoCtx = lassoOverlay.getContext('2d', { willReadFrequently: true });
  const cropOverlay = document.getElementById('cropOverlay');
  const transformBox = document.getElementById('transformBox');

  // Picker (optional)
  const pickerType = document.getElementById('pickerType');
  const colorPickerBox = document.getElementById('colorPickerBox');
  const colorPickerCanvas = document.getElementById('colorPickerCanvas');
  const pickerCtx = colorPickerCanvas ? colorPickerCanvas.getContext('2d', { willReadFrequently: true }) : null;

  // =========================
  // Init: Symmetry guide overlay
  // =========================
  const symmetryGuide = document.createElement('div');
  symmetryGuide.id = 'symmetryGuide';
  symmetryGuide.className = 'symmetry-guide';
  symmetryGuide.style.display = 'none';
  canvasContainer.appendChild(symmetryGuide);

  function syncSymmetryGuide() {
    symmetryGuide.style.display = symmetryCheckbox.checked ? 'block' : 'none';
  }
  symmetryCheckbox.addEventListener('change', syncSymmetryGuide);
  syncSymmetryGuide();

  // =========================
  // Init: Tool State
  // =========================
  let currentTool = toolSelect.value;
  let currentBrush = brushTypeSelect.value;

  let isDrawing = false;
  let lastX = 0, lastY = 0;

  // Stamp spacing
  let lastStampX = null, lastStampY = null;
  const stampBrushes = new Set(['square','dotted','spray','splatter','glitter','pattern','airbrush','star','heart','scatter','oil']);
  function stampSpacingPx(brush, size) {
    if (brush === 'star' || brush === 'heart') return Math.max(10, size * 1.7);
    if (brush === 'splatter') return Math.max(8, size * 1.2);
    if (brush === 'scatter' || brush === 'glitter') return Math.max(6, size * 1.0);
    if (brush === 'spray' || brush === 'airbrush') return Math.max(3, size * 0.6);
    return Math.max(4, size * 0.8);
  }
  function jitter(n) { return (Math.random() - 0.5) * n; }

  // Selection state
  let isSelecting = false;
  let selectStart = { x: 0, y: 0 };
  let selectRect = null;

  // Lasso state
  let isLassoing = false;
  let lassoPoints = [];

  // Shape state
  let shapeActive = false;
  let shapeStart = { x: 0, y: 0 };
  let savedImageData = null;

  // Overlay state (transform/crop)
  let overlayObj = null; // { img, x, y, w, h, angle }
  let baseImageData = null;

  // Transform drag state
  let transformMode = null; // move | resize | rotate
  let activeHandle = null;
  let startMouse = { x: 0, y: 0 };
  let startState = null;

  // Crop state
  let isCropping = false;
  let cropStart = { x: 0, y: 0 };
  let cropRect = null;

  // =========================
  // Init: App-level undo for layer add/delete
  // =========================
  let actionUndo = [];
  let actionRedo = [];

  function pushAction(act) {
    actionRedo = [];
    actionUndo.push(act);
    if (actionUndo.length > MAX_HISTORY) actionUndo.shift();
  }

  function undoAction() {
    const act = actionUndo.pop();
    if (!act) return false;
    actionRedo.push(act);

    if (act.type === 'addLayer') {
      const i = act.layerIndex;
      layers[i].enabled = false;
      layers[i].visible = false;
      layers[i].canvas.style.display = 'none';
      layerRows[i].classList.add('layer-hidden');
      if (layerVis[i]) layerVis[i].checked = false;
      if (activeLayer === i) setActiveLayer(0);
      return true;
    }

    if (act.type === 'deleteLayer') {
      const i = act.layerIndex;
      layers[i].enabled = true;
      layers[i].visible = act.prevVisible;
      layerRows[i].classList.remove('layer-hidden');
      layers[i].canvas.style.display = layers[i].visible ? 'block' : 'none';
      if (layerVis[i]) layerVis[i].checked = layers[i].visible;

      if (act.imageData) layers[i].ctx.putImageData(act.imageData, 0, 0);

      const radio = layerRadios.find(r => parseInt(r.value, 10) === i);
      if (radio) radio.checked = true;
      setActiveLayer(i);
      return true;
    }

    return false;
  }

  function redoAction() {
    const act = actionRedo.pop();
    if (!act) return false;
    actionUndo.push(act);

    if (act.type === 'addLayer') {
      const i = act.layerIndex;
      enableLayer(i);
      const radio = layerRadios.find(r => parseInt(r.value, 10) === i);
      if (radio) radio.checked = true;
      setActiveLayer(i);
      return true;
    }

    if (act.type === 'deleteLayer') {
      deleteLayer(act.layerIndex, true);
      return true;
    }

    return false;
  }

  // =========================
  // Init: Theme
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
  // Init: Canvas stacking
  // =========================
  layers.forEach((L) => {
    L.canvas.style.zIndex = String(10 + L.index);
    L.canvas.style.pointerEvents = 'none';
  });

  // Make overlays never steal input (hard safety)
  selectionOverlay.style.pointerEvents = 'none';
  cropOverlay.style.pointerEvents = 'none';
  lassoOverlay.style.pointerEvents = 'none';

  function enableLayer(i) {
    layers[i].enabled = true;
    layers[i].visible = true;
    layers[i].canvas.style.display = 'block';
    layerRows[i].classList.remove('layer-hidden');
    if (layerVis[i]) layerVis[i].checked = true;
  }

  function setLayerVisible(i, vis) {
    layers[i].visible = vis;
    layers[i].canvas.style.display = (layers[i].enabled && vis) ? 'block' : 'none';
  }

  function setActiveLayer(i) {
    if (!layers[i].enabled) return;
    commitOverlay();
    activeLayer = i;
  }

  // Hide layer 2/3 until added
  layers[1].enabled = false;
  layers[2].enabled = false;
  layers[1].canvas.style.display = 'none';
  layers[2].canvas.style.display = 'none';
  layerRows[1].classList.add('layer-hidden');
  layerRows[2].classList.add('layer-hidden');

  layerVis.forEach((cb, i) => cb.addEventListener('change', () => setLayerVisible(i, cb.checked)));
  layerRadios.forEach(r => r.addEventListener('change', () => setActiveLayer(parseInt(r.value, 10))));

  // =========================
  // Helpers: Coordinates
  // =========================
  function canvasPoint(evt) {
    const r = canvasContainer.getBoundingClientRect();
    return { x: evt.clientX - r.left, y: evt.clientY - r.top };
  }

  // =========================
  // Helpers: History (per layer)
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
    commitOverlay();
    if (undoAction()) return;

    const L = active();
    if (!L.undo.length) return;
    try {
      L.redo.push(L.ctx.getImageData(0, 0, W(), H()));
      L.ctx.putImageData(L.undo.pop(), 0, 0);
      clearOverlayUI();
    } catch {}
  }

  function redoLayer() {
    commitOverlay();
    if (redoAction()) return;

    const L = active();
    if (!L.redo.length) return;
    try {
      L.undo.push(L.ctx.getImageData(0, 0, W(), H()));
      L.ctx.putImageData(L.redo.pop(), 0, 0);
      clearOverlayUI();
    } catch {}
  }

  // =========================
  // Helpers: UI overlays
  // =========================
  function hideSelection() { selectionOverlay.style.display = 'none'; }
  function showSelection(x, y, w, h) {
    selectionOverlay.style.display = 'block';
    Object.assign(selectionOverlay.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
  }

  function clearLassoOverlay() { lassoCtx.clearRect(0, 0, lassoOverlay.width, lassoOverlay.height); }
  function resetLasso() { isLassoing = false; lassoPoints = []; clearLassoOverlay(); }

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

  function clearOverlayUI() {
    overlayObj = null;
    baseImageData = null;
    updateTransformBox();
    hideSelection();
    resetLasso();
    cropOverlay.style.display = 'none';
    isCropping = false;
    cropRect = null;
  }

  // =========================
  // Overlay rendering
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
  // Color utils
  // =========================
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
  // Brushes
  // =========================
  const brushFunctions = {
    round(ctx, x, y, size, color, opacity) {
      ctx.strokeStyle = hexToRgba(color, opacity);
      ctx.lineWidth = size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineTo(x, y);
      ctx.stroke();
    },
    square(ctx, x, y, size, color, opacity) {
      ctx.fillStyle = hexToRgba(color, opacity);
      ctx.fillRect(x - size / 2, y - size / 2, size, size);
    },
    dotted(ctx, x, y, size, color, opacity) {
      ctx.fillStyle = hexToRgba(color, opacity);
      ctx.beginPath();
      ctx.arc(x, y, size / 2, 0, Math.PI * 2);
      ctx.fill();
    },
    spray(ctx, x, y, size, color, opacity) {
      ctx.save();
      ctx.fillStyle = hexToRgba(color, opacity);
      for (let i = 0; i < 50; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * size * 1.3;
        ctx.fillRect(x + Math.cos(a) * r, y + Math.sin(a) * r, 1, 1);
      }
      ctx.restore();
    },
    calligraphy(ctx, x, y, size, color, opacity) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-Math.PI / 6);
      ctx.fillStyle = hexToRgba(color, opacity);
      ctx.fillRect(-size * 0.7, -size * 0.2, size * 1.4, size * 0.4);
      ctx.restore();
    },
    splatter(ctx, x, y, size, color, opacity) {
      ctx.save();
      ctx.fillStyle = hexToRgba(color, opacity);
      for (let i = 0; i < 18; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * size * 2.0;
        const rad = Math.max(1, (Math.random() * size) / 6);
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, rad, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },
    watercolor(ctx, x, y, size, color, opacity) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = hexToRgba(color, opacity * 0.45);
      ctx.lineWidth = size * 1.25;
      ctx.lineTo(x + jitter(0.7), y + jitter(0.7));
      ctx.stroke();
      ctx.strokeStyle = hexToRgba(color, opacity * 0.25);
      ctx.lineWidth = size * 1.9;
      ctx.lineTo(x + jitter(1.0), y + jitter(1.0));
      ctx.stroke();
      ctx.restore();
    },
    chalk(ctx, x, y, size, color, opacity) {
      ctx.save();
      for (let i = 0; i < 12; i++) {
        ctx.fillStyle = hexToRgba(color, opacity * (0.20 + Math.random() * 0.30));
        ctx.beginPath();
        ctx.arc(x + jitter(size), y + jitter(size), Math.max(0.8, size / 5), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },
    oil(ctx, x, y, size, color, opacity) {
      ctx.save();
      ctx.fillStyle = hexToRgba(color, opacity);
      ctx.beginPath();
      ctx.ellipse(x, y, size * 0.85, size * 0.55, Math.random(), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    },
    pencil(ctx, x, y, size, color, opacity) {
      ctx.save();
      ctx.strokeStyle = hexToRgba(color, opacity * 0.45);
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
      for (let i = 0; i < 14; i++) {
        ctx.fillStyle = hexToRgba(color, opacity * (0.2 + Math.random() * 0.8));
        const s = 1 + Math.random() * 2;
        ctx.fillRect(x + jitter(size), y + jitter(size), s, s);
      }
      ctx.restore();
    },
    textured(ctx, x, y, size, color, opacity) {
      ctx.save();
      ctx.strokeStyle = hexToRgba(color, opacity * 0.7);
      ctx.lineWidth = Math.max(1, size * 0.55);
      ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        ctx.lineTo(x + jitter(size * 0.18), y + jitter(size * 0.18));
        ctx.stroke();
      }
      ctx.restore();
    },
    pattern(ctx, x, y, size, color, opacity) {
      ctx.save();
      ctx.fillStyle = hexToRgba(color, opacity);
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.arc(x + jitter(size), y + jitter(size), Math.max(1, size / 6), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },
    airbrush(ctx, x, y, size, color, opacity) {
      ctx.save();
      for (let i = 0; i < 70; i++) {
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
      ctx.lineTo(x + jitter(size * 0.9), y + jitter(size * 0.9));
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
  // Fill tool (keeps your improved one if you already use it)
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
      data[i] = fill[0];
      data[i + 1] = fill[1];
      data[i + 2] = fill[2];
      data[i + 3] = fill[3];
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

    for (let pass = 0; pass < EDGE_EXPAND; pass++) {
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const idx = x + y * width;
          const i = idx * 4;

          if (data[i] === fill[0] && data[i + 1] === fill[1] && data[i + 2] === fill[2] && data[i + 3] === fill[3]) continue;
          if (!matchTol(i, tolEdgeSq)) continue;

          const neighbors = [
            (idx - 1) * 4, (idx + 1) * 4, (idx - width) * 4, (idx + width) * 4,
            (idx - width - 1) * 4, (idx - width + 1) * 4, (idx + width - 1) * 4, (idx + width + 1) * 4
          ];

          let neighborFill = false;
          for (const j of neighbors) {
            if (data[j] === fill[0] && data[j + 1] === fill[1] && data[j + 2] === fill[2] && data[j + 3] === fill[3]) {
              neighborFill = true;
              break;
            }
          }
          if (neighborFill) setPixel(i);
        }
      }
    }

    ctxA.putImageData(imageData, 0, 0);
  }

  // =========================
  // Selection -> Overlay (Rect) (FIXED by pointer-events CSS)
  // =========================
  function finalizeRectSelection() {
    if (!selectRect || selectRect.w < 1 || selectRect.h < 1) return;

    const ctxA = active().ctx;

    const off = document.createElement('canvas');
    off.width = Math.round(selectRect.w);
    off.height = Math.round(selectRect.h);
    off.getContext('2d').drawImage(
      active().canvas,
      selectRect.x, selectRect.y, selectRect.w, selectRect.h,
      0, 0, off.width, off.height
    );

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
    };
    img.src = off.toDataURL('image/png');
  }

  // =========================
  // Lasso -> Overlay
  // =========================
  function finalizeLassoSelection() {
    if (lassoPoints.length < 3) return;

    const xs = lassoPoints.map(p => p.x);
    const ys = lassoPoints.map(p => p.y);
    const bounds = {
      x: Math.floor(Math.min(...xs)),
      y: Math.floor(Math.min(...ys)),
      w: Math.max(1, Math.ceil(Math.max(...xs) - Math.min(...xs))),
      h: Math.max(1, Math.ceil(Math.max(...ys) - Math.min(...ys)))
    };

    const off = document.createElement('canvas');
    off.width = bounds.w;
    off.height = bounds.h;
    const offCtx = off.getContext('2d');

    offCtx.save();
    offCtx.beginPath();
    lassoPoints.forEach((p, i) => {
      const x = p.x - bounds.x;
      const y = p.y - bounds.y;
      if (i === 0) offCtx.moveTo(x, y);
      else offCtx.lineTo(x, y);
    });
    offCtx.closePath();
    offCtx.clip();
    offCtx.drawImage(active().canvas, -bounds.x, -bounds.y);
    offCtx.restore();

    const img = new Image();
    img.onload = () => {
      saveStateLayer(activeLayer);

      const ctxA = active().ctx;
      ctxA.save();
      ctxA.beginPath();
      lassoPoints.forEach((p, i) => i === 0 ? ctxA.moveTo(p.x, p.y) : ctxA.lineTo(p.x, p.y));
      ctxA.closePath();
      ctxA.clip();
      ctxA.clearRect(bounds.x, bounds.y, bounds.w, bounds.h);
      ctxA.restore();

      baseImageData = ctxA.getImageData(0, 0, W(), H());

      overlayObj = { img, x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h, angle: 0 };
      toolSelect.value = 'transform';
      currentTool = 'transform';
      updateTransformBox();
      renderOverlay();

      resetLasso();
    };
    img.src = off.toDataURL('image/png');
  }

  // =========================
  // Layer Add / Delete (undoable)
  // =========================
  function deleteLayer(i, isRedo = false) {
    if (i === 0) return;
    if (!layers[i].enabled) return;

    commitOverlay();

    const snap = layers[i].ctx.getImageData(0, 0, W(), H());
    const prevVisible = layers[i].visible;

    if (!isRedo) pushAction({ type: 'deleteLayer', layerIndex: i, imageData: snap, prevVisible });

    layers[i].enabled = false;
    layers[i].visible = false;
    layers[i].canvas.style.display = 'none';
    layerRows[i].classList.add('layer-hidden');
    if (layerVis[i]) layerVis[i].checked = false;

    if (activeLayer === i) {
      const radio0 = layerRadios.find(r => parseInt(r.value, 10) === 0);
      if (radio0) radio0.checked = true;
      setActiveLayer(0);
    }
  }

  if (deleteLayer1Btn) deleteLayer1Btn.addEventListener('click', () => deleteLayer(1));
  if (deleteLayer2Btn) deleteLayer2Btn.addEventListener('click', () => deleteLayer(2));

  if (addLayerBtn) {
    addLayerBtn.addEventListener('click', () => {
      const idx = layers.findIndex(l => !l.enabled);
      if (idx === -1) return;
      pushAction({ type: 'addLayer', layerIndex: idx });
      enableLayer(idx);
      const radio = layerRadios.find(r => parseInt(r.value, 10) === idx);
      if (radio) radio.checked = true;
      setActiveLayer(idx);
    });
  }

  // =========================
  // Background selector
  // =========================
  backgroundPatternSelect.addEventListener('change', () => {
    canvasContainer.className = 'canvas-container ' + backgroundPatternSelect.value;
  });

  // =========================
  // Clear canvas (undoable)
  // =========================
  clearCanvasButton.addEventListener('click', () => {
    commitOverlay();
    saveStateLayer(activeLayer);
    const ctxA = active().ctx;
    ctxA.setTransform(1, 0, 0, 1, 0, 0);
    ctxA.globalCompositeOperation = 'source-over';
    ctxA.clearRect(0, 0, W(), H());
    clearOverlayUI();
  });

  // =========================
  // Undo / Redo
  // =========================
  undoCanvasButton.addEventListener('click', undoLayer);
  redoCanvasButton.addEventListener('click', redoLayer);

  // =========================
  // Flip active layer
  // =========================
  function flipActiveLayerHorizontal() {
    commitOverlay();
    saveStateLayer(activeLayer);

    const off = document.createElement('canvas');
    off.width = W();
    off.height = H();
    off.getContext('2d').drawImage(active().canvas, 0, 0);

    const ctxA = active().ctx;
    ctxA.save();
    ctxA.setTransform(-1, 0, 0, 1, W(), 0);
    ctxA.clearRect(0, 0, W(), H());
    ctxA.drawImage(off, 0, 0);
    ctxA.restore();
  }
  flipCanvasButton.addEventListener('click', flipActiveLayerHorizontal);

  // =========================
  // Download merged layers
  // =========================
  function getExportBackgroundFill(format) {
    if (format === 'png-transparent') return null;
    const selected = backgroundPatternSelect ? backgroundPatternSelect.value : 'plain';
    if (selected === 'dark') return '#000000';
    if (selected === 'plain') return '#ffffff';
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

    if (currentTool !== 'cropImage') cropOverlay.style.display = 'none';
  });

  brushTypeSelect.addEventListener('change', () => { currentBrush = brushTypeSelect.value; });
  brushSizeInput.addEventListener('input', () => { brushSizeValue.textContent = brushSizeInput.value; });
  opacityInput.addEventListener('input', () => { opacityValue.textContent = opacityInput.value; });

  // =========================
  // Main pointer events on container
  // =========================
  canvasContainer.addEventListener('mousedown', (e) => {
    if (currentTool === 'transform') return;

    const p = canvasPoint(e);
    const ctxA = active().ctx;

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

    if (currentTool === 'pen' || currentTool === 'eraser') {
      commitOverlay();
      saveStateLayer(activeLayer);

      isDrawing = true;
      lastX = p.x;
      lastY = p.y;

      ctxA.beginPath();
      ctxA.moveTo(lastX, lastY);

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

    if (shapeActive && currentTool === 'shape') {
      ctxA.putImageData(savedImageData, 0, 0);
      ctxA.strokeStyle = hexToRgba(brushColorInput.value, opacityInput.value);
      ctxA.lineWidth = parseInt(brushSizeInput.value, 10);

      const shape = shapeTypeSelect.value;
      const w = p.x - shapeStart.x;
      const h = p.y - shapeStart.y;

      if (shape === 'line' || shape === 'dottedLine') {
        ctxA.beginPath();
        ctxA.moveTo(shapeStart.x, shapeStart.y);
        if (shape === 'dottedLine') ctxA.setLineDash([2, 6]);
        ctxA.lineTo(p.x, p.y);
        ctxA.stroke();
        ctxA.setLineDash([]);
      } else if (shape === 'rectangle' || shape === 'dottedRectangle') {
        if (shape === 'dottedRectangle') ctxA.setLineDash([2, 6]);
        ctxA.strokeRect(shapeStart.x, shapeStart.y, w, h);
        ctxA.setLineDash([]);
      } else if (shape === 'circle') {
        const r = Math.sqrt(w * w + h * h);
        ctxA.beginPath();
        ctxA.arc(shapeStart.x, shapeStart.y, r, 0, Math.PI * 2);
        ctxA.stroke();
      } else if (shape === 'ellipse') {
        ctxA.beginPath();
        ctxA.ellipse(shapeStart.x + w / 2, shapeStart.y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
        ctxA.stroke();
      } else if (shape === 'star') {
        const r = Math.max(Math.abs(w), Math.abs(h));
        drawStar(ctxA, shapeStart.x, shapeStart.y, 5, r, r / 2);
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
      const dx = p.x - last.x;
      const dy = p.y - last.y;
      if (Math.hypot(dx, dy) > 1) lassoPoints.push({ x: p.x, y: p.y });
      drawLassoOverlay(lassoPoints);
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
        const sp = stampSpacingPx(currentBrush, size);
        const d = Math.hypot(x1 - lastStampX, y1 - lastStampY);
        if (d < sp) return;
        lastStampX = x1;
        lastStampY = y1;
        brushFunctions[currentBrush](ctxA, x1, y1, size, color, opacity);
        return;
      }
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

    lastX = p.x;
    lastY = p.y;
  });

  canvasContainer.addEventListener('mouseup', () => {
    isDrawing = false;

    if (shapeActive && currentTool === 'shape') {
      shapeActive = false;
      return;
    }

    if (currentTool === 'select' && isSelecting) {
      isSelecting = false;
      hideSelection();
      finalizeRectSelection();
      selectRect = null;
      return;
    }

    if (currentTool === 'lasso' && isLassoing) {
      isLassoing = false;
      finalizeLassoSelection();
      return;
    }
  });

  canvasContainer.addEventListener('mouseleave', () => {
    isDrawing = false;
    if (shapeActive) shapeActive = false;
    if (isSelecting) { isSelecting = false; hideSelection(); }
  });

  // =========================
  // Transform interactions (same as before)
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

    const p = canvasPoint(e);
    startMouse = p;
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

      const applyResize = (left, top, right, bottom) => {
        if (left)  { x = startState.x + dx; w = startState.w - dx; }
        if (right) { w = startState.w + dx; }
        if (top)   { y = startState.y + dy; h = startState.h - dy; }
        if (bottom){ h = startState.h + dy; }
        w = Math.max(5, w); h = Math.max(5, h);
        if (keepAspect) {
          const newAspect = w / h;
          if (newAspect > aspect) h = w / aspect;
          else w = h * aspect;
        }
        if (left)  x = startState.x + (startState.w - w);
        if (top)   y = startState.y + (startState.h - h);
      };

      const map = {
        nw:[true,true,false,false], n:[false,true,false,false], ne:[false,true,true,false],
        e:[false,false,true,false], se:[false,false,true,true], s:[false,false,false,true],
        sw:[true,false,false,true], w:[true,false,false,false]
      };

      applyResize(...(map[activeHandle] || [false,false,false,false]));
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
    transformBox.releasePointerCapture(e.pointerId);
    transformMode = null;
    activeHandle = null;
  });

  transformBox.addEventListener('dblclick', () => commitOverlay());

  // =========================
  // Image insertion -> overlay
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
  // Keyboard shortcuts
  // =========================
  document.addEventListener('keydown', (e) => {
    const key = (e.key || '').toLowerCase();
    const ctrlOrCmd = e.ctrlKey || e.metaKey;

    const t = e.target;
    const isTypingTarget = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);

    const prevent = () => { e.preventDefault(); e.stopPropagation(); };

    if (ctrlOrCmd && key === 'z' && !e.shiftKey) {
      if (!isTypingTarget) { prevent(); undoLayer(); }
      return;
    }

    if (ctrlOrCmd && (key === 'y' || (key === 'z' && e.shiftKey))) {
      if (!isTypingTarget) { prevent(); redoLayer(); }
      return;
    }

    if (key === 'escape') {
      prevent();
      isSelecting = false;
      isCropping = false;
      cropOverlay.style.display = 'none';
      hideSelection();
      resetLasso();
      transformMode = null;
      activeHandle = null;
      return;
    }

    if (key === 'enter' && currentTool === 'transform' && overlayObj) {
      prevent();
      commitOverlay();
    }
  });

  // =========================
  // UI init
  // =========================
  lassoOverlay.width = W();
  lassoOverlay.height = H();
  shapeOptionsDiv.style.display = (currentTool === 'shape') ? 'inline-block' : 'none';

  brushSizeValue.textContent = brushSizeInput.value;
  opacityValue.textContent = opacityInput.value;

  updateTransformBox();
});

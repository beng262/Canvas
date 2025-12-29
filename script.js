document.addEventListener('DOMContentLoaded', () => {
  // =========================
  // Init: DOM
  // =========================
  const canvasContainer = document.getElementById('canvasContainer');
  const inputOverlay = document.getElementById('inputOverlay');
  const inputCtx = inputOverlay.getContext('2d', { willReadFrequently: true });

  const lassoOverlay = document.getElementById('lassoOverlay');
  const lassoCtx = lassoOverlay.getContext('2d', { willReadFrequently: true });

  const selectionOverlay = document.getElementById('selectionOverlay');
  const cropOverlay = document.getElementById('cropOverlay');
  const transformBox = document.getElementById('transformBox');

  const toolSelect = document.getElementById('tool');
  const brushTypeSelect = document.getElementById('brushType');
  const brushSizeInput = document.getElementById('brushSize');
  const brushSizeValue = document.getElementById('brushSizeValue');
  const opacityInput = document.getElementById('opacity');
  const opacityValue = document.getElementById('opacityValue');
  const brushSpacingInput = document.getElementById('brushSpacing');
  const brushSpacingValue = document.getElementById('brushSpacingValue');
  const brushColorInput = document.getElementById('brushColor');

  const shapeOptionsDiv = document.getElementById('shapeOptions');
  const shapeTypeSelect = document.getElementById('shapeType');

  const backgroundPatternSelect = document.getElementById('backgroundPattern');

  const clearCanvasButton = document.getElementById('clearCanvas');
  const undoCanvasButton = document.getElementById('undoCanvas');
  const redoCanvasButton = document.getElementById('redoCanvas');
  const flipCanvasButton = document.getElementById('flipCanvas');

  const downloadFormatSelect = document.getElementById('downloadFormat');
  const downloadCanvasButton = document.getElementById('downloadCanvas');

  const addImageButton = document.getElementById('addImageButton');
  const addImageInput = document.getElementById('addImageInput');

  const symmetryCheckbox = document.getElementById('symmetry');
  const symmetryGuide = document.getElementById('symmetryGuide');

  const darkModeToggle = document.getElementById('darkModeToggle');

  // Layers UI
  const layersList = document.getElementById('layersList');
  const addLayerBtn = document.getElementById('addLayerBtn');
  const mergeLayerBtn = document.getElementById('mergeLayerBtn');

  // Color wheel UI
  const wheelPanel = document.getElementById('wheelPanel');
  const toggleWheel = document.getElementById('toggleWheel');
  const closeWheel = document.getElementById('closeWheel');
  const hueRing = document.getElementById('hueRing');
  const svTriangle = document.getElementById('svTriangle');
  const wheelChip = document.getElementById('wheelChip');
  const wheelHex = document.getElementById('wheelHex');
  const wheelSetBtn = document.getElementById('wheelSetBtn');

  // =========================
  // Init: Constants + State
  // =========================
  const CANVAS_W = 800;
  const CANVAS_H = 600;

  const MAX_LAYERS = 10;
  const MAX_HISTORY = 60;

  let currentTool = toolSelect.value;
  let currentBrush = brushTypeSelect.value;

  // Overlay selection/transform
  let overlayObj = null; // { img, x, y, w, h, angle, naturalW, naturalH }
  let baseImageData = null;

  // Drawing state
  let isDrawing = false;
  let lastX = 0, lastY = 0;
  let lastStampX = null, lastStampY = null;

  // Shape state
  let shapeActive = false;
  let shapeStart = { x: 0, y: 0 };
  let savedImageData = null;

  // Selection state
  let isSelecting = false;
  let selectStart = { x: 0, y: 0 };
  let selectRect = null;

  // Lasso state
  let isLassoing = false;
  let lassoPoints = [];

  // Crop state
  let isCropping = false;
  let cropStart = { x: 0, y: 0 };
  let cropRect = null;

  // Transform drag state
  let transformMode = null;
  let activeHandle = null;
  let startMouse = { x: 0, y: 0 };
  let startState = null;

  // Recent colors
  let recentColors = [];

  // App actions (undoable across add/delete/merge/rename)
  let actionUndo = [];
  let actionRedo = [];

  // =========================
  // Init: Helpers
  // =========================
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function int(n) { return Math.round(n); }

  function canvasPoint(evt) {
    const r = canvasContainer.getBoundingClientRect();
    return { x: evt.clientX - r.left, y: evt.clientY - r.top };
  }

  function spacingScale() {
    const v = parseInt(brushSpacingInput.value || '100', 10);
    return clamp(v, 25, 300) / 100;
  }

  function stampSpacingPx(brush, size) {
    const base =
      (brush === 'star' || brush === 'heart') ? Math.max(10, size * 1.7) :
      (brush === 'splatter') ? Math.max(8, size * 1.2) :
      (brush === 'scatter' || brush === 'glitter') ? Math.max(6, size * 1.0) :
      (brush === 'spray' || brush === 'airbrush') ? Math.max(3, size * 0.6) :
      Math.max(4, size * 0.8);
    return base * spacingScale();
  }

  function jitter(n) { return (Math.random() - 0.5) * n; }

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
  // Init: Canvases
  // =========================
  function initOverlaySizes() {
    inputOverlay.width = CANVAS_W;
    inputOverlay.height = CANVAS_H;
    lassoOverlay.width = CANVAS_W;
    lassoOverlay.height = CANVAS_H;

    if (symmetryGuide) symmetryGuide.style.height = CANVAS_H + 'px';
  }
  initOverlaySizes();

  // =========================
  // Init: Layers
  // =========================
  const layers = [];
  let activeLayerIndex = 0;

  function createLayerCanvas(z) {
    const c = document.createElement('canvas');
    c.width = CANVAS_W;
    c.height = CANVAS_H;
    c.className = 'layer-canvas';
    c.style.zIndex = String(z);
    c.style.pointerEvents = 'none';
    canvasContainer.insertBefore(c, lassoOverlay);
    return c;
  }

  function defaultLayerName(i) {
    return `Layer ${i + 1}`;
  }

  function layerFxToCss(fx) {
    const map = {
      none: 'none',
      grayscale: 'grayscale(1)',
      sepia: 'sepia(1)',
      invert: 'invert(1)',
      blur2: 'blur(2px)',
      blur6: 'blur(6px)',
      bright: 'brightness(1.2)',
      contrast: 'contrast(1.25)',
      saturate: 'saturate(1.6)',
      hue90: 'hue-rotate(90deg)',
      hue180: 'hue-rotate(180deg)',
      shadow: 'drop-shadow(0px 6px 10px rgba(0,0,0,0.35))'
    };
    return map[fx] || 'none';
  }

  function newLayerObject(index) {
    const canvas = createLayerCanvas(2 + index);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    return {
      index,
      name: defaultLayerName(index),
      canvas,
      ctx,
      enabled: true,
      visible: true,
      clip: false,
      fx: 'none',
      undo: [],
      redo: []
    };
  }

  // Init: Create layer 1
  layers.push(newLayerObject(0));

  function activeLayer() {
    return layers[activeLayerIndex];
  }

  // =========================
  // Init: Undo / Redo (layers + actions)
  // =========================
  function pushAction(action) {
    actionRedo = [];
    actionUndo.push(action);
    if (actionUndo.length > MAX_HISTORY) actionUndo.shift();
  }

  function saveStateLayer(i = activeLayerIndex) {
    const L = layers[i];
    if (!L || !L.enabled) return;
    L.redo = [];
    try {
      L.undo.push(L.ctx.getImageData(0, 0, CANVAS_W, CANVAS_H));
      if (L.undo.length > MAX_HISTORY) L.undo.shift();
    } catch {}
  }

  function commitOverlay() {
    if (!overlayObj || !baseImageData) return;
    saveStateLayer(activeLayerIndex);
    renderOverlay();
    baseImageData = activeLayer().ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
    overlayObj = null;
    updateTransformBox();
    requestClipUpdate(true);
  }

  function undoAction() {
    const act = actionUndo.pop();
    if (!act) return false;
    actionRedo.push(act);

    // Init
    if (act.type === 'addLayer') {
      removeLayerById(act.layerId, true);
      return true;
    }

    // Init
    if (act.type === 'deleteLayer') {
      restoreLayer(act.snapshot);
      return true;
    }

    // Init
    if (act.type === 'mergeDown') {
      unmergeLayers(act.snapshot);
      return true;
    }

    // Init
    if (act.type === 'renameLayer') {
      const L = layers.find(x => x.id === act.layerId);
      if (!L) return true;
      L.name = act.prevName;
      renderLayersUI();
      return true;
    }

    return false;
  }

  function redoAction() {
    const act = actionRedo.pop();
    if (!act) return false;
    actionUndo.push(act);

    // Init
    if (act.type === 'addLayer') {
      recreateLayerFromSnapshot(act.snapshot);
      return true;
    }

    // Init
    if (act.type === 'deleteLayer') {
      removeLayerById(act.layerId, false);
      return true;
    }

    // Init
    if (act.type === 'mergeDown') {
      performMergeDown(false);
      return true;
    }

    // Init
    if (act.type === 'renameLayer') {
      const L = layers.find(x => x.id === act.layerId);
      if (!L) return true;
      L.name = act.nextName;
      renderLayersUI();
      return true;
    }

    return false;
  }

  function undo() {
    commitOverlay();
    if (undoAction()) { requestClipUpdate(true); return; }

    const L = activeLayer();
    if (!L.undo.length) return;

    try {
      L.redo.push(L.ctx.getImageData(0, 0, CANVAS_W, CANVAS_H));
      L.ctx.putImageData(L.undo.pop(), 0, 0);
      requestClipUpdate(true);
    } catch {}
  }

  function redo() {
    commitOverlay();
    if (redoAction()) { requestClipUpdate(true); return; }

    const L = activeLayer();
    if (!L.redo.length) return;

    try {
      L.undo.push(L.ctx.getImageData(0, 0, CANVAS_W, CANVAS_H));
      L.ctx.putImageData(L.redo.pop(), 0, 0);
      requestClipUpdate(true);
    } catch {}
  }

  // =========================
  // Init: Color utils
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

  function rgbaToHex(r, g, b) {
    const to2 = (n) => n.toString(16).padStart(2, '0');
    return `#${to2(r)}${to2(g)}${to2(b)}`;
  }

  // =========================
  // Init: Recent colors
  // =========================
  function addRecentColor(color) {
    if (recentColors.includes(color)) return;
    recentColors.push(color);
    if (recentColors.length > 12) recentColors.shift();

    const recentColorsDiv = document.getElementById('recentColors');
    recentColorsDiv.innerHTML = '';
    recentColors.forEach(c => {
      const sw = document.createElement('div');
      sw.className = 'color-swatch';
      sw.style.backgroundColor = c;
      sw.addEventListener('click', () => { brushColorInput.value = c; });
      recentColorsDiv.appendChild(sw);
    });
  }
  brushColorInput.addEventListener('change', () => addRecentColor(brushColorInput.value));

  // =========================
  // Init: Symmetry guide
  // =========================
  function syncSymmetryGuide() {
    if (!symmetryGuide) return;
    symmetryGuide.style.display = symmetryCheckbox.checked ? 'block' : 'none';
  }
  symmetryCheckbox.addEventListener('change', syncSymmetryGuide);
  syncSymmetryGuide();

  // =========================
  // Init: Background selector
  // =========================
  backgroundPatternSelect.addEventListener('change', () => {
    canvasContainer.className = 'canvas-container ' + backgroundPatternSelect.value;
  });

  // =========================
  // Init: Brush UI sync
  // =========================
  brushTypeSelect.addEventListener('change', () => { currentBrush = brushTypeSelect.value; });
  toolSelect.addEventListener('change', () => {
    const nextTool = toolSelect.value;

    if (shapeOptionsDiv) shapeOptionsDiv.style.display = (nextTool === 'shape') ? 'inline-block' : 'none';

    if (currentTool === 'transform' && nextTool !== 'transform' && nextTool !== 'cropImage') {
      commitOverlay();
    }

    currentTool = nextTool;

    if (currentTool !== 'select') hideSelection();
    if (currentTool !== 'lasso') resetLasso();
    if (currentTool !== 'cropImage' && cropOverlay) cropOverlay.style.display = 'none';

    if (currentTool === 'transform') {
      if (!baseImageData) baseImageData = activeLayer().ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
      updateTransformBox();
      renderOverlay();
    } else {
      updateTransformBox();
    }
  });

  brushSizeInput.addEventListener('input', () => { brushSizeValue.textContent = brushSizeInput.value; });
  opacityInput.addEventListener('input', () => { opacityValue.textContent = opacityInput.value; });
  brushSpacingInput.addEventListener('input', () => { brushSpacingValue.textContent = brushSpacingInput.value; });

  // =========================
  // Init: Selection overlays
  // =========================
  function showSelection(x, y, w, h) {
    selectionOverlay.style.display = 'block';
    Object.assign(selectionOverlay.style, {
      left: x + 'px',
      top: y + 'px',
      width: w + 'px',
      height: h + 'px'
    });
  }
  function hideSelection() {
    selectionOverlay.style.display = 'none';
  }

  function clearLassoOverlay() {
    lassoCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
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

  // =========================
  // Init: Transform overlay
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

    const ctx = activeLayer().ctx;
    ctx.putImageData(baseImageData, 0, 0);

    ctx.save();
    const nw = overlayObj.naturalW || overlayObj.w;
    const nh = overlayObj.naturalH || overlayObj.h;
    const scaling = Math.abs(overlayObj.w - nw) > 0.5 || Math.abs(overlayObj.h - nh) > 0.5;

    ctx.imageSmoothingEnabled = scaling;
    if (ctx.imageSmoothingEnabled && ctx.imageSmoothingQuality) ctx.imageSmoothingQuality = 'high';

    ctx.translate(overlayObj.x, overlayObj.y);
    ctx.rotate(overlayObj.angle || 0);
    ctx.drawImage(overlayObj.img, 0, 0, overlayObj.w, overlayObj.h);
    ctx.restore();

    requestClipUpdate();
  }

  // =========================
  // Init: Brushes
  // =========================
  const stampBrushes = new Set(['square','dotted','spray','splatter','glitter','airbrush','star','heart','scatter','oil']);
  const texturedPencils = new Set(['sketch','graphite','charcoal','crosshatch']);

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

  const brushes = {
    // Init
    round(ctx, x, y, size, color, opacity) {
      ctx.strokeStyle = hexToRgba(color, opacity);
      ctx.lineWidth = size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineTo(x, y);
      ctx.stroke();
    },

    // Init
    ink(ctx, x, y, size, color, opacity) {
      ctx.save();
      ctx.strokeStyle = hexToRgba(color, opacity);
      ctx.lineWidth = Math.max(1, size / 3.2);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.restore();
    },

    // Init
    marker(ctx, x, y, size, color, opacity) {
      ctx.save();
      ctx.strokeStyle = hexToRgba(color, opacity * 0.65);
      ctx.lineWidth = size * 1.35;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.restore();
    },

    // Init
    fountain(ctx, x, y, size, color, opacity) {
      ctx.save();
      ctx.strokeStyle = hexToRgba(color, opacity * 0.85);
      ctx.lineWidth = Math.max(1, size / 2.6);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineTo(x + jitter(0.6), y + jitter(0.6));
      ctx.stroke();
      ctx.restore();
    },

    // Init
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

    // Init
    sketch(ctx, x, y, size, color, opacity) {
      ctx.save();
      ctx.strokeStyle = hexToRgba(color, opacity * 0.35);
      ctx.lineWidth = Math.max(1, size / 8);
      ctx.lineCap = 'round';
      const passes = Math.max(3, Math.round(6 * spacingScale()));
      for (let i = 0; i < passes; i++) {
        ctx.beginPath();
        ctx.moveTo(x + jitter(size * 0.35), y + jitter(size * 0.35));
        ctx.lineTo(x + jitter(size * 0.35), y + jitter(size * 0.35));
        ctx.stroke();
      }
      ctx.restore();
    },

    // Init
    graphite(ctx, x, y, size, color, opacity) {
      ctx.save();
      ctx.strokeStyle = hexToRgba(color, opacity * 0.28);
      ctx.lineWidth = Math.max(1, size / 7);
      ctx.lineCap = 'round';
      for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        ctx.lineTo(x + jitter(size * 0.25), y + jitter(size * 0.25));
        ctx.stroke();
      }
      ctx.restore();
    },

    // Init
    charcoal(ctx, x, y, size, color, opacity) {
      ctx.save();
      ctx.fillStyle = hexToRgba(color, opacity * 0.20);
      for (let i = 0; i < 10; i++) {
        ctx.fillRect(x + jitter(size), y + jitter(size), Math.max(1, size / 5), Math.max(1, size / 5));
      }
      ctx.restore();
    },

    // Init
    crosshatch(ctx, x, y, size, color, opacity) {
      ctx.save();
      ctx.strokeStyle = hexToRgba(color, opacity * 0.22);
      ctx.lineWidth = Math.max(1, size / 10);
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.moveTo(x + jitter(size), y + jitter(size));
        ctx.lineTo(x + jitter(size), y + jitter(size));
        ctx.stroke();
      }
      ctx.restore();
    },

    // Init
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

    // Init
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

    // Init
    oil(ctx, x, y, size, color, opacity) {
      ctx.save();
      ctx.fillStyle = hexToRgba(color, opacity);
      ctx.beginPath();
      ctx.ellipse(x, y, size * 0.85, size * 0.55, Math.random(), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    },

    // Init
    spray(ctx, x, y, size, color, opacity) {
      ctx.save();
      ctx.fillStyle = hexToRgba(color, opacity);
      for (let i = 0; i < 55; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * size * 1.35;
        ctx.fillRect(x + Math.cos(a) * r, y + Math.sin(a) * r, 1, 1);
      }
      ctx.restore();
    },

    // Init
    airbrush(ctx, x, y, size, color, opacity) {
      ctx.save();
      for (let i = 0; i < 75; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * size;
        ctx.fillStyle = hexToRgba(color, opacity * Math.random() * 0.25);
        ctx.fillRect(x + Math.cos(a) * r, y + Math.sin(a) * r, 1, 1);
      }
      ctx.restore();
    },

    // Init
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

    // Init
    glitter(ctx, x, y, size, color, opacity) {
      ctx.save();
      for (let i = 0; i < 14; i++) {
        ctx.fillStyle = hexToRgba(color, opacity * (0.2 + Math.random() * 0.8));
        const s = 1 + Math.random() * 2;
        ctx.fillRect(x + jitter(size), y + jitter(size), s, s);
      }
      ctx.restore();
    },

    // Init
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

    // Init
    dotted(ctx, x, y, size, color, opacity) {
      ctx.fillStyle = hexToRgba(color, opacity);
      ctx.beginPath();
      ctx.arc(x, y, size / 2, 0, Math.PI * 2);
      ctx.fill();
    },

    // Init
    square(ctx, x, y, size, color, opacity) {
      ctx.fillStyle = hexToRgba(color, opacity);
      ctx.fillRect(x - size / 2, y - size / 2, size, size);
    },

    // Init
    star(ctx, x, y, size, color, opacity) {
      ctx.save();
      ctx.strokeStyle = hexToRgba(color, opacity);
      ctx.lineWidth = Math.max(1, size / 8);
      drawStar(ctx, x, y, 5, size * 0.9, size * 0.45);
      ctx.restore();
    },

    // Init
    heart(ctx, x, y, size, color, opacity) {
      ctx.save();
      ctx.strokeStyle = hexToRgba(color, opacity);
      ctx.lineWidth = Math.max(1, size / 8);
      drawHeart(ctx, x, y, size * 0.9);
      ctx.restore();
    },

    // Init
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
  // Init: Fill tool (edge expansion)
  // =========================
  function floodFill(startX, startY, fillColor) {
    const ctx = activeLayer().ctx;
    const width = CANVAS_W, height = CANVAS_H;
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    const TOL = 28;
    const TOL_EDGE = 45;
    const EDGE_EXPAND = 1;

    const sx = clamp(startX, 0, width - 1);
    const sy = clamp(startY, 0, height - 1);

    const startPos = (sy * width + sx) * 4;
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
    const stack = [sx + sy * width];

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

    // Init
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

    // Init
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

    ctx.putImageData(imageData, 0, 0);
    requestClipUpdate(true);
  }

  // =========================
  // Init: Select area (pixel-perfect)
  // =========================
  function finalizeRectSelection() {
    if (!selectRect || selectRect.w < 1 || selectRect.h < 1) return;

    const ctx = activeLayer().ctx;

    const x = clamp(int(selectRect.x), 0, CANVAS_W - 1);
    const y = clamp(int(selectRect.y), 0, CANVAS_H - 1);
    const w = clamp(int(selectRect.w), 1, CANVAS_W - x);
    const h = clamp(int(selectRect.h), 1, CANVAS_H - y);

    const imgData = ctx.getImageData(x, y, w, h);

    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    off.getContext('2d', { willReadFrequently: true }).putImageData(imgData, 0, 0);

    const img = new Image();
    img.onload = () => {
      saveStateLayer(activeLayerIndex);

      ctx.clearRect(x, y, w, h);
      baseImageData = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);

      overlayObj = { img, x, y, w, h, angle: 0, naturalW: w, naturalH: h };
      toolSelect.value = 'transform';
      currentTool = 'transform';
      updateTransformBox();
      renderOverlay();
    };
    img.src = off.toDataURL('image/png');
  }

  // =========================
  // Init: Lasso selection (no duplicates)
  // =========================
  function finalizeLassoSelection() {
    if (lassoPoints.length < 3) return;

    const xs = lassoPoints.map(p => p.x);
    const ys = lassoPoints.map(p => p.y);

    const bounds = {
      x: clamp(Math.floor(Math.min(...xs)), 0, CANVAS_W - 1),
      y: clamp(Math.floor(Math.min(...ys)), 0, CANVAS_H - 1),
      w: Math.max(1, Math.ceil(Math.max(...xs) - Math.min(...xs))),
      h: Math.max(1, Math.ceil(Math.max(...ys) - Math.min(...ys)))
    };

    bounds.w = clamp(bounds.w, 1, CANVAS_W - bounds.x);
    bounds.h = clamp(bounds.h, 1, CANVAS_H - bounds.y);

    const ctx = activeLayer().ctx;

    const imgData = ctx.getImageData(bounds.x, bounds.y, bounds.w, bounds.h);

    const off = document.createElement('canvas');
    off.width = bounds.w;
    off.height = bounds.h;
    const offCtx = off.getContext('2d', { willReadFrequently: true });
    offCtx.putImageData(imgData, 0, 0);

    const mask = document.createElement('canvas');
    mask.width = bounds.w;
    mask.height = bounds.h;
    const maskCtx = mask.getContext('2d');

    maskCtx.fillStyle = '#fff';
    maskCtx.beginPath();
    lassoPoints.forEach((p, i) => {
      const x = p.x - bounds.x;
      const y = p.y - bounds.y;
      if (i === 0) maskCtx.moveTo(x, y);
      else maskCtx.lineTo(x, y);
    });
    maskCtx.closePath();
    maskCtx.fill();

    offCtx.globalCompositeOperation = 'destination-in';
    offCtx.drawImage(mask, 0, 0);
    offCtx.globalCompositeOperation = 'source-over';

    const img = new Image();
    img.onload = () => {
      saveStateLayer(activeLayerIndex);

      ctx.save();
      ctx.beginPath();
      lassoPoints.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.closePath();
      ctx.clip();
      ctx.clearRect(bounds.x, bounds.y, bounds.w, bounds.h);
      ctx.restore();

      baseImageData = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);

      overlayObj = { img, x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h, angle: 0, naturalW: bounds.w, naturalH: bounds.h };
      toolSelect.value = 'transform';
      currentTool = 'transform';
      updateTransformBox();
      renderOverlay();

      resetLasso();
    };
    img.src = off.toDataURL('image/png');
  }

  // =========================
  // Init: Crop overlay (overlay-only)
  // =========================
  function cropOverlaySelection() {
    if (!overlayObj || !cropRect) return;

    if (Math.abs(overlayObj.angle || 0) > 0.0001) {
      alert('Crop supports only non-rotated selection. Set rotation to 0 first.');
      return;
    }

    const ix1 = Math.max(cropRect.x, overlayObj.x);
    const iy1 = Math.max(cropRect.y, overlayObj.y);
    const ix2 = Math.min(cropRect.x + cropRect.w, overlayObj.x + overlayObj.w);
    const iy2 = Math.min(cropRect.y + cropRect.h, overlayObj.y + overlayObj.h);
    const iw = Math.max(0, ix2 - ix1);
    const ih = Math.max(0, iy2 - iy1);
    if (iw <= 0 || ih <= 0) return;

    const imgW = overlayObj.naturalW || overlayObj.img.naturalWidth || overlayObj.w;
    const imgH = overlayObj.naturalH || overlayObj.img.naturalHeight || overlayObj.h;

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

    offCtx.imageSmoothingEnabled = false;
    offCtx.drawImage(overlayObj.img, sx, sy, sw, sh, 0, 0, off.width, off.height);

    const cropped = new Image();
    cropped.onload = () => {
      saveStateLayer(activeLayerIndex);

      overlayObj.img = cropped;
      overlayObj.x = ix1;
      overlayObj.y = iy1;
      overlayObj.w = iw;
      overlayObj.h = ih;
      overlayObj.angle = 0;
      overlayObj.naturalW = off.width;
      overlayObj.naturalH = off.height;

      updateTransformBox();
      renderOverlay();
    };
    cropped.src = off.toDataURL('image/png');
  }

  // =========================
  // Init: Text tool
  // =========================
  function addTextAt(x, y) {
    commitOverlay();

    const text = prompt('Enter text (Use \\n for new lines):', 'Text');
    if (!text) return;

    saveStateLayer(activeLayerIndex);

    const ctx = activeLayer().ctx;
    const size = Math.max(6, parseInt(brushSizeInput.value, 10) || 24);
    const opacity = clamp(parseFloat(opacityInput.value) || 100, 0, 100);
    const color = brushColorInput.value;

    ctx.save();
    ctx.fillStyle = hexToRgba(color, opacity);
    ctx.textBaseline = 'top';
    ctx.font = `${size}px Arial`;

    const lines = String(text).split('\n');
    const lh = Math.round(size * 1.2);
    lines.forEach((line, i) => ctx.fillText(line, x, y + i * lh));

    ctx.restore();
    requestClipUpdate(true);
  }

  // =========================
  // Init: Clear canvas (undoable)
  // =========================
  clearCanvasButton.addEventListener('click', () => {
    commitOverlay();
    saveStateLayer(activeLayerIndex);

    const ctx = activeLayer().ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    requestClipUpdate(true);
  });

  // =========================
  // Init: Flip active layer
  // =========================
  function flipActiveLayerHorizontal() {
    commitOverlay();
    saveStateLayer(activeLayerIndex);

    const ctx = activeLayer().ctx;

    const off = document.createElement('canvas');
    off.width = CANVAS_W;
    off.height = CANVAS_H;
    off.getContext('2d').drawImage(activeLayer().canvas, 0, 0);

    ctx.save();
    ctx.setTransform(-1, 0, 0, 1, CANVAS_W, 0);
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.drawImage(off, 0, 0);
    ctx.restore();

    requestClipUpdate(true);
  }
  flipCanvasButton.addEventListener('click', flipActiveLayerHorizontal);

  // =========================
  // Init: Download (composite with clip + fx)
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

  function applyClipToTemp(tempCtx, lowerCanvas) {
    tempCtx.save();
    tempCtx.globalCompositeOperation = 'destination-in';
    tempCtx.filter = 'none';
    tempCtx.drawImage(lowerCanvas, 0, 0);
    tempCtx.restore();
  }

  function buildExportCanvas(fillColor) {
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = CANVAS_W;
    exportCanvas.height = CANVAS_H;
    const exportCtx = exportCanvas.getContext('2d');

    if (fillColor) {
      exportCtx.fillStyle = fillColor;
      exportCtx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }

    // Init
    layers.forEach((L, i) => {
      if (!L.enabled || !L.visible) return;

      const fx = layerFxToCss(L.fx);

      // Init
      if (i > 0 && L.clip && layers[i - 1] && layers[i - 1].enabled) {
        const tmp = document.createElement('canvas');
        tmp.width = CANVAS_W;
        tmp.height = CANVAS_H;
        const tctx = tmp.getContext('2d');
        tctx.filter = fx;
        tctx.drawImage(L.canvas, 0, 0);
        applyClipToTemp(tctx, layers[i - 1].canvas);

        exportCtx.filter = 'none';
        exportCtx.drawImage(tmp, 0, 0);
        return;
      }

      exportCtx.filter = fx;
      exportCtx.drawImage(L.canvas, 0, 0);
      exportCtx.filter = 'none';
    });

    exportCtx.filter = 'none';
    return exportCanvas;
  }

  function getDownloadDataUrl(format) {
    const fillColor = getExportBackgroundFill(format);
    const exportCanvas = buildExportCanvas(fillColor);

    // Init
    if (format === 'jpg' || format === 'jpeg') return exportCanvas.toDataURL('image/jpeg', 0.92);
    return exportCanvas.toDataURL('image/png');
  }

  function getDownloadFilename(format) {
    const ext = format === 'png-transparent' ? 'png' : format;
    return `DrawNow_art.${ext}`;
  }

  downloadCanvasButton.addEventListener('click', () => {
    commitOverlay();
    const format = downloadFormatSelect ? downloadFormatSelect.value : 'png';
    const a = document.createElement('a');
    a.download = getDownloadFilename(format);
    a.href = getDownloadDataUrl(format);
    a.click();
  });

  // =========================
  // Init: Add image -> overlay
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
        saveStateLayer(activeLayerIndex);

        baseImageData = activeLayer().ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);

        const scale = Math.min(CANVAS_W / img.width, CANVAS_H / img.height, 1);
        const w = Math.floor(img.width * scale);
        const h = Math.floor(img.height * scale);
        const x = Math.floor((CANVAS_W - w) / 2);
        const y = Math.floor((CANVAS_H - h) / 2);

        overlayObj = { img, x, y, w, h, angle: 0, naturalW: img.width, naturalH: img.height };
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
  // Init: Shapes preview
  // =========================
  function shapeDrawPreview(p) {
    const ctx = activeLayer().ctx;
    ctx.putImageData(savedImageData, 0, 0);

    ctx.strokeStyle = hexToRgba(brushColorInput.value, opacityInput.value);
    ctx.lineWidth = parseInt(brushSizeInput.value, 10);

    const shape = shapeTypeSelect.value;
    const w = p.x - shapeStart.x;
    const h = p.y - shapeStart.y;

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
    } else if (shape === 'ellipse') {
      ctx.beginPath();
      ctx.ellipse(shapeStart.x + w / 2, shapeStart.y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (shape === 'star') {
      const r = Math.max(Math.abs(w), Math.abs(h));
      drawStar(ctx, shapeStart.x, shapeStart.y, 5, r, r / 2);
    } else if (shape === 'heart') {
      drawHeart(ctx, shapeStart.x, shapeStart.y, Math.max(Math.abs(w), Math.abs(h)));
    }
  }

  // =========================
  // Init: Input events
  // =========================
  inputOverlay.addEventListener('mousedown', (e) => {
    if (currentTool === 'transform') return;

    const p = canvasPoint(e);

    lastStampX = p.x;
    lastStampY = p.y;

    // Init
    if (currentTool === 'fill') {
      commitOverlay();
      saveStateLayer(activeLayerIndex);
      floodFill(Math.floor(p.x), Math.floor(p.y), brushColorInput.value);
      return;
    }

    // Init
    if (currentTool === 'text') {
      addTextAt(p.x, p.y);
      return;
    }

    // Init
    if (currentTool === 'shape') {
      commitOverlay();
      shapeActive = true;
      shapeStart = p;
      savedImageData = activeLayer().ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
      saveStateLayer(activeLayerIndex);
      return;
    }

    // Init
    if (currentTool === 'select') {
      commitOverlay();
      isSelecting = true;
      selectStart = p;
      selectRect = null;
      hideSelection();
      resetLasso();
      return;
    }

    // Init
    if (currentTool === 'lasso') {
      commitOverlay();
      isLassoing = true;
      lassoPoints = [p];
      hideSelection();
      drawLassoOverlay(lassoPoints);
      return;
    }

    // Init
    if (currentTool === 'cropImage') {
      if (!overlayObj) return;
      isCropping = true;
      cropStart = p;
      cropRect = null;
      return;
    }

    // Init: drawing tools
    if (currentTool === 'pen' || currentTool === 'eraser') {
      commitOverlay();
      saveStateLayer(activeLayerIndex);

      isDrawing = true;
      lastX = p.x;
      lastY = p.y;

      const ctx = activeLayer().ctx;
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);

      const size = parseInt(brushSizeInput.value, 10);
      const opacity = parseFloat(opacityInput.value);
      const color = brushColorInput.value;

      ctx.globalCompositeOperation = (currentTool === 'eraser') ? 'destination-out' : 'source-over';

      if (stampBrushes.has(currentBrush) && currentTool !== 'eraser') {
        brushes[currentBrush](ctx, p.x, p.y, size, color, opacity);
        requestClipUpdate();
      }
    }
  });

  inputOverlay.addEventListener('mousemove', (e) => {
    const p = canvasPoint(e);

    // Init: shape preview
    if (shapeActive && currentTool === 'shape') {
      shapeDrawPreview(p);
      requestClipUpdate();
      return;
    }

    // Init: select drag
    if (currentTool === 'select' && isSelecting) {
      const x1 = Math.min(selectStart.x, p.x);
      const y1 = Math.min(selectStart.y, p.y);
      const w = Math.abs(p.x - selectStart.x);
      const h = Math.abs(p.y - selectStart.y);
      selectRect = { x: x1, y: y1, w, h };
      showSelection(x1, y1, w, h);
      return;
    }

    // Init: lasso drag
    if (currentTool === 'lasso' && isLassoing) {
      const last = lassoPoints[lassoPoints.length - 1];
      const dx = p.x - last.x;
      const dy = p.y - last.y;
      if (Math.hypot(dx, dy) > 1) lassoPoints.push({ x: p.x, y: p.y });
      drawLassoOverlay(lassoPoints);
      return;
    }

    // Init: crop drag
    if (currentTool === 'cropImage' && isCropping && overlayObj) {
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

    // Init: draw move
    if (!isDrawing) return;
    if (!(currentTool === 'pen' || currentTool === 'eraser')) return;

    const ctx = activeLayer().ctx;
    const size = parseInt(brushSizeInput.value, 10);
    const opacity = parseFloat(opacityInput.value);
    const color = brushColorInput.value;

    ctx.globalCompositeOperation = (currentTool === 'eraser') ? 'destination-out' : 'source-over';

    const drawOne = (x0, y0, x1, y1) => {
      // Init: stamp brushes
      if (stampBrushes.has(currentBrush) && currentTool !== 'eraser') {
        const sp = stampSpacingPx(currentBrush, size);
        const d = Math.hypot(x1 - lastStampX, y1 - lastStampY);
        if (d < sp) return;
        lastStampX = x1;
        lastStampY = y1;
        brushes[currentBrush](ctx, x1, y1, size, color, opacity);
        return;
      }

      // Init: textured pencils with spacing density
      if (texturedPencils.has(currentBrush) && currentTool !== 'eraser') {
        const sp = Math.max(1, (size * 0.5) * spacingScale());
        const d = Math.hypot(x1 - lastStampX, y1 - lastStampY);
        if (lastStampX == null || d >= sp) {
          lastStampX = x1;
          lastStampY = y1;
          brushes[currentBrush](ctx, x1, y1, size, color, opacity);
        }
        return;
      }

      // Init: stroke brushes
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      brushes[currentBrush](ctx, x1, y1, size, color, opacity);
    };

    if (symmetryCheckbox.checked) {
      drawOne(lastX, lastY, p.x, p.y);
      drawOne(CANVAS_W - lastX, lastY, CANVAS_W - p.x, p.y);
    } else {
      drawOne(lastX, lastY, p.x, p.y);
    }

    lastX = p.x;
    lastY = p.y;
    requestClipUpdate();
  });

  inputOverlay.addEventListener('mouseup', () => {
    isDrawing = false;
    lastStampX = null;
    lastStampY = null;

    // Init
    if (shapeActive && currentTool === 'shape') {
      shapeActive = false;
      requestClipUpdate(true);
      return;
    }

    // Init
    if (currentTool === 'select' && isSelecting) {
      isSelecting = false;
      hideSelection();
      finalizeRectSelection();
      selectRect = null;
      requestClipUpdate(true);
      return;
    }

    // Init
    if (currentTool === 'lasso' && isLassoing) {
      isLassoing = false;
      finalizeLassoSelection();
      requestClipUpdate(true);
      return;
    }

    // Init
    if (currentTool === 'cropImage' && isCropping) {
      isCropping = false;
      cropOverlay.style.display = 'none';
      cropOverlaySelection();
      cropRect = null;
      requestClipUpdate(true);
      return;
    }
  });

  inputOverlay.addEventListener('mouseleave', () => {
    isDrawing = false;
    lastStampX = null;
    lastStampY = null;

    if (shapeActive) shapeActive = false;
    if (isSelecting) { isSelecting = false; hideSelection(); }
    if (isLassoing) { isLassoing = false; resetLasso(); }
    if (isCropping) { isCropping = false; cropOverlay.style.display = 'none'; }
  });

  // =========================
  // Init: Transform interactions
  // =========================
  transformBox.addEventListener('pointerdown', (e) => {
    if (!overlayObj || currentTool !== 'transform') return;
    transformBox.setPointerCapture(e.pointerId);

    if (!baseImageData) baseImageData = activeLayer().ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);

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

    // Init
    if (transformMode === 'move') {
      overlayObj.x = startState.x + dx;
      overlayObj.y = startState.y + dy;
    }

    // Init
    if (transformMode === 'resize') {
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
    }

    // Init
    if (transformMode === 'rotate') {
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
  // Init: Keyboard shortcuts
  // =========================
  document.addEventListener('keydown', (e) => {
    const key = (e.key || '').toLowerCase();
    const ctrlOrCmd = e.ctrlKey || e.metaKey;

    const t = e.target;
    const isTyping =
      t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);

    const prevent = () => { e.preventDefault(); e.stopPropagation(); };

    // Init
    if (ctrlOrCmd && key === 'z' && !e.shiftKey) {
      if (!isTyping) { prevent(); undo(); }
      return;
    }

    // Init
    if (ctrlOrCmd && (key === 'y' || (key === 'z' && e.shiftKey))) {
      if (!isTyping) { prevent(); redo(); }
      return;
    }

    // Init
    if (key === 'escape') {
      prevent();
      isSelecting = false;
      isLassoing = false;
      isCropping = false;
      cropOverlay.style.display = 'none';
      hideSelection();
      resetLasso();
      transformMode = null;
      activeHandle = null;
      return;
    }

    // Init
    if (key === 'enter' && currentTool === 'transform' && overlayObj) {
      prevent();
      commitOverlay();
    }
  });

  // =========================
  // Init: Clip preview (CSS mask) + FX
  // =========================
  let clipTimer = null;

  function clearMask(layer) {
    layer.canvas.style.maskImage = '';
    layer.canvas.style.webkitMaskImage = '';
    layer.canvas.style.maskSize = '';
    layer.canvas.style.webkitMaskSize = '';
    layer.canvas.style.maskRepeat = '';
    layer.canvas.style.webkitMaskRepeat = '';
    layer.canvas.style.maskPosition = '';
    layer.canvas.style.webkitMaskPosition = '';
  }

  function updateClipMasks() {
    for (let i = 0; i < layers.length; i++) {
      const L = layers[i];
      if (!L.enabled) { clearMask(L); continue; }
      if (!L.clip) { clearMask(L); continue; }
      if (i === 0) { clearMask(L); continue; }
      if (!layers[i - 1].enabled) { clearMask(L); continue; }

      try {
        const url = layers[i - 1].canvas.toDataURL('image/png');
        L.canvas.style.webkitMaskImage = `url(${url})`;
        L.canvas.style.maskImage = `url(${url})`;

        L.canvas.style.webkitMaskSize = '100% 100%';
        L.canvas.style.maskSize = '100% 100%';

        L.canvas.style.webkitMaskRepeat = 'no-repeat';
        L.canvas.style.maskRepeat = 'no-repeat';

        L.canvas.style.webkitMaskPosition = '0 0';
        L.canvas.style.maskPosition = '0 0';
      } catch {
        clearMask(L);
      }
    }
  }

  function requestClipUpdate(immediate = false) {
    if (immediate) {
      if (clipTimer) { clearTimeout(clipTimer); clipTimer = null; }
      updateClipMasks();
      return;
    }
    if (clipTimer) return;
    clipTimer = setTimeout(() => {
      clipTimer = null;
      updateClipMasks();
    }, 120);
  }

  function applyFxCss(layer) {
    layer.canvas.style.filter = layerFxToCss(layer.fx);
  }

  // =========================
  // Init: Layers UI (max 10 + rename + delete + fx + clip)
  // =========================
  function newId() {
    return 'L' + Math.random().toString(16).slice(2) + Date.now().toString(16);
  }

  function renderLayersUI() {
    layersList.innerHTML = '';

    layers.forEach((L, idx) => {
      const row = document.createElement('div');
      row.className = 'layer-row' + (idx === activeLayerIndex ? ' active' : '');

      // Init: Active radio
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'activeLayerRadio';
      radio.checked = idx === activeLayerIndex;
      radio.addEventListener('change', () => {
        commitOverlay();
        activeLayerIndex = idx;
        renderLayersUI();
      });

      // Init: Visibility
      const vis = document.createElement('input');
      vis.type = 'checkbox';
      vis.checked = L.visible;
      vis.addEventListener('change', () => {
        L.visible = vis.checked;
        L.canvas.style.display = (L.visible && L.enabled) ? 'block' : 'none';
      });

      // Init: Name
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = L.name;

      // Init: Row actions
      const actions = document.createElement('div');
      actions.className = 'row-actions';

      // Init: Edit name
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'mini-btn gray';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => {
        const prev = L.name;
        const next = prompt('Layer name:', prev);
        if (!next) return;

        pushAction({ type: 'renameLayer', layerId: L.id, prevName: prev, nextName: next });
        L.name = next;
        renderLayersUI();
      });

      // Init: Clip
      const clipLabel = document.createElement('label');
      clipLabel.style.fontSize = '12px';
      const clipCb = document.createElement('input');
      clipCb.type = 'checkbox';
      clipCb.checked = L.clip;
      clipCb.disabled = idx === 0;
      clipCb.addEventListener('change', () => {
        L.clip = !!clipCb.checked;
        requestClipUpdate(true);
      });
      clipLabel.appendChild(clipCb);
      clipLabel.appendChild(document.createTextNode(' Clip'));

      // Init: FX
      const fxSel = document.createElement('select');
      const fxOptions = [
        ['none','FX: None'],
        ['grayscale','FX: Grayscale'],
        ['sepia','FX: Sepia'],
        ['invert','FX: Invert'],
        ['blur2','FX: Blur 2'],
        ['blur6','FX: Blur 6'],
        ['bright','FX: Bright'],
        ['contrast','FX: Contrast'],
        ['saturate','FX: Saturate'],
        ['hue90','FX: Hue 90'],
        ['hue180','FX: Hue 180'],
        ['shadow','FX: Shadow']
      ];
      fxOptions.forEach(([v, t]) => {
        const o = document.createElement('option');
        o.value = v;
        o.textContent = t;
        fxSel.appendChild(o);
      });
      fxSel.value = L.fx;
      fxSel.addEventListener('change', () => {
        L.fx = fxSel.value;
        applyFxCss(L);
      });

      // Init: Delete
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'mini-btn danger';
      delBtn.textContent = 'Del';
      delBtn.disabled = idx === 0;
      delBtn.addEventListener('click', () => {
        deleteLayer(idx);
      });

      actions.appendChild(editBtn);
      actions.appendChild(clipLabel);
      actions.appendChild(fxSel);
      actions.appendChild(delBtn);

      row.appendChild(radio);
      row.appendChild(vis);
      row.appendChild(name);
      row.appendChild(actions);

      layersList.appendChild(row);
    });

    // Init: Merge button state
    mergeLayerBtn.disabled = !(activeLayerIndex > 0);
  }

  function snapshotLayer(L) {
    return {
      id: L.id,
      name: L.name,
      visible: L.visible,
      clip: L.clip,
      fx: L.fx,
      imageData: L.ctx.getImageData(0, 0, CANVAS_W, CANVAS_H)
    };
  }

  function recreateLayerFromSnapshot(snapshot) {
    const idx = layers.length;
    const L = newLayerObject(idx);
    L.id = snapshot.id;
    L.name = snapshot.name;
    L.visible = snapshot.visible;
    L.clip = snapshot.clip;
    L.fx = snapshot.fx;
    applyFxCss(L);
    L.canvas.style.display = (L.visible && L.enabled) ? 'block' : 'none';
    L.ctx.putImageData(snapshot.imageData, 0, 0);

    layers.push(L);
    activeLayerIndex = layers.length - 1;
    renderLayersUI();
    requestClipUpdate(true);
  }

  function deleteLayer(idx) {
    if (idx === 0) return;
    commitOverlay();

    const L = layers[idx];
    const snap = snapshotLayer(L);

    pushAction({ type: 'deleteLayer', layerId: L.id, snapshot: snap });

    // Init
    L.enabled = false;
    L.visible = false;
    L.canvas.remove();

    layers.splice(idx, 1);

    // Init: reindex z
    layers.forEach((layer, i) => {
      layer.index = i;
      layer.canvas.style.zIndex = String(2 + i);
    });

    // Init: active layer fallback
    activeLayerIndex = clamp(activeLayerIndex, 0, layers.length - 1);
    if (activeLayerIndex >= idx) activeLayerIndex = Math.max(0, activeLayerIndex - 1);

    renderLayersUI();
    requestClipUpdate(true);
  }

  function removeLayerById(layerId, isUndo) {
    const idx = layers.findIndex(x => x.id === layerId);
    if (idx < 0) return;

    const L = layers[idx];
    if (isUndo) actionRedo.push({ type: 'addLayer', layerId: L.id, snapshot: snapshotLayer(L) });

    L.canvas.remove();
    layers.splice(idx, 1);

    layers.forEach((layer, i) => {
      layer.index = i;
      layer.canvas.style.zIndex = String(2 + i);
    });

    activeLayerIndex = clamp(activeLayerIndex, 0, layers.length - 1);
    renderLayersUI();
  }

  function restoreLayer(snapshot) {
    // Init: restore to end (simple + stable)
    recreateLayerFromSnapshot(snapshot);
    requestClipUpdate(true);
  }

  function performMergeDown(pushToHistory = true) {
    if (activeLayerIndex <= 0) return;

    commitOverlay();

    const top = layers[activeLayerIndex];
    const bottom = layers[activeLayerIndex - 1];

    const snap = {
      type: 'mergeDown',
      topIndex: activeLayerIndex,
      top: snapshotLayer(top),
      bottom: snapshotLayer(bottom)
    };

    if (pushToHistory) pushAction({ type: 'mergeDown', snapshot: snap });

    saveStateLayer(activeLayerIndex - 1);
    bottom.ctx.save();
    bottom.ctx.globalCompositeOperation = 'source-over';
    bottom.ctx.drawImage(top.canvas, 0, 0);
    bottom.ctx.restore();

    top.canvas.remove();
    layers.splice(activeLayerIndex, 1);

    layers.forEach((layer, i) => {
      layer.index = i;
      layer.canvas.style.zIndex = String(2 + i);
    });

    activeLayerIndex = Math.max(0, activeLayerIndex - 1);
    renderLayersUI();
    requestClipUpdate(true);
  }

  function unmergeLayers(snapshot) {
    const bottomSnap = snapshot.snapshot.bottom;
    const topSnap = snapshot.snapshot.top;

    // Init: restore bottom first
    const bottom = layers.find(l => l.id === bottomSnap.id) || layers[activeLayerIndex];
    bottom.name = bottomSnap.name;
    bottom.visible = bottomSnap.visible;
    bottom.clip = bottomSnap.clip;
    bottom.fx = bottomSnap.fx;
    applyFxCss(bottom);
    bottom.ctx.putImageData(bottomSnap.imageData, 0, 0);

    // Init: restore top as a new layer above bottom
    const newL = newLayerObject(layers.length);
    newL.id = topSnap.id;
    newL.name = topSnap.name;
    newL.visible = topSnap.visible;
    newL.clip = topSnap.clip;
    newL.fx = topSnap.fx;
    applyFxCss(newL);
    newL.canvas.style.display = (newL.visible && newL.enabled) ? 'block' : 'none';
    newL.ctx.putImageData(topSnap.imageData, 0, 0);

    layers.push(newL);
    activeLayerIndex = layers.length - 1;

    renderLayersUI();
    requestClipUpdate(true);
  }

  // Init: Add layer (max 10)
  addLayerBtn.addEventListener('click', () => {
    if (layers.length >= MAX_LAYERS) return;

    commitOverlay();

    const idx = layers.length;
    const L = newLayerObject(idx);
    L.id = newId();
    layers.push(L);

    pushAction({ type: 'addLayer', layerId: L.id, snapshot: snapshotLayer(L) });

    activeLayerIndex = layers.length - 1;
    renderLayersUI();
    requestClipUpdate(true);
  });

  // Init: Merge down
  mergeLayerBtn.addEventListener('click', () => performMergeDown(true));

  // Init: First layer ID + UI
  layers[0].id = newId();
  applyFxCss(layers[0]);
  renderLayersUI();

  // =========================
  // Init: Undo / Redo buttons
  // =========================
  undoCanvasButton.addEventListener('click', undo);
  redoCanvasButton.addEventListener('click', redo);

  // =========================
  // Init: Color wheel (Hue ring + SV triangle)
  // =========================
  let wheelHue = 0;     // 0..360
  let triS = 1;         // 0..1
  let triV = 1;         // 0..1
  let wheelPreviewHex = '#000000';

  function hsvToRgb(h, s, v) {
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;

    let rp = 0, gp = 0, bp = 0;
    if (h < 60) { rp = c; gp = x; bp = 0; }
    else if (h < 120) { rp = x; gp = c; bp = 0; }
    else if (h < 180) { rp = 0; gp = c; bp = x; }
    else if (h < 240) { rp = 0; gp = x; bp = c; }
    else if (h < 300) { rp = x; gp = 0; bp = c; }
    else { rp = c; gp = 0; bp = x; }

    return [
      Math.round((rp + m) * 255),
      Math.round((gp + m) * 255),
      Math.round((bp + m) * 255)
    ];
  }

  function updateWheelPreview() {
    const [r, g, b] = hsvToRgb(wheelHue, triS, triV);
    wheelPreviewHex = rgbaToHex(r, g, b);
    wheelChip.style.background = wheelPreviewHex;
    wheelHex.textContent = wheelPreviewHex.toUpperCase();
  }

  function drawHueRing() {
    const ctx = hueRing.getContext('2d');
    const w = hueRing.width, h = hueRing.height;
    const cx = w / 2, cy = h / 2;
    const rOuter = Math.min(cx, cy) - 2;
    const rInner = rOuter - 18;

    ctx.clearRect(0, 0, w, h);

    // Init
    for (let a = 0; a < 360; a += 1) {
      const start = (a - 1) * Math.PI / 180;
      const end = a * Math.PI / 180;
      ctx.beginPath();
      ctx.strokeStyle = `hsl(${a}, 100%, 50%)`;
      ctx.lineWidth = rOuter - rInner;
      ctx.arc(cx, cy, (rOuter + rInner) / 2, start, end);
      ctx.stroke();
    }

    // Init: pointer
    const ang = (wheelHue - 90) * Math.PI / 180;
    const px = cx + Math.cos(ang) * ((rOuter + rInner) / 2);
    const py = cy + Math.sin(ang) * ((rOuter + rInner) / 2);
    ctx.beginPath();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2;
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Triangle coordinates in svTriangle canvas
  function triPoints() {
    const w = svTriangle.width, h = svTriangle.height;
    const pad = 10;
    const A = { x: w / 2, y: pad };           // Top
    const B = { x: pad, y: h - pad };         // Bottom-left
    const C = { x: w - pad, y: h - pad };     // Bottom-right
    return { A, B, C };
  }

  function pointInTriangle(P, A, B, C) {
    const area = (p1, p2, p3) => (p1.x*(p2.y-p3.y)+p2.x*(p3.y-p1.y)+p3.x*(p1.y-p2.y));
    const s = area(P, A, B);
    const t = area(P, B, C);
    const u = area(P, C, A);
    const hasNeg = (s < 0) || (t < 0) || (u < 0);
    const hasPos = (s > 0) || (t > 0) || (u > 0);
    return !(hasNeg && hasPos);
  }

  // Map triangle point -> (S,V) approx (barycentric blend between white, hueColor, black)
  function triangleToSV(P) {
    const ctx = svTriangle.getContext('2d');
    const img = ctx.getImageData(P.x, P.y, 1, 1).data;
    const hex = rgbaToHex(img[0], img[1], img[2]);
    return hex;
  }

  function drawSVTriangle() {
    const ctx = svTriangle.getContext('2d', { willReadFrequently: true });
    const w = svTriangle.width, h = svTriangle.height;

    ctx.clearRect(0, 0, w, h);

    const { A, B, C } = triPoints();
    const [hr, hg, hb] = hsvToRgb(wheelHue, 1, 1);

    // Init: draw triangle pixels (simple but accurate)
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const P = { x, y };
        if (!pointInTriangle(P, A, B, C)) continue;

        // Init: barycentric weights
        const denom = ((B.y - C.y) * (A.x - C.x) + (C.x - B.x) * (A.y - C.y));
        const w1 = ((B.y - C.y) * (P.x - C.x) + (C.x - B.x) * (P.y - C.y)) / denom; // A
        const w2 = ((C.y - A.y) * (P.x - C.x) + (A.x - C.x) * (P.y - C.y)) / denom; // B
        const w3 = 1 - w1 - w2; // C

        // A = white, B = hueColor, C = black
        const r = clamp(Math.round(w1 * 255 + w2 * hr + w3 * 0), 0, 255);
        const g = clamp(Math.round(w1 * 255 + w2 * hg + w3 * 0), 0, 255);
        const b = clamp(Math.round(w1 * 255 + w2 * hb + w3 * 0), 0, 255);

        const idx = (y * w + x) * 4;
        img.data[idx] = r;
        img.data[idx + 1] = g;
        img.data[idx + 2] = b;
        img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // Init: triangle border
    ctx.save();
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.65)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(B.x, B.y);
    ctx.lineTo(C.x, C.y);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // Init: picker dot from current preview color (approx by scanning a small neighborhood)
    // (We keep it simple: no reverse mapping; dot snaps on click.)
  }

  function openWheel() {
    wheelPanel.style.display = 'block';
    drawHueRing();
    drawSVTriangle();
    updateWheelPreview();
  }

  function closeWheelPanel() {
    wheelPanel.style.display = 'none';
  }

  toggleWheel.addEventListener('click', () => {
    const isOpen = wheelPanel.style.display !== 'none';
    if (isOpen) closeWheelPanel();
    else openWheel();
  });

  closeWheel.addEventListener('click', closeWheelPanel);

  wheelSetBtn.addEventListener('click', () => {
    brushColorInput.value = wheelPreviewHex;
    addRecentColor(wheelPreviewHex);
  });

  hueRing.addEventListener('mousedown', (e) => {
    const r = hueRing.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const cx = r.width / 2;
    const cy = r.height / 2;
    const ang = Math.atan2(y - cy, x - cx); // -pi..pi
    let deg = (ang * 180 / Math.PI) + 90;
    if (deg < 0) deg += 360;
    wheelHue = deg;
    drawHueRing();
    drawSVTriangle();
    updateWheelPreview();
  });

  svTriangle.addEventListener('mousedown', (e) => {
    const r = svTriangle.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) * (svTriangle.width / r.width));
    const y = Math.floor((e.clientY - r.top) * (svTriangle.height / r.height));

    // Init: sample triangle pixel
    const hex = triangleToSV({ x, y });
    wheelPreviewHex = hex;
    wheelChip.style.background = wheelPreviewHex;
    wheelHex.textContent = wheelPreviewHex.toUpperCase();
  });

  // Init
  updateWheelPreview();

  // =========================
  // Init: Dark mode toggle button already handled above
  // =========================

  // =========================
  // Init: Tool defaults
  // =========================
  if (shapeOptionsDiv) shapeOptionsDiv.style.display = (currentTool === 'shape') ? 'inline-block' : 'none';
  brushSizeValue.textContent = brushSizeInput.value;
  opacityValue.textContent = opacityInput.value;
  brushSpacingValue.textContent = brushSpacingInput.value;
});

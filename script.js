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

  // Wheels UI
  const wheelPanel = document.getElementById('wheelPanel');
  const toggleWheel = document.getElementById('toggleWheel');
  const closeWheel = document.getElementById('closeWheel');
  const wheelChip = document.getElementById('wheelChip');
  const wheelHex = document.getElementById('wheelHex');
  const wheelSetBtn = document.getElementById('wheelSetBtn');

  // Triangle wheel
  const hueRing = document.getElementById('hueRing');
  const svTriangle = document.getElementById('svTriangle');

  // Circular wheel
  const circularWheel = document.getElementById('circularWheel');
  const valueSlider = document.getElementById('valueSlider');
  const circularWrap = document.getElementById('circularWrap');
  const triangleWrap = document.getElementById('triangleWrap');
  const wheelTabCircular = document.getElementById('wheelTabCircular');
  const wheelTabTriangle = document.getElementById('wheelTabTriangle');

  // =========================
  // Init: Constants + State
  // =========================
  const CANVAS_W = 800;
  const CANVAS_H = 600;

  const MAX_LAYERS = 10;

  // Unified history (supports layer draw + structural ops)
  const HISTORY_MAX = 80;
  let history = [];
  let future = [];

  let currentTool = toolSelect.value;
  let currentBrush = brushTypeSelect.value;

  let isPointerDown = false;
  let lastX = 0;
  let lastY = 0;
  let lastStampX = null;
  let lastStampY = null;

  // Shapes
  let shapeActive = false;
  let shapeStart = null;
  let shapeBaseImage = null;

  // Selection (rect)
  let isSelecting = false;
  let selectStart = null;
  let selectRect = null;

  // Lasso
  let isLassoing = false;
  let lassoPoints = [];

  // Overlay transform object (selection/lasso/image)
  let overlayObj = null; // { srcCanvas, img, x, y, w, h, angle, kind }
  let baseLayerImageData = null; // ImageData for active layer "base under overlay"
  let transformMode = null; // 'move' | 'resize' | 'rotate'
  let activeHandle = null;
  let startMouse = { x: 0, y: 0 };
  let startState = null;

  // Crop
  let isCropping = false;
  let cropStart = null;
  let cropRect = null;

  // Recent colors
  let recentColors = [];

  // Wheels state
  let wheelMode = 'circular';
  let wheelPreviewHex = '#000000';

  let circHue = 0;
  let circSat = 1;
  let circVal = 1;

  let triHue = 0;
  let triS = 1;
  let triV = 1;

  // =========================
  // Init: Utilities
  // =========================
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

  function canvasPoint(evt) {
    const r = canvasContainer.getBoundingClientRect();
    return { x: evt.clientX - r.left, y: evt.clientY - r.top };
  }

  function mirroredX(x) { return CANVAS_W - x; }

  function spacingScale() {
    const v = parseInt(brushSpacingInput.value || '100', 10);
    return clamp(v, 25, 300) / 100;
  }

  function stampSpacingPx(brush, size) {
    const base =
      (brush === 'star' || brush === 'heart') ? Math.max(10, size * 1.9) :
      (brush === 'splatter') ? Math.max(9, size * 1.25) :
      (brush === 'scatter' || brush === 'glitter') ? Math.max(7, size * 1.05) :
      (brush === 'spray' || brush === 'airbrush') ? Math.max(3, size * 0.55) :
      (brush === 'crosshatch') ? Math.max(5, size * 0.9) :
      Math.max(4, size * 0.85);
    return base * spacingScale();
  }

  function hexToRgba(hex, opacity) {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16) || 0;
    const g = parseInt(h.slice(2, 4), 16) || 0;
    const b = parseInt(h.slice(4, 6), 16) || 0;
    return `rgba(${r},${g},${b},${opacity / 100})`;
  }

  function rgbaToHex(r, g, b) {
    const to2 = (n) => n.toString(16).padStart(2, '0');
    return `#${to2(r)}${to2(g)}${to2(b)}`;
  }

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

  function updateWheelPreviewFromHSV(h, s, v) {
    const [r, g, b] = hsvToRgb(h, s, v);
    wheelPreviewHex = rgbaToHex(r, g, b);
    wheelChip.style.background = wheelPreviewHex;
    wheelHex.textContent = wheelPreviewHex.toUpperCase();
  }

  function syncWheelPreview() {
    if (wheelMode === 'circular') updateWheelPreviewFromHSV(circHue, circSat, circVal);
    else updateWheelPreviewFromHSV(triHue, triS, triV);
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

  darkModeToggle?.addEventListener('click', () => {
    const isDark = document.body.classList.contains('dark');
    const next = isDark ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  });

  initTheme();

  // =========================
  // Init: Canvas sizes
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
  // Init: Recent colors
  // =========================
  function renderRecentColors() {
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

  function addRecentColor(color) {
    if (recentColors.includes(color)) return;
    recentColors.push(color);
    if (recentColors.length > 12) recentColors.shift();
    renderRecentColors();
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
  // Init: UI sync
  // =========================
  brushSizeInput.addEventListener('input', () => { brushSizeValue.textContent = brushSizeInput.value; });
  opacityInput.addEventListener('input', () => { opacityValue.textContent = opacityInput.value; });
  brushSpacingInput.addEventListener('input', () => { brushSpacingValue.textContent = brushSpacingInput.value; });

  brushTypeSelect.addEventListener('change', () => { currentBrush = brushTypeSelect.value; });

  toolSelect.addEventListener('change', () => {
    const nextTool = toolSelect.value;
    shapeOptionsDiv.style.display = (nextTool === 'shape') ? 'inline-block' : 'none';
    currentTool = nextTool;

    // Cancel interactions when switching tools
    stopAllModes();
  });

  backgroundPatternSelect.addEventListener('change', () => {
    canvasContainer.className = 'canvas-container ' + backgroundPatternSelect.value;
  });

  // =========================
  // Init: Layers core (buffer + display)
  // =========================
  const layers = [];
  let activeLayerIndex = 0;

  function newId() {
    return 'L' + Math.random().toString(16).slice(2) + Date.now().toString(16);
  }

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

  function createBufferCanvas() {
    const c = document.createElement('canvas');
    c.width = CANVAS_W;
    c.height = CANVAS_H;
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

    const buffer = createBufferCanvas();
    const bctx = buffer.getContext('2d', { willReadFrequently: true });

    return {
      id: newId(),
      index,
      name: defaultLayerName(index),
      canvas,
      ctx,
      buffer,
      bctx,
      enabled: true,
      visible: true,
      clip: false,      // Clip to layer below alpha
      fx: 'none'        // CSS visual effect on display canvas
    };
  }

  function activeLayer() { return layers[activeLayerIndex]; }

  function applyFxCss(layer) {
    layer.canvas.style.filter = layerFxToCss(layer.fx);
  }

  function setLayerVisibility(layer) {
    layer.canvas.style.display = (layer.visible && layer.enabled) ? 'block' : 'none';
  }

  function renderLayerDisplay(i) {
    const L = layers[i];
    if (!L) return;

    L.ctx.setTransform(1, 0, 0, 1, 0, 0);
    L.ctx.globalCompositeOperation = 'source-over';
    L.ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    if (L.clip && i > 0) {
      // Draw buffer then clip by below display alpha
      L.ctx.drawImage(L.buffer, 0, 0);
      L.ctx.globalCompositeOperation = 'destination-in';
      L.ctx.drawImage(layers[i - 1].canvas, 0, 0);
      L.ctx.globalCompositeOperation = 'source-over';
    } else {
      // Normal draw buffer to display
      L.ctx.drawImage(L.buffer, 0, 0);
    }

    applyFxCss(L);
    setLayerVisibility(L);
  }

  function refreshAllDisplays() {
    for (let i = 0; i < layers.length; i++) renderLayerDisplay(i);
  }

  // Init base layer
  layers.push(newLayerObject(0));
  refreshAllDisplays();

  // =========================
  // Init: History (undo/redo)
  // =========================
  function snapshotProject() {
    // Includes all layer buffers and metadata, plus active index
    const snap = {
      activeLayerIndex,
      layers: layers.map(L => ({
        id: L.id,
        name: L.name,
        visible: L.visible,
        enabled: L.enabled,
        clip: L.clip,
        fx: L.fx,
        dataUrl: L.buffer.toDataURL('image/png')
      }))
    };
    return snap;
  }

  function restoreProject(snap) {
    // Remove old canvases
    layers.forEach(L => L.canvas.remove());
    layers.length = 0;

    // Rebuild layers
    snap.layers.forEach((s, i) => {
      const L = newLayerObject(i);
      L.id = s.id;
      L.name = s.name;
      L.visible = s.visible;
      L.enabled = s.enabled;
      L.clip = s.clip;
      L.fx = s.fx;

      layers.push(L);

      const img = new Image();
      img.onload = () => {
        L.bctx.setTransform(1, 0, 0, 1, 0, 0);
        L.bctx.globalCompositeOperation = 'source-over';
        L.bctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
        L.bctx.drawImage(img, 0, 0);
        renderLayerDisplay(i);
      };
      img.src = s.dataUrl;
    });

    activeLayerIndex = clamp(snap.activeLayerIndex, 0, snap.layers.length - 1);
    renderLayersUI();
    stopAllModes();
  }

  function pushHistory() {
    future = [];
    history.push(snapshotProject());
    if (history.length > HISTORY_MAX) history.shift();
  }

  function undo() {
    if (history.length <= 1) return;
    const cur = history.pop();
    future.push(cur);
    const prev = history[history.length - 1];
    restoreProject(prev);
  }

  function redo() {
    if (!future.length) return;
    const next = future.pop();
    history.push(next);
    restoreProject(next);
  }

  // Seed history initial
  pushHistory();

  // =========================
  // Init: Layers UI
  // =========================
  function renderLayersUI() {
    layersList.innerHTML = '';

    // Newest on top in UI
    for (let idx = layers.length - 1; idx >= 0; idx--) {
      const L = layers[idx];

      const row = document.createElement('div');
      row.className = 'layer-row' + (idx === activeLayerIndex ? ' active' : '');

      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'activeLayerRadio';
      radio.checked = idx === activeLayerIndex;
      radio.title = 'Active layer';
      radio.addEventListener('change', () => {
        activeLayerIndex = idx;
        renderLayersUI();
        stopAllModes();
      });

      const vis = document.createElement('input');
      vis.type = 'checkbox';
      vis.checked = L.visible;
      vis.title = 'Visibility';
      vis.addEventListener('change', () => {
        pushHistory();
        L.visible = vis.checked;
        setLayerVisibility(L);
      });

      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = L.name;

      const actions = document.createElement('div');
      actions.className = 'layer-actions';

      const left = document.createElement('div');
      left.className = 'left';

      const right = document.createElement('div');
      right.className = 'right';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'icon-btn';
      editBtn.setAttribute('data-tip', 'Rename');
      editBtn.setAttribute('aria-label', 'Rename');
      editBtn.textContent = '✏️';
      editBtn.addEventListener('click', () => {
        const prev = L.name;
        const next = prompt('Layer name:', prev);
        if (!next) return;
        pushHistory();
        L.name = next;
        renderLayersUI();
      });

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'icon-btn';
      delBtn.setAttribute('data-tip', 'Delete Layer');
      delBtn.setAttribute('aria-label', 'Delete Layer');
      delBtn.textContent = '🗑️';
      delBtn.disabled = (layers.length <= 1);
      delBtn.addEventListener('click', () => {
        if (layers.length <= 1) return;
        pushHistory();

        layers[idx].canvas.remove();
        layers.splice(idx, 1);

        layers.forEach((layer, i) => {
          layer.index = i;
          layer.canvas.style.zIndex = String(2 + i);
        });

        activeLayerIndex = clamp(activeLayerIndex, 0, layers.length - 1);
        refreshAllDisplays();
        renderLayersUI();
        stopAllModes();
      });

      const clipToggle = document.createElement('select');
      const optA = document.createElement('option');
      optA.value = 'off';
      optA.textContent = 'Clip: Off';
      const optB = document.createElement('option');
      optB.value = 'on';
      optB.textContent = 'Clip: On';
      clipToggle.appendChild(optA);
      clipToggle.appendChild(optB);
      clipToggle.value = L.clip ? 'on' : 'off';
      clipToggle.disabled = (idx === 0);
      clipToggle.addEventListener('change', () => {
        pushHistory();
        L.clip = (clipToggle.value === 'on');
        renderLayerDisplay(idx);
      });

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
        pushHistory();
        L.fx = fxSel.value;
        applyFxCss(L);
      });

      left.appendChild(editBtn);
      left.appendChild(delBtn);

      right.appendChild(clipToggle);
      right.appendChild(fxSel);

      actions.appendChild(left);
      actions.appendChild(right);

      row.appendChild(radio);
      row.appendChild(vis);
      row.appendChild(name);
      row.appendChild(actions);

      layersList.appendChild(row);
    }

    mergeLayerBtn.disabled = !(activeLayerIndex > 0);
    addLayerBtn.disabled = !(layers.length < MAX_LAYERS);
  }

  function addLayer() {
    if (layers.length >= MAX_LAYERS) return;
    pushHistory();

    const idx = layers.length;
    const L = newLayerObject(idx);
    layers.push(L);

    activeLayerIndex = layers.length - 1;
    refreshAllDisplays();
    renderLayersUI();
    stopAllModes();
  }

  function mergeDown() {
    if (activeLayerIndex <= 0) return;
    pushHistory();

    const top = layers[activeLayerIndex];
    const bottom = layers[activeLayerIndex - 1];

    bottom.bctx.save();
    bottom.bctx.globalCompositeOperation = 'source-over';
    bottom.bctx.drawImage(top.buffer, 0, 0);
    bottom.bctx.restore();

    top.canvas.remove();
    layers.splice(activeLayerIndex, 1);

    layers.forEach((layer, i) => {
      layer.index = i;
      layer.canvas.style.zIndex = String(2 + i);
    });

    activeLayerIndex = Math.max(0, activeLayerIndex - 1);
    refreshAllDisplays();
    renderLayersUI();
    stopAllModes();
  }

  addLayerBtn.addEventListener('click', addLayer);
  mergeLayerBtn.addEventListener('click', mergeDown);

  renderLayersUI();

  // =========================
  // Init: Modes reset helpers
  // =========================
  function hideSelection() {
    selectionOverlay.style.display = 'none';
    selectRect = null;
  }

  function showSelectionRect(r) {
    selectionOverlay.style.display = 'block';
    selectionOverlay.style.left = r.x + 'px';
    selectionOverlay.style.top = r.y + 'px';
    selectionOverlay.style.width = r.w + 'px';
    selectionOverlay.style.height = r.h + 'px';
  }

  function clearLassoOverlay() {
    lassoCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  }

  function resetLasso() {
    isLassoing = false;
    lassoPoints = [];
    clearLassoOverlay();
  }

  function resetTransform() {
    overlayObj = null;
    baseLayerImageData = null;
    transformMode = null;
    activeHandle = null;
    startState = null;
    transformBox.style.display = 'none';
  }

  function resetCrop() {
    isCropping = false;
    cropStart = null;
    cropRect = null;
    cropOverlay.style.display = 'none';
  }

  function resetShapes() {
    shapeActive = false;
    shapeStart = null;
    shapeBaseImage = null;
  }

  function stopAllModes() {
    isPointerDown = false;
    isSelecting = false;
    resetLasso();
    resetTransform();
    resetCrop();
    resetShapes();
    hideSelection();
  }

  // =========================
  // Init: Transform rendering
  // =========================
  function renderOverlayToActiveLayer() {
    if (!overlayObj || !baseLayerImageData) return;

    const L = activeLayer();

    // Restore base (buffer)
    L.bctx.putImageData(baseLayerImageData, 0, 0);

    // Draw overlay on top (buffer)
    L.bctx.save();
    L.bctx.translate(overlayObj.x, overlayObj.y);
    L.bctx.rotate(overlayObj.angle || 0);
    L.bctx.drawImage(overlayObj.srcCanvas, 0, 0, overlayObj.w, overlayObj.h);
    L.bctx.restore();

    renderLayerDisplay(activeLayerIndex);
  }

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

  function commitOverlay() {
    if (!overlayObj || !baseLayerImageData) return;
    // Already rendered into buffer on last move; just finalize by clearing base snapshot
    baseLayerImageData = null;
    overlayObj = null;
    updateTransformBox();
  }

  // Double click transform box commits
  transformBox.addEventListener('dblclick', () => {
    if (currentTool === 'transform') commitOverlay();
  });

  // =========================
  // Init: Brush behavior (more distinct)
  // =========================
  function brushParams() {
    const size = clamp(parseInt(brushSizeInput.value || '10', 10), 1, 200);
    const opacity = clamp(parseFloat(opacityInput.value || '100'), 0, 100);
    const color = brushColorInput.value || '#000000';
    return { size, opacity, color };
  }

  function setDrawComposite(ctx, tool) {
    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.fillStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  function drawStar(ctx, cx, cy, spikes, outerRadius, innerRadius) {
    let rot = (Math.PI / 2) * 3;
    let x = cx;
    let y = cy;
    const step = Math.PI / spikes;

    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
      x = cx + Math.cos(rot) * outerRadius;
      y = cy + Math.sin(rot) * outerRadius;
      ctx.lineTo(x, y);
      rot += step;

      x = cx + Math.cos(rot) * innerRadius;
      y = cy + Math.sin(rot) * innerRadius;
      ctx.lineTo(x, y);
      rot += step;
    }
    ctx.closePath();
    ctx.fill();
  }

  function drawHeart(ctx, cx, cy, size) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(0, -size * 0.35, -size, -size * 0.35, -size, 0);
    ctx.bezierCurveTo(-size, size * 0.55, 0, size, 0, size * 1.25);
    ctx.bezierCurveTo(0, size, size, size * 0.55, size, 0);
    ctx.bezierCurveTo(size, -size * 0.35, 0, -size * 0.35, 0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function stampBrush(ctx, x, y, params, brush) {
    const { size, opacity, color } = params;

    ctx.save();
    setDrawComposite(ctx, currentTool);

    const alpha = opacity / 100;
    ctx.fillStyle = hexToRgba(color, opacity);
    ctx.strokeStyle = hexToRgba(color, opacity);

    if (brush === 'square') {
      ctx.fillRect(x - size / 2, y - size / 2, size, size);
    } else if (brush === 'dotted') {
      ctx.beginPath();
      ctx.arc(x, y, size / 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (brush === 'spray') {
      const dots = 36;
      for (let i = 0; i < dots; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * size * 1.2;
        ctx.globalAlpha = alpha * (0.25 + Math.random() * 0.55);
        ctx.fillRect(x + Math.cos(a) * r, y + Math.sin(a) * r, 1, 1);
      }
      ctx.globalAlpha = 1;
    } else if (brush === 'airbrush') {
      const dots = 80;
      for (let i = 0; i < dots; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * size * 1.8;
        const falloff = 1 - (r / (size * 1.8));
        ctx.globalAlpha = alpha * falloff * 0.35;
        ctx.fillRect(x + Math.cos(a) * r, y + Math.sin(a) * r, 1, 1);
      }
      ctx.globalAlpha = 1;
    } else if (brush === 'splatter') {
      const blobs = 18;
      for (let i = 0; i < blobs; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * size * 1.4;
        const rr = Math.max(1, size * (0.06 + Math.random() * 0.18));
        ctx.globalAlpha = alpha * (0.35 + Math.random() * 0.5);
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, rr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if (brush === 'glitter') {
      const n = 14;
      for (let i = 0; i < n; i++) {
        ctx.globalAlpha = alpha * (0.2 + Math.random() * 0.8);
        ctx.fillRect(x + (Math.random() - 0.5) * size, y + (Math.random() - 0.5) * size, 2, 2);
      }
      ctx.globalAlpha = 1;
    } else if (brush === 'scatter') {
      const n = 6;
      for (let i = 0; i < n; i++) {
        const rr = Math.max(1, size * 0.18);
        ctx.globalAlpha = alpha * (0.2 + Math.random() * 0.6);
        ctx.beginPath();
        ctx.arc(x + (Math.random() - 0.5) * size, y + (Math.random() - 0.5) * size, rr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if (brush === 'marker') {
      ctx.globalAlpha = alpha * 0.55;
      ctx.beginPath();
      ctx.arc(x, y, size * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (brush === 'ink') {
      // Sharper, slightly variable
      ctx.globalAlpha = alpha * 0.9;
      ctx.beginPath();
      ctx.arc(x, y, size * (0.38 + Math.random() * 0.15), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (brush === 'fountain') {
      ctx.globalAlpha = alpha * 0.85;
      ctx.beginPath();
      ctx.ellipse(x, y, size * 0.7, size * 0.25, (Math.random() - 0.5) * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (brush === 'pencil') {
      ctx.globalAlpha = alpha * 0.45;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(x + (Math.random() - 0.5) * 2, y + (Math.random() - 0.5) * 2, size * 0.16, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if (brush === 'sketch') {
      ctx.globalAlpha = alpha * 0.35;
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.moveTo(x + (Math.random() - 0.5) * size, y + (Math.random() - 0.5) * size);
        ctx.lineTo(x + (Math.random() - 0.5) * size, y + (Math.random() - 0.5) * size);
        ctx.lineWidth = Math.max(1, size * 0.12);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else if (brush === 'graphite') {
      ctx.globalAlpha = alpha * 0.25;
      const n = 22;
      for (let i = 0; i < n; i++) {
        ctx.fillRect(x + (Math.random() - 0.5) * size, y + (Math.random() - 0.5) * size, 1, 1);
      }
      ctx.globalAlpha = 1;
    } else if (brush === 'charcoal') {
      ctx.globalAlpha = alpha * 0.22;
      ctx.beginPath();
      ctx.arc(x, y, size * 0.75, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = alpha * 0.12;
      ctx.beginPath();
      ctx.arc(x + (Math.random() - 0.5) * 3, y + (Math.random() - 0.5) * 3, size * 0.95, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (brush === 'crosshatch') {
      ctx.globalAlpha = alpha * 0.35;
      ctx.lineWidth = Math.max(1, size * 0.12);
      for (let i = 0; i < 3; i++) {
        const len = size * (0.7 + Math.random() * 0.7);
        const ang = (Math.random() * Math.PI) + (i * Math.PI / 3);
        ctx.beginPath();
        ctx.moveTo(x - Math.cos(ang) * len, y - Math.sin(ang) * len);
        ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else if (brush === 'chalk') {
      ctx.globalAlpha = alpha * 0.25;
      for (let i = 0; i < 10; i++) {
        const rr = Math.max(1, size * 0.22);
        ctx.beginPath();
        ctx.arc(x + (Math.random() - 0.5) * size, y + (Math.random() - 0.5) * size, rr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if (brush === 'watercolor') {
      ctx.globalAlpha = alpha * 0.18;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(x + (Math.random() - 0.5) * (size * 0.5), y + (Math.random() - 0.5) * (size * 0.5), size * (0.8 + Math.random() * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if (brush === 'oil') {
      ctx.globalAlpha = alpha * 0.55;
      ctx.beginPath();
      ctx.arc(x, y, size * 0.75, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (brush === 'crayon') {
      ctx.globalAlpha = alpha * 0.4;
      for (let i = 0; i < 12; i++) {
        ctx.fillRect(x + (Math.random() - 0.5) * size, y + (Math.random() - 0.5) * size, 1, 2);
      }
      ctx.globalAlpha = 1;
    } else if (brush === 'star') {
      // Spaced stamping
      ctx.globalAlpha = alpha * 0.9;
      drawStar(ctx, x, y, 5, size * 0.9, size * 0.42);
      ctx.globalAlpha = 1;
    } else if (brush === 'heart') {
      ctx.globalAlpha = alpha * 0.9;
      drawHeart(ctx, x, y, size * 0.7);
      ctx.globalAlpha = 1;
    } else {
      // round fallback
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(x, y, size / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  function lineBrush(ctx, x0, y0, x1, y1, params) {
    const { size, opacity, color } = params;

    ctx.save();
    setDrawComposite(ctx, currentTool);

    // Very distinct line-only ones
    if (currentBrush === 'round') {
      ctx.strokeStyle = hexToRgba(color, opacity);
      ctx.lineWidth = size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.restore();
      return;
    }

    // Default: stamp along the path with spacing
    const sp = stampSpacingPx(currentBrush, size);
    if (lastStampX == null) { lastStampX = x0; lastStampY = y0; }

    const d = dist(lastStampX, lastStampY, x1, y1);
    if (d < sp) { ctx.restore(); return; }

    const steps = Math.max(1, Math.floor(d / sp));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const sx = lastStampX + (x1 - lastStampX) * t;
      const sy = lastStampY + (y1 - lastStampY) * t;
      stampBrush(ctx, sx, sy, params, currentBrush);
    }

    lastStampX = x1;
    lastStampY = y1;

    ctx.restore();
  }

  // =========================
  // Init: Fill tool (tolerance + outline-underfill)
  // =========================
  function getPixel(data, i) {
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  }

  function setPixel(data, i, rgba) {
    data[i] = rgba[0];
    data[i + 1] = rgba[1];
    data[i + 2] = rgba[2];
    data[i + 3] = rgba[3];
  }

  function hexToRgbaArray(hex, opacity) {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16) || 0;
    const g = parseInt(h.slice(2, 4), 16) || 0;
    const b = parseInt(h.slice(4, 6), 16) || 0;
    const a = Math.round((opacity / 100) * 255);
    return [r, g, b, a];
  }

  function colorDist(a, b) {
    // RGB + alpha weighted
    const dr = a[0] - b[0];
    const dg = a[1] - b[1];
    const db = a[2] - b[2];
    const da = (a[3] - b[3]) * 0.5;
    return Math.sqrt(dr * dr + dg * dg + db * db + da * da);
  }

  function floodFillWithTolerance(ctx, sx, sy, fillRgba, tolerance = 34) {
    const w = CANVAS_W;
    const h = CANVAS_H;

    const img = ctx.getImageData(0, 0, w, h);
    const data = img.data;

    const startIdx = (sy * w + sx) * 4;
    const target = getPixel(data, startIdx);

    // If already same-ish, skip
    if (colorDist(target, fillRgba) < 2) return;

    const stack = [[sx, sy]];
    const visited = new Uint8Array(w * h);

    const inBounds = (x, y) => x >= 0 && y >= 0 && x < w && y < h;

    while (stack.length) {
      const [x, y] = stack.pop();
      const pos = y * w + x;
      if (visited[pos]) continue;
      visited[pos] = 1;

      const i = pos * 4;
      const cur = getPixel(data, i);

      // tolerance match to target
      if (colorDist(cur, target) > tolerance) continue;

      setPixel(data, i, fillRgba);

      // 4-way
      if (inBounds(x + 1, y)) stack.push([x + 1, y]);
      if (inBounds(x - 1, y)) stack.push([x - 1, y]);
      if (inBounds(x, y + 1)) stack.push([x, y + 1]);
      if (inBounds(x, y - 1)) stack.push([x, y - 1]);

      // “under outline” feel: also nudge diagonals to reduce tiny holes
      if (inBounds(x + 1, y + 1)) stack.push([x + 1, y + 1]);
      if (inBounds(x - 1, y + 1)) stack.push([x - 1, y + 1]);
      if (inBounds(x + 1, y - 1)) stack.push([x + 1, y - 1]);
      if (inBounds(x - 1, y - 1)) stack.push([x - 1, y - 1]);
    }

    ctx.putImageData(img, 0, 0);
  }

  // =========================
  // Init: Select/Lasso extraction (hi quality, no duplicate)
  // =========================
  function extractRectFromActiveLayer(rect) {
    const L = activeLayer();

    const x = Math.floor(rect.x);
    const y = Math.floor(rect.y);
    const w = Math.max(1, Math.floor(rect.w));
    const h = Math.max(1, Math.floor(rect.h));

    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const offCtx = off.getContext('2d', { willReadFrequently: true });

    // Copy pixels from buffer (no scaling => no quality loss)
    const imgData = L.bctx.getImageData(x, y, w, h);
    offCtx.putImageData(imgData, 0, 0);

    // Clear area in buffer (cut)
    L.bctx.clearRect(x, y, w, h);

    // Snapshot base under overlay
    baseLayerImageData = L.bctx.getImageData(0, 0, CANVAS_W, CANVAS_H);

    // Overlay object
    overlayObj = {
      srcCanvas: off,
      x, y, w, h,
      angle: 0,
      kind: 'selection'
    };

    // Switch to transform
    toolSelect.value = 'transform';
    currentTool = 'transform';

    updateTransformBox();
    renderOverlayToActiveLayer();
    renderLayersUI();
  }

  function drawLassoOverlay(points, previewPoint = null) {
    clearLassoOverlay();
    if (!points.length) return;

    const pathPoints = previewPoint ? [...points, previewPoint] : points;

    lassoCtx.save();
    lassoCtx.strokeStyle = '#22c55e';
    lassoCtx.fillStyle = 'rgba(34, 197, 94, 0.12)';
    lassoCtx.lineWidth = 1.5;
    lassoCtx.setLineDash([6, 4]);

    lassoCtx.beginPath();
    pathPoints.forEach((p, i) => {
      if (i === 0) lassoCtx.moveTo(p.x, p.y);
      else lassoCtx.lineTo(p.x, p.y);
    });

    if (!previewPoint && pathPoints.length > 2) lassoCtx.closePath();
    lassoCtx.stroke();
    if (pathPoints.length > 2) lassoCtx.fill();

    lassoCtx.restore();
  }

  function finalizeLassoSelection() {
    if (lassoPoints.length < 3) { resetLasso(); return; }

    const xs = lassoPoints.map(p => p.x);
    const ys = lassoPoints.map(p => p.y);

    const bounds = {
      x: Math.floor(Math.min(...xs)),
      y: Math.floor(Math.min(...ys)),
      w: Math.max(1, Math.ceil(Math.max(...xs) - Math.min(...xs))),
      h: Math.max(1, Math.ceil(Math.max(...ys) - Math.min(...ys)))
    };

    const L = activeLayer();

    // Offscreen to capture lasso pixels (hi quality)
    const off = document.createElement('canvas');
    off.width = bounds.w;
    off.height = bounds.h;
    const offCtx = off.getContext('2d', { willReadFrequently: true });

    // Create lasso path relative to bounds
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

    // Draw from active buffer into clipped area (no scaling)
    offCtx.drawImage(L.buffer, -bounds.x, -bounds.y);
    offCtx.restore();

    // Cut out from active buffer using the SAME lasso path (prevents duplicates)
    L.bctx.save();
    L.bctx.beginPath();
    lassoPoints.forEach((p, i) => {
      if (i === 0) L.bctx.moveTo(p.x, p.y);
      else L.bctx.lineTo(p.x, p.y);
    });
    L.bctx.closePath();
    L.bctx.clip();
    L.bctx.clearRect(bounds.x, bounds.y, bounds.w, bounds.h);
    L.bctx.restore();

    baseLayerImageData = L.bctx.getImageData(0, 0, CANVAS_W, CANVAS_H);

    overlayObj = {
      srcCanvas: off,
      x: bounds.x,
      y: bounds.y,
      w: bounds.w,
      h: bounds.h,
      angle: 0,
      kind: 'lasso'
    };

    // Switch to transform
    toolSelect.value = 'transform';
    currentTool = 'transform';

    updateTransformBox();
    renderOverlayToActiveLayer();
    renderLayersUI();
    resetLasso();
  }

  // =========================
  // Init: Shapes
  // =========================
  function drawShapePreview(ctx, type, x0, y0, x1, y1, params) {
    const { size, opacity, color } = params;

    ctx.save();
    setDrawComposite(ctx, 'pen');
    ctx.strokeStyle = hexToRgba(color, opacity);
    ctx.lineWidth = size;
    ctx.setLineDash([]);

    const w = x1 - x0;
    const h = y1 - y0;

    if (type === 'line' || type === 'dottedLine') {
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      if (type === 'dottedLine') ctx.setLineDash([2, 6]);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    } else if (type === 'rectangle' || type === 'dottedRectangle') {
      if (type === 'dottedRectangle') ctx.setLineDash([2, 6]);
      ctx.strokeRect(x0, y0, w, h);
    } else if (type === 'circle') {
      const r = Math.sqrt(w * w + h * h);
      ctx.beginPath();
      ctx.arc(x0, y0, r, 0, Math.PI * 2);
      ctx.stroke();
    } else if (type === 'ellipse') {
      ctx.beginPath();
      ctx.ellipse(x0 + w / 2, y0 + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (type === 'star') {
      ctx.fillStyle = hexToRgba(color, opacity);
      drawStar(ctx, x0, y0, 5, Math.max(Math.abs(w), Math.abs(h)), Math.max(Math.abs(w), Math.abs(h)) / 2);
    } else if (type === 'heart') {
      ctx.fillStyle = hexToRgba(color, opacity);
      drawHeart(ctx, x0, y0, Math.max(Math.abs(w), Math.abs(h)));
    }

    ctx.restore();
  }

  // =========================
  // Init: Text tool
  // =========================
  function addTextAt(x, y) {
    pushHistory();

    const L = activeLayer();
    const params = brushParams();
    const text = prompt('Enter text (Use \\n for new lines):', 'Text');
    if (!text) return;

    const size = Math.max(10, params.size);
    const opacity = params.opacity;
    const color = params.color;

    L.bctx.save();
    setDrawComposite(L.bctx, 'pen');
    L.bctx.fillStyle = hexToRgba(color, opacity);
    L.bctx.textBaseline = 'top';
    L.bctx.font = `${size}px Arial`;

    const lines = String(text).split('\n');
    const lineHeight = Math.round(size * 1.2);

    for (let i = 0; i < lines.length; i++) {
      L.bctx.fillText(lines[i], x, y + i * lineHeight);
    }

    L.bctx.restore();
    renderLayerDisplay(activeLayerIndex);
  }

  // =========================
  // Init: Crop tool (on overlay)
  // =========================
  function cropOverlayToRect(ix1, iy1, iw, ih) {
    if (!overlayObj) return;

    // Crop area is in canvas coords, overlay is non-rotated required
    if (Math.abs(overlayObj.angle || 0) > 0.0001) {
      alert('Crop supports only non-rotated overlay. Set rotation to 0 first.');
      return;
    }

    const ox = overlayObj.x;
    const oy = overlayObj.y;

    const rx = ix1 - ox;
    const ry = iy1 - oy;

    const sx = clamp(Math.round(rx), 0, overlayObj.w);
    const sy = clamp(Math.round(ry), 0, overlayObj.h);
    const sw = clamp(Math.round(iw), 1, overlayObj.w - sx);
    const sh = clamp(Math.round(ih), 1, overlayObj.h - sy);

    const off = document.createElement('canvas');
    off.width = sw;
    off.height = sh;
    const offCtx = off.getContext('2d', { willReadFrequently: true });

    offCtx.drawImage(overlayObj.srcCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

    overlayObj.srcCanvas = off;
    overlayObj.x = ix1;
    overlayObj.y = iy1;
    overlayObj.w = sw;
    overlayObj.h = sh;
    overlayObj.angle = 0;

    updateTransformBox();
    renderOverlayToActiveLayer();
  }

  // =========================
  // Init: Clear canvas (undoable)
  // =========================
  clearCanvasButton.addEventListener('click', () => {
    pushHistory();
    const L = activeLayer();
    L.bctx.setTransform(1, 0, 0, 1, 0, 0);
    L.bctx.globalCompositeOperation = 'source-over';
    L.bctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    renderLayerDisplay(activeLayerIndex);
    stopAllModes();
  });

  // =========================
  // Init: Undo / Redo
  // =========================
  undoCanvasButton.addEventListener('click', undo);
  redoCanvasButton.addEventListener('click', redo);

  // =========================
  // Init: Flip active layer (undoable)
  // =========================
  function flipActiveLayer() {
    pushHistory();
    const L = activeLayer();

    const off = document.createElement('canvas');
    off.width = CANVAS_W;
    off.height = CANVAS_H;
    const offCtx = off.getContext('2d');
    offCtx.drawImage(L.buffer, 0, 0);

    L.bctx.save();
    L.bctx.setTransform(-1, 0, 0, 1, CANVAS_W, 0);
    L.bctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    L.bctx.drawImage(off, 0, 0);
    L.bctx.restore();

    renderLayerDisplay(activeLayerIndex);
  }

  flipCanvasButton.addEventListener('click', flipActiveLayer);

  // =========================
  // Init: Download (flatten)
  // =========================
  function getExportBackgroundFill(format) {
    if (format === 'png-transparent') return null;
    const selected = backgroundPatternSelect ? backgroundPatternSelect.value : 'plain';
    if (selected === 'dark') return '#000000';
    if (selected === 'plain') return '#ffffff';

    const computed = getComputedStyle(canvasContainer).backgroundColor;
    if (computed && computed !== 'rgba(0, 0, 0, 0)' && computed !== 'transparent') return computed;
    return '#ffffff';
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

    // Draw visible display canvases in order (already include clip + fx visually)
    for (let i = 0; i < layers.length; i++) {
      if (!layers[i].visible) continue;
      exportCtx.drawImage(layers[i].canvas, 0, 0);
    }

    return exportCanvas;
  }

  function getDownloadDataUrl(format) {
    const fill = getExportBackgroundFill(format);
    const exportCanvas = buildExportCanvas(fill);

    if (format === 'jpg' || format === 'jpeg') return exportCanvas.toDataURL('image/jpeg', 0.92);
    return exportCanvas.toDataURL('image/png');
  }

  function getDownloadFilename(format) {
    const ext = format === 'png-transparent' ? 'png' : format;
    return `DrawNow_art.${ext}`;
  }

  downloadCanvasButton.addEventListener('click', () => {
    const format = downloadFormatSelect ? downloadFormatSelect.value : 'png';
    const link = document.createElement('a');
    link.download = getDownloadFilename(format);
    link.href = getDownloadDataUrl(format);
    link.click();
  });

  // =========================
  // Init: Add image (as transform overlay)
  // =========================
  addImageButton.addEventListener('click', () => addImageInput.click());

  addImageInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        pushHistory();
        stopAllModes();

        // Put image into overlay canvas at native-ish scale
        const scale = Math.min(CANVAS_W / img.width, CANVAS_H / img.height, 1);
        const w = Math.floor(img.width * scale);
        const h = Math.floor(img.height * scale);
        const x = Math.floor((CANVAS_W - w) / 2);
        const y = Math.floor((CANVAS_H - h) / 2);

        const off = document.createElement('canvas');
        off.width = w;
        off.height = h;
        const offCtx = off.getContext('2d');
        offCtx.drawImage(img, 0, 0, w, h);

        const L = activeLayer();
        baseLayerImageData = L.bctx.getImageData(0, 0, CANVAS_W, CANVAS_H);

        overlayObj = { srcCanvas: off, x, y, w, h, angle: 0, kind: 'image' };

        toolSelect.value = 'transform';
        currentTool = 'transform';

        updateTransformBox();
        renderOverlayToActiveLayer();
      };
      img.src = reader.result;
    };

    reader.readAsDataURL(file);
    addImageInput.value = '';
  });

  // =========================
  // Init: Color wheels panel
  // =========================
  function syncWheelTabs() {
    const isCirc = wheelMode === 'circular';
    circularWrap.style.display = isCirc ? 'grid' : 'none';
    triangleWrap.style.display = isCirc ? 'none' : 'grid';
    wheelTabCircular.classList.toggle('active', isCirc);
    wheelTabTriangle.classList.toggle('active', !isCirc);
  }

  function openWheel() {
    wheelPanel.style.display = 'block';
    syncWheelTabs();
    drawCircularWheel();
    drawHueRing();
    drawSVTriangle();
    syncWheelPreview();
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

  wheelTabCircular.addEventListener('click', () => {
    wheelMode = 'circular';
    syncWheelTabs();
    drawCircularWheel();
    syncWheelPreview();
  });

  wheelTabTriangle.addEventListener('click', () => {
    wheelMode = 'triangle';
    syncWheelTabs();
    drawHueRing();
    drawSVTriangle();
    syncWheelPreview();
  });

  wheelSetBtn.addEventListener('click', () => {
    brushColorInput.value = wheelPreviewHex;
    addRecentColor(wheelPreviewHex);
    closeWheelPanel();
  });

  // Circular wheel render/pick
  function drawCircularWheel() {
    const ctx = circularWheel.getContext('2d', { willReadFrequently: true });
    const w = circularWheel.width, h = circularWheel.height;
    const cx = w / 2, cy = h / 2;
    const rMax = Math.min(cx, cy) - 2;

    const img = ctx.createImageData(w, h);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const rr = Math.sqrt(dx * dx + dy * dy);
        if (rr > rMax) continue;

        let ang = Math.atan2(dy, dx) * 180 / Math.PI;
        ang = (ang + 360) % 360;

        const sat = clamp(rr / rMax, 0, 1);
        const [r, g, b] = hsvToRgb(ang, sat, 1);

        const i = (y * w + x) * 4;
        img.data[i] = r;
        img.data[i + 1] = g;
        img.data[i + 2] = b;
        img.data[i + 3] = 255;
      }
    }

    ctx.putImageData(img, 0, 0);

    const px = cx + Math.cos((circHue * Math.PI) / 180) * (circSat * rMax);
    const py = cy + Math.sin((circHue * Math.PI) / 180) * (circSat * rMax);

    ctx.beginPath();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2;
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  function pickCircularWheel(evt) {
    const r = circularWheel.getBoundingClientRect();
    const x = (evt.clientX - r.left) * (circularWheel.width / r.width);
    const y = (evt.clientY - r.top) * (circularWheel.height / r.height);

    const cx = circularWheel.width / 2;
    const cy = circularWheel.height / 2;
    const rMax = Math.min(cx, cy) - 2;

    const dx = x - cx;
    const dy = y - cy;
    const rr = Math.sqrt(dx * dx + dy * dy);
    if (rr > rMax) return;

    let ang = Math.atan2(dy, dx) * 180 / Math.PI;
    ang = (ang + 360) % 360;

    circHue = ang;
    circSat = clamp(rr / rMax, 0, 1);

    drawCircularWheel();
    syncWheelPreview();
  }

  circularWheel.addEventListener('mousedown', (e) => {
    if (wheelMode !== 'circular') return;
    pickCircularWheel(e);
  });

  valueSlider.addEventListener('input', () => {
    circVal = clamp(parseInt(valueSlider.value, 10) / 100, 0, 1);
    syncWheelPreview();
  });

  // Triangle wheel: Hue ring + SV triangle
  function drawHueRing() {
    const ctx = hueRing.getContext('2d');
    const w = hueRing.width, h = hueRing.height;
    const cx = w / 2, cy = h / 2;
    const rOuter = Math.min(cx, cy) - 2;
    const rInner = rOuter - 18;

    ctx.clearRect(0, 0, w, h);

    for (let a = 0; a < 360; a += 1) {
      const start = (a - 1) * Math.PI / 180;
      const end = a * Math.PI / 180;
      ctx.beginPath();
      ctx.strokeStyle = `hsl(${a}, 100%, 50%)`;
      ctx.lineWidth = rOuter - rInner;
      ctx.arc(cx, cy, (rOuter + rInner) / 2, start, end);
      ctx.stroke();
    }

    const ang = (triHue - 90) * Math.PI / 180;
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

  function triPoints() {
    const w = svTriangle.width, h = svTriangle.height;
    const pad = 10;
    const A = { x: w / 2, y: pad };
    const B = { x: pad, y: h - pad };
    const C = { x: w - pad, y: h - pad };
    return { A, B, C };
  }

  function pointInTriangle(P, A, B, C) {
    const area = (p1, p2, p3) => (p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y));
    const s = area(P, A, B);
    const t = area(P, B, C);
    const u = area(P, C, A);
    const hasNeg = (s < 0) || (t < 0) || (u < 0);
    const hasPos = (s > 0) || (t > 0) || (u > 0);
    return !(hasNeg && hasPos);
  }

  function drawSVTriangle() {
    const ctx = svTriangle.getContext('2d', { willReadFrequently: true });
    const w = svTriangle.width, h = svTriangle.height;

    ctx.clearRect(0, 0, w, h);

    const { A, B, C } = triPoints();
    const [hr, hg, hb] = hsvToRgb(triHue, 1, 1);

    const img = ctx.createImageData(w, h);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const P = { x, y };
        if (!pointInTriangle(P, A, B, C)) continue;

        const denom = ((B.y - C.y) * (A.x - C.x) + (C.x - B.x) * (A.y - C.y));
        const w1 = ((B.y - C.y) * (P.x - C.x) + (C.x - B.x) * (P.y - C.y)) / denom;
        const w2 = ((C.y - A.y) * (P.x - C.x) + (A.x - C.x) * (P.y - C.y)) / denom;
        const w3 = 1 - w1 - w2;

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
  }

  hueRing.addEventListener('mousedown', (e) => {
    if (wheelMode !== 'triangle') return;
    const r = hueRing.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const cx = r.width / 2;
    const cy = r.height / 2;
    const ang = Math.atan2(y - cy, x - cx);
    let deg = (ang * 180 / Math.PI) + 90;
    if (deg < 0) deg += 360;
    triHue = deg;
    drawHueRing();
    drawSVTriangle();
    syncWheelPreview();
  });

  svTriangle.addEventListener('mousedown', (e) => {
    if (wheelMode !== 'triangle') return;

    const r = svTriangle.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) * (svTriangle.width / r.width));
    const y = Math.floor((e.clientY - r.top) * (svTriangle.height / r.height));

    const ctx = svTriangle.getContext('2d', { willReadFrequently: true });
    const px = ctx.getImageData(x, y, 1, 1).data;

    // Approx S/V from pixel luminance and max (simple but good enough)
    const rr = px[0] / 255, gg = px[1] / 255, bb = px[2] / 255;
    const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
    const d = max - min;
    const v = max;
    const s = max === 0 ? 0 : d / max;

    triS = s;
    triV = v;
    syncWheelPreview();
  });

  circVal = clamp(parseInt(valueSlider.value, 10) / 100, 0, 1);
  syncWheelPreview();

  // =========================
  // Init: Pointer events routing
  // =========================
  function beginStroke(p) {
    pushHistory();
    isPointerDown = true;
    lastX = p.x;
    lastY = p.y;
    lastStampX = null;
    lastStampY = null;
  }

  function moveStroke(p) {
    const L = activeLayer();
    const params = brushParams();

    // Draw onto buffer
    lineBrush(L.bctx, lastX, lastY, p.x, p.y, params);

    // Symmetry mirror
    if (symmetryCheckbox.checked) {
      const mx0 = mirroredX(lastX);
      const mx1 = mirroredX(p.x);
      lineBrush(L.bctx, mx0, lastY, mx1, p.y, params);
    }

    renderLayerDisplay(activeLayerIndex);
    lastX = p.x;
    lastY = p.y;
  }

  function endStroke() {
    isPointerDown = false;
    lastStampX = null;
    lastStampY = null;
  }

  // =========================
  // Init: Transform interactions (pointerdown on box)
  // =========================
  transformBox.addEventListener('pointerdown', (e) => {
    if (!overlayObj || currentTool !== 'transform') return;
    transformBox.setPointerCapture(e.pointerId);

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

      overlayObj.x = x;
      overlayObj.y = y;
      overlayObj.w = w;
      overlayObj.h = h;
    } else if (transformMode === 'rotate') {
      const cx = startState.x + startState.w / 2;
      const cy = startState.y + startState.h / 2;
      const angle0 = Math.atan2(startMouse.y - cy, startMouse.x - cx);
      const angle1 = Math.atan2(p.y - cy, p.x - cx);
      overlayObj.angle = startState.angle + (angle1 - angle0);
    }

    updateTransformBox();
    renderOverlayToActiveLayer();
  });

  transformBox.addEventListener('pointerup', (e) => {
    if (!transformMode) return;
    transformBox.releasePointerCapture(e.pointerId);
    transformMode = null;
    activeHandle = null;
  });

  // =========================
  // Init: Input overlay pointer handlers (all tools)
  // =========================
  inputOverlay.addEventListener('mousedown', (e) => {
    const p = canvasPoint(e);

    // Fill
    if (currentTool === 'fill') {
      pushHistory();
      const L = activeLayer();
      const fill = hexToRgbaArray(brushColorInput.value, parseFloat(opacityInput.value || '100'));
      const x = clamp(Math.floor(p.x), 0, CANVAS_W - 1);
      const y = clamp(Math.floor(p.y), 0, CANVAS_H - 1);

      // Tolerance tuned to eat anti-alias gaps (“under outline”)
      floodFillWithTolerance(L.bctx, x, y, fill, 38);
      renderLayerDisplay(activeLayerIndex);
      return;
    }

    // Text
    if (currentTool === 'text') {
      addTextAt(p.x, p.y);
      return;
    }

    // Shape
    if (currentTool === 'shape') {
      pushHistory();
      shapeActive = true;
      shapeStart = { x: p.x, y: p.y };
      const L = activeLayer();
      shapeBaseImage = L.bctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
      return;
    }

    // Select rect
    if (currentTool === 'select') {
      isSelecting = true;
      selectStart = p;
      selectRect = null;
      hideSelection();
      resetLasso();
      return;
    }

    // Lasso
    if (currentTool === 'lasso') {
      isLassoing = true;
      lassoPoints = [{ x: p.x, y: p.y }];
      hideSelection();
      drawLassoOverlay(lassoPoints);
      return;
    }

    // Crop overlay
    if (currentTool === 'cropImage') {
      if (!overlayObj) return;
      if (Math.abs(overlayObj.angle || 0) > 0.0001) {
        alert('Crop supports only non-rotated overlay. Set rotation to 0 first.');
        return;
      }
      isCropping = true;
      cropStart = p;
      cropRect = null;
      cropOverlay.style.display = 'none';
      return;
    }

    // Transform tool (clicking canvas commits nothing; transform box handles move/resize/rotate)
    if (currentTool === 'transform') {
      return;
    }

    // Pen/Eraser
    if (currentTool === 'pen' || currentTool === 'eraser') {
      beginStroke(p);
      return;
    }
  });

  inputOverlay.addEventListener('mousemove', (e) => {
    const p = canvasPoint(e);

    // Shape preview
    if (currentTool === 'shape' && shapeActive && shapeStart && shapeBaseImage) {
      const L = activeLayer();
      L.bctx.putImageData(shapeBaseImage, 0, 0);
      const params = brushParams();
      drawShapePreview(L.bctx, shapeTypeSelect.value, shapeStart.x, shapeStart.y, p.x, p.y, params);

      renderLayerDisplay(activeLayerIndex);
      return;
    }

    // Select rect update
    if (currentTool === 'select' && isSelecting && selectStart) {
      const x1 = Math.min(selectStart.x, p.x);
      const y1 = Math.min(selectStart.y, p.y);
      const w = Math.abs(p.x - selectStart.x);
      const h = Math.abs(p.y - selectStart.y);

      selectRect = { x: x1, y: y1, w, h };
      showSelectionRect(selectRect);
      return;
    }

    // Lasso update
    if (currentTool === 'lasso' && isLassoing) {
      const last = lassoPoints[lassoPoints.length - 1];
      if (dist(last.x, last.y, p.x, p.y) > 1.2) {
        lassoPoints.push({ x: p.x, y: p.y });
        drawLassoOverlay(lassoPoints);
      }
      return;
    }

    // Crop overlay update
    if (currentTool === 'cropImage' && isCropping && cropStart && overlayObj) {
      const x1 = Math.min(cropStart.x, p.x);
      const y1 = Math.min(cropStart.y, p.y);
      const w = Math.abs(p.x - cropStart.x);
      const h = Math.abs(p.y - cropStart.y);

      cropRect = { x: x1, y: y1, w, h };
      cropOverlay.style.display = 'block';
      cropOverlay.style.left = x1 + 'px';
      cropOverlay.style.top = y1 + 'px';
      cropOverlay.style.width = w + 'px';
      cropOverlay.style.height = h + 'px';
      return;
    }

    // Pen/Eraser draw
    if ((currentTool === 'pen' || currentTool === 'eraser') && isPointerDown) {
      moveStroke(p);
      return;
    }
  });

  inputOverlay.addEventListener('mouseup', (e) => {
    const p = canvasPoint(e);

    // Shape commit
    if (currentTool === 'shape' && shapeActive) {
      shapeActive = false;
      shapeStart = null;
      shapeBaseImage = null;
      renderLayerDisplay(activeLayerIndex);
      return;
    }

    // Select finalize => extract to overlay
    if (currentTool === 'select') {
      if (!isSelecting) return;
      isSelecting = false;

      const r = selectRect;
      hideSelection();
      if (!r || r.w < 2 || r.h < 2) return;

      // Extract to overlay
      extractRectFromActiveLayer(r);
      return;
    }

    // Lasso finalize
    if (currentTool === 'lasso' && isLassoing) {
      isLassoing = false;
      drawLassoOverlay(lassoPoints);
      pushHistory();
      finalizeLassoSelection();
      return;
    }

    // Crop finalize
    if (currentTool === 'cropImage' && isCropping && cropRect && overlayObj) {
      isCropping = false;
      cropOverlay.style.display = 'none';

      // Intersect cropRect with overlay bounds in canvas coords
      const ix1 = Math.max(cropRect.x, overlayObj.x);
      const iy1 = Math.max(cropRect.y, overlayObj.y);
      const ix2 = Math.min(cropRect.x + cropRect.w, overlayObj.x + overlayObj.w);
      const iy2 = Math.min(cropRect.y + cropRect.h, overlayObj.y + overlayObj.h);
      const iw = Math.max(0, ix2 - ix1);
      const ih = Math.max(0, iy2 - iy1);
      if (iw <= 1 || ih <= 1) return;

      pushHistory();
      cropOverlayToRect(ix1, iy1, iw, ih);
      return;
    }

    // Pen/Eraser end
    if (currentTool === 'pen' || currentTool === 'eraser') {
      endStroke();
      return;
    }
  });

  inputOverlay.addEventListener('mouseleave', () => {
    if (currentTool === 'pen' || currentTool === 'eraser') endStroke();
  });

  // =========================
  // Init: Keyboard shortcuts
  // =========================
  document.addEventListener('keydown', (e) => {
    const key = (e.key || '').toLowerCase();
    const ctrlOrCmd = e.ctrlKey || e.metaKey;

    const t = e.target;
    const isTypingTarget =
      t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);

    // Ctrl/Cmd shortcuts
    if (ctrlOrCmd) {
      if (key === 'z' && !e.shiftKey) {
        if (!isTypingTarget) { e.preventDefault(); undo(); }
        return;
      }
      if (key === 'y' || (key === 'z' && e.shiftKey)) {
        if (!isTypingTarget) { e.preventDefault(); redo(); }
        return;
      }
      if (key === 's') {
        if (!isTypingTarget) { e.preventDefault(); downloadCanvasButton.click(); }
        return;
      }
    }

    // Escape cancels active interactions
    if (key === 'escape') {
      e.preventDefault();
      stopAllModes();
      return;
    }

    // Enter commits overlay while transforming
    if (key === 'enter') {
      if (!isTypingTarget && currentTool === 'transform' && overlayObj) {
        e.preventDefault();
        commitOverlay();
      }
    }
  });

  // =========================
  // Final: Keep UI consistent
  // =========================
  renderLayersUI();
  refreshAllDisplays();
});

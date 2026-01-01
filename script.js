// Init
document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  // ===== Helpers (DOM) =====
  const $ = (id) => document.getElementById(id);
  const on = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);

  // ===== Required DOM =====
  const canvasContainer = $('canvasContainer');
  const displayCanvas = $('drawingCanvas');
  const ctxDisplay = displayCanvas ? displayCanvas.getContext('2d') : null;

  // ===== Guard =====
  if (!canvasContainer || !displayCanvas || !ctxDisplay) {
    console.error('Missing #canvasContainer or #drawingCanvas');
    return;
  }

  // ===== UI (existing IDs from your HTML) =====
  const brushSizeInput = $('brushSize');
  const brushSizeValue = $('brushSizeValue');
  const opacityInput = $('opacity');
  const opacityValue = $('opacityValue');
  const brushColorInput = $('brushColor');
  const recentColorsDiv = $('recentColors');

  const toolSelect = $('tool');
  const brushTypeSelect = $('brushType');
  const backgroundPatternSelect = $('backgroundPattern');

  const clearCanvasButton = $('clearCanvas');
  const undoCanvasButton = $('undoCanvas');
  const redoCanvasButton = $('redoCanvas');
  const downloadFormatSelect = $('downloadFormat');
  const downloadCanvasButton = $('downloadCanvas');
  const flipCanvasButton = $('flipCanvas');

  const addImageButton = $('addImageButton');
  const addImageInput = $('addImageInput');

  const darkModeToggle = $('darkModeToggle');

  const shapeOptionsDiv = $('shapeOptions');
  const shapeTypeSelect = $('shapeType');

  const symmetryCheckbox = $('symmetry');

  // ===== Overlays (existing IDs from your HTML) =====
  const selectionOverlayDiv = $('selectionOverlay');
  const lassoOverlay = $('lassoOverlay');
  const cropOverlayDiv = $('cropOverlay');
  const transformBox = $('transformBox');

  // ===== Defaults / State =====
  let currentTool = toolSelect ? toolSelect.value : 'pen';
  let currentBrush = brushTypeSelect ? brushTypeSelect.value : 'round';

  let canvasW = displayCanvas.width;
  let canvasH = displayCanvas.height;

  const MAX_HISTORY = 30;
  const MAX_LAYERS = 10;

  // ===== Layers (true multi-layer) =====
  // Stack order: layers[0] is bottom, layers[last] is top.
  const layers = []; // { name, canvas, ctx, visible }
  let activeLayerIndex = 0;

  // ===== Overlay object (selection/image transform) =====
  // overlayObj: { img, x,y,w,h, angle, source:'layer', sourceLayerIndex, cutShape:'rect'|'lasso', maskPoints?, bounds? }
  let overlayObj = null;

  // ===== Interaction =====
  let isPointerDown = false;
  let lastPt = { x: 0, y: 0 };
  let lastStampPt = { x: 0, y: 0 };
  let strokeHasMoved = false;

  // ===== Selection / Lasso / Crop =====
  let isSelecting = false;
  let selectStart = { x: 0, y: 0 };
  let selectRect = null; // {x,y,w,h}

  let isLassoing = false;
  let lassoPoints = [];

  let isCropping = false;
  let cropStart = { x: 0, y: 0 };
  let cropRect = null;

  // ===== Transform =====
  let transformMode = null; // 'move' | 'resize' | 'rotate'
  let activeHandle = null;
  let startMouse = { x: 0, y: 0 };
  let startState = null; // {x,y,w,h,angle}

  // ===== Internal clipboard (for overlay) =====
  let clipboardObj = null; // { dataUrl, w,h }

  // ===== Brush spacing =====
  let brushSpacingPx = 0; // 0 = continuous; otherwise min distance between stamps

  // ===== History =====
  let undoStack = [];
  let redoStack = [];

  // ===== Theme (your existing logic) =====
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
  on(darkModeToggle, 'click', () => {
    const isDark = document.body.classList.contains('dark');
    const next = isDark ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  });
  initTheme();

  // ===== Create input overlay canvas (captures all pointer events reliably) =====
  const inputOverlay = document.createElement('canvas');
  inputOverlay.id = 'inputOverlay';
  inputOverlay.width = canvasW;
  inputOverlay.height = canvasH;
  inputOverlay.style.position = 'absolute';
  inputOverlay.style.left = '0';
  inputOverlay.style.top = '0';
  inputOverlay.style.zIndex = '10';
  inputOverlay.style.pointerEvents = 'auto';
  inputOverlay.style.touchAction = 'none';
  inputOverlay.style.background = 'rgba(0,0,0,0)';
  canvasContainer.appendChild(inputOverlay);
  const ctxInputOverlay = inputOverlay.getContext('2d');

  // ===== Symmetry guide overlay =====
  const symmetryGuide = document.createElement('canvas');
  symmetryGuide.id = 'symmetryGuide';
  symmetryGuide.width = canvasW;
  symmetryGuide.height = canvasH;
  symmetryGuide.style.position = 'absolute';
  symmetryGuide.style.left = '0';
  symmetryGuide.style.top = '0';
  symmetryGuide.style.zIndex = '9';
  symmetryGuide.style.pointerEvents = 'none';
  symmetryGuide.style.background = 'rgba(0,0,0,0)';
  canvasContainer.appendChild(symmetryGuide);
  const ctxSym = symmetryGuide.getContext('2d');

  function renderSymmetryGuide() {
    ctxSym.clearRect(0, 0, canvasW, canvasH);
    if (!symmetryCheckbox || !symmetryCheckbox.checked) return;
    ctxSym.save();
    ctxSym.globalAlpha = 0.55;
    ctxSym.strokeStyle = '#3b82f6';
    ctxSym.lineWidth = 2;
    ctxSym.setLineDash([8, 6]);
    ctxSym.beginPath();
    ctxSym.moveTo(canvasW / 2, 0);
    ctxSym.lineTo(canvasW / 2, canvasH);
    ctxSym.stroke();
    ctxSym.restore();
  }

  // ===== Ensure lasso overlay matches size =====
  if (lassoOverlay) {
    lassoOverlay.width = canvasW;
    lassoOverlay.height = canvasH;
    lassoOverlay.style.position = 'absolute';
    lassoOverlay.style.left = '0';
    lassoOverlay.style.top = '0';
    lassoOverlay.style.zIndex = '8';
    lassoOverlay.style.pointerEvents = 'none';
  }
  const ctxLasso = lassoOverlay ? lassoOverlay.getContext('2d') : null;

  function clearLassoOverlay() {
    if (!ctxLasso) return;
    ctxLasso.clearRect(0, 0, canvasW, canvasH);
  }
  function drawLassoOverlay(points, previewPoint = null) {
    if (!ctxLasso) return;
    clearLassoOverlay();
    if (!points.length) return;

    const pts = previewPoint ? [...points, previewPoint] : points;

    ctxLasso.save();
    ctxLasso.strokeStyle = '#22c55e';
    ctxLasso.fillStyle = 'rgba(34,197,94,0.12)';
    ctxLasso.lineWidth = 1.5;
    ctxLasso.setLineDash([6, 4]);
    ctxLasso.beginPath();
    pts.forEach((p, i) => {
      if (i === 0) ctxLasso.moveTo(p.x, p.y);
      else ctxLasso.lineTo(p.x, p.y);
    });
    if (!previewPoint && pts.length > 2) ctxLasso.closePath();
    ctxLasso.stroke();
    if (pts.length > 2) ctxLasso.fill();
    ctxLasso.restore();
  }

  // ===== Selection overlay helpers =====
  function showSelectionOverlay(x, y, w, h) {
    if (!selectionOverlayDiv) return;
    selectionOverlayDiv.style.display = 'block';
    Object.assign(selectionOverlayDiv.style, {
      left: `${x}px`,
      top: `${y}px`,
      width: `${w}px`,
      height: `${h}px`,
    });
  }
  function hideSelectionOverlay() {
    if (!selectionOverlayDiv) return;
    selectionOverlayDiv.style.display = 'none';
  }

  // ===== Crop overlay helpers =====
  function showCropOverlay(x, y, w, h) {
    if (!cropOverlayDiv) return;
    cropOverlayDiv.style.display = 'block';
    Object.assign(cropOverlayDiv.style, {
      left: `${x}px`,
      top: `${y}px`,
      width: `${w}px`,
      height: `${h}px`,
    });
  }
  function hideCropOverlay() {
    if (!cropOverlayDiv) return;
    cropOverlayDiv.style.display = 'none';
  }

  // ===== Geometry =====
  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }
  function dist(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.hypot(dx, dy);
  }
  function canvasPointFromEvent(evt) {
    const r = inputOverlay.getBoundingClientRect();
    return {
      x: clamp(evt.clientX - r.left, 0, canvasW),
      y: clamp(evt.clientY - r.top, 0, canvasH),
    };
  }

  // ===== Color utils =====
  function hexToRgba(hex, opacity100) {
    let h = (hex || '#000000').replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const bigint = parseInt(h, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    const a = clamp(opacity100, 0, 100) / 100;
    return `rgba(${r},${g},${b},${a})`;
  }
  function hexToRgbaArray(hex, opacity100) {
    let h = (hex || '#000000').replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const bigint = parseInt(h, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    const a = Math.round((clamp(opacity100, 0, 100) / 100) * 255);
    return [r, g, b, a];
  }
  function rgbaDist(a, b) {
    return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) + Math.abs(a[3] - b[3]);
  }

  // ===== Recent colors =====
  let recentColors = [];
  function addRecentColor(color) {
    if (!recentColorsDiv) return;
    if (!color) return;
    if (recentColors.includes(color)) return;
    recentColors.push(color);
    if (recentColors.length > 12) recentColors.shift();
    recentColorsDiv.innerHTML = '';
    recentColors.forEach((c) => {
      const swatch = document.createElement('div');
      swatch.className = 'color-swatch';
      swatch.style.backgroundColor = c;
      swatch.title = c;
      swatch.onclick = () => {
        if (brushColorInput) brushColorInput.value = c;
      };
      recentColorsDiv.appendChild(swatch);
    });
  }
  on(brushColorInput, 'change', () => addRecentColor(brushColorInput.value));

  // ===== Background selector =====
  on(backgroundPatternSelect, 'change', () => {
    const pattern = backgroundPatternSelect.value;
    canvasContainer.className = `canvas-container ${pattern}`;
  });

  // ===== Ensure shape options show/hide =====
  function syncShapeOptions() {
    if (!shapeOptionsDiv) return;
    shapeOptionsDiv.style.display = currentTool === 'shape' ? 'inline-block' : 'none';
  }

  // ===== Build layers panel (compact, right side, rename, add/delete/merge) =====
  const layersPanel = document.createElement('div');
  layersPanel.id = 'layersPanel';
  layersPanel.style.position = 'absolute';
  layersPanel.style.right = '8px';
  layersPanel.style.top = '8px';
  layersPanel.style.zIndex = '20';
  layersPanel.style.width = '190px';
  layersPanel.style.maxHeight = 'calc(100% - 16px)';
  layersPanel.style.overflow = 'hidden';
  layersPanel.style.borderRadius = '10px';
  layersPanel.style.boxShadow = '0 6px 18px rgba(0,0,0,0.18)';
  layersPanel.style.background = document.body.classList.contains('dark') ? 'rgba(17,24,39,0.92)' : 'rgba(255,255,255,0.92)';
  layersPanel.style.backdropFilter = 'blur(6px)';
  layersPanel.style.padding = '8px';
  layersPanel.style.display = 'flex';
  layersPanel.style.flexDirection = 'column';
  layersPanel.style.gap = '8px';
  canvasContainer.appendChild(layersPanel);

  const layersHeader = document.createElement('div');
  layersHeader.style.display = 'flex';
  layersHeader.style.alignItems = 'center';
  layersHeader.style.justifyContent = 'space-between';
  layersHeader.style.gap = '6px';

  const layersTitle = document.createElement('div');
  layersTitle.textContent = 'Layers';
  layersTitle.style.fontWeight = '700';
  layersTitle.style.fontSize = '14px';
  layersTitle.style.color = document.body.classList.contains('dark') ? '#e5e7eb' : '#111827';

  const layersButtons = document.createElement('div');
  layersButtons.style.display = 'flex';
  layersButtons.style.gap = '6px';

  function makeIconBtn(svgPathD, title) {
    const b = document.createElement('button');
    b.type = 'button';
    b.title = title;
    b.style.width = '30px';
    b.style.height = '30px';
    b.style.display = 'inline-flex';
    b.style.alignItems = 'center';
    b.style.justifyContent = 'center';
    b.style.padding = '0';
    b.style.borderRadius = '8px';
    b.style.border = 'none';
    b.style.cursor = 'pointer';
    b.style.background = document.body.classList.contains('dark') ? '#111827' : '#FFB2F7';
    b.style.color = '#fff';
    b.onmouseenter = () => (b.style.filter = 'brightness(0.95)');
    b.onmouseleave = () => (b.style.filter = 'none');

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '18');
    svg.setAttribute('height', '18');
    svg.style.display = 'block';
    svg.style.fill = 'currentColor';

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', svgPathD);
    svg.appendChild(path);
    b.appendChild(svg);
    return b;
  }

  const iconPlus = 'M11 5h2v14h-2zM5 11h14v2H5z';
  const iconTrash = 'M6 7h12l-1 14H7L6 7zm3-3h6l1 2H8l1-2z';
  const iconMerge = 'M7 3h2v6h6V3h2v8H9v10H7V3z';

  const btnAddLayer = makeIconBtn(iconPlus, 'Add layer');
  const btnDeleteLayer = makeIconBtn(iconTrash, 'Delete layer');
  const btnMergeDown = makeIconBtn(iconMerge, 'Merge down');

  layersButtons.appendChild(btnAddLayer);
  layersButtons.appendChild(btnDeleteLayer);
  layersButtons.appendChild(btnMergeDown);

  layersHeader.appendChild(layersTitle);
  layersHeader.appendChild(layersButtons);

  const layerList = document.createElement('div');
  layerList.id = 'layerList';
  layerList.style.display = 'flex';
  layerList.style.flexDirection = 'column';
  layerList.style.gap = '6px';
  layerList.style.overflowY = 'auto';
  layerList.style.paddingRight = '2px';
  layerList.style.maxHeight = '260px';

  // Brush spacing UI (compact)
  const spacingRow = document.createElement('div');
  spacingRow.style.display = 'grid';
  spacingRow.style.gridTemplateColumns = '1fr 70px';
  spacingRow.style.alignItems = 'center';
  spacingRow.style.gap = '8px';

  const spacingLabel = document.createElement('div');
  spacingLabel.textContent = 'Spacing';
  spacingLabel.style.fontSize = '12px';
  spacingLabel.style.fontWeight = '700';
  spacingLabel.style.color = document.body.classList.contains('dark') ? '#e5e7eb' : '#111827';

  const spacingInput = document.createElement('input');
  spacingInput.type = 'range';
  spacingInput.min = '0';
  spacingInput.max = '60';
  spacingInput.value = '0';
  spacingInput.title = 'Brush spacing';

  spacingRow.appendChild(spacingLabel);
  spacingRow.appendChild(spacingInput);

  layersPanel.appendChild(layersHeader);
  layersPanel.appendChild(layerList);
  layersPanel.appendChild(spacingRow);

  on(spacingInput, 'input', () => {
    brushSpacingPx = parseInt(spacingInput.value, 10) || 0;
  });

  // ===== Color wheels button (next to color input) =====
  let wheelBtn = document.createElement('button');
  wheelBtn.type = 'button';
  wheelBtn.title = 'Color wheels';
  wheelBtn.style.marginLeft = '8px';
  wheelBtn.style.border = 'none';
  wheelBtn.style.borderRadius = '8px';
  wheelBtn.style.padding = '6px 10px';
  wheelBtn.style.cursor = 'pointer';
  wheelBtn.style.background = '#FFB2F7';
  wheelBtn.style.color = '#fff';
  wheelBtn.textContent = 'Wheels';

  // Place next to color input if possible
  if (brushColorInput && brushColorInput.parentElement) {
    brushColorInput.parentElement.appendChild(wheelBtn);
  }

  // ===== Color wheel modal (circular + triangle) =====
  const wheelModal = document.createElement('div');
  wheelModal.id = 'wheelModal';
  wheelModal.style.position = 'fixed';
  wheelModal.style.inset = '0';
  wheelModal.style.display = 'none';
  wheelModal.style.alignItems = 'center';
  wheelModal.style.justifyContent = 'center';
  wheelModal.style.zIndex = '9999';
  wheelModal.style.background = 'rgba(0,0,0,0.45)';
  document.body.appendChild(wheelModal);

  const wheelCard = document.createElement('div');
  wheelCard.style.width = '360px';
  wheelCard.style.maxWidth = '92vw';
  wheelCard.style.borderRadius = '14px';
  wheelCard.style.padding = '12px';
  wheelCard.style.background = document.body.classList.contains('dark') ? '#111827' : '#ffffff';
  wheelCard.style.boxShadow = '0 12px 30px rgba(0,0,0,0.25)';
  wheelCard.style.display = 'flex';
  wheelCard.style.flexDirection = 'column';
  wheelCard.style.gap = '10px';

  const wheelTitle = document.createElement('div');
  wheelTitle.textContent = 'Color wheels';
  wheelTitle.style.fontSize = '14px';
  wheelTitle.style.fontWeight = '800';
  wheelTitle.style.color = document.body.classList.contains('dark') ? '#e5e7eb' : '#111827';

  const wheelRow = document.createElement('div');
  wheelRow.style.display = 'grid';
  wheelRow.style.gridTemplateColumns = '1fr 1fr';
  wheelRow.style.gap = '10px';

  const circleWheel = document.createElement('canvas');
  circleWheel.width = 160;
  circleWheel.height = 160;
  circleWheel.style.width = '160px';
  circleWheel.style.height = '160px';
  circleWheel.style.borderRadius = '999px';
  circleWheel.style.cursor = 'crosshair';

  const triWheel = document.createElement('canvas');
  triWheel.width = 160;
  triWheel.height = 160;
  triWheel.style.width = '160px';
  triWheel.style.height = '160px';
  triWheel.style.borderRadius = '12px';
  triWheel.style.cursor = 'crosshair';

  wheelRow.appendChild(circleWheel);
  wheelRow.appendChild(triWheel);

  const wheelBtnsRow = document.createElement('div');
  wheelBtnsRow.style.display = 'flex';
  wheelBtnsRow.style.justifyContent = 'flex-end';
  wheelBtnsRow.style.gap = '8px';

  const btnCancelWheel = document.createElement('button');
  btnCancelWheel.type = 'button';
  btnCancelWheel.textContent = 'Close';
  btnCancelWheel.title = 'Close';
  btnCancelWheel.style.border = 'none';
  btnCancelWheel.style.borderRadius = '10px';
  btnCancelWheel.style.padding = '8px 12px';
  btnCancelWheel.style.cursor = 'pointer';
  btnCancelWheel.style.background = document.body.classList.contains('dark') ? '#374151' : '#e5e7eb';
  btnCancelWheel.style.color = document.body.classList.contains('dark') ? '#fff' : '#111827';

  const btnUseWheel = document.createElement('button');
  btnUseWheel.type = 'button';
  btnUseWheel.textContent = 'Use color';
  btnUseWheel.title = 'Use color';
  btnUseWheel.style.border = 'none';
  btnUseWheel.style.borderRadius = '10px';
  btnUseWheel.style.padding = '8px 12px';
  btnUseWheel.style.cursor = 'pointer';
  btnUseWheel.style.background = '#FFB2F7';
  btnUseWheel.style.color = '#fff';

  wheelBtnsRow.appendChild(btnCancelWheel);
  wheelBtnsRow.appendChild(btnUseWheel);

  wheelCard.appendChild(wheelTitle);
  wheelCard.appendChild(wheelRow);
  wheelCard.appendChild(wheelBtnsRow);
  wheelModal.appendChild(wheelCard);

  let wheelHue = 0; // 0..360
  let wheelSV = { s: 1, v: 1 };
  let wheelPickedHex = '#000000';

  function hsvToRgb(h, s, v) {
    h = (h % 360 + 360) % 360;
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
    return {
      r: Math.round((rp + m) * 255),
      g: Math.round((gp + m) * 255),
      b: Math.round((bp + m) * 255),
    };
  }
  function rgbToHex(r, g, b) {
    const toH = (n) => n.toString(16).padStart(2, '0');
    return `#${toH(r)}${toH(g)}${toH(b)}`;
  }

  function drawCircleWheel() {
    const cctx = circleWheel.getContext('2d');
    const cx = circleWheel.width / 2;
    const cy = circleWheel.height / 2;
    const r = circleWheel.width / 2;

    const img = cctx.createImageData(circleWheel.width, circleWheel.height);
    const data = img.data;

    for (let y = 0; y < circleWheel.height; y++) {
      for (let x = 0; x < circleWheel.width; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const d = Math.hypot(dx, dy);
        const idx = (y * circleWheel.width + x) * 4;

        if (d > r) {
          data[idx + 3] = 0;
          continue;
        }

        const angle = Math.atan2(dy, dx);
        const hue = ((angle * 180) / Math.PI + 360) % 360;
        const sat = clamp(d / r, 0, 1);
        const val = 1;

        const rgb = hsvToRgb(hue, sat, val);
        data[idx] = rgb.r;
        data[idx + 1] = rgb.g;
        data[idx + 2] = rgb.b;
        data[idx + 3] = 255;
      }
    }

    cctx.putImageData(img, 0, 0);

    // Marker
    const markerR = r * clamp(wheelSV.s, 0, 1);
    const theta = (wheelHue * Math.PI) / 180;
    const mx = cx + Math.cos(theta) * markerR;
    const my = cy + Math.sin(theta) * markerR;

    cctx.save();
    cctx.strokeStyle = '#111827';
    cctx.lineWidth = 2;
    cctx.beginPath();
    cctx.arc(mx, my, 6, 0, Math.PI * 2);
    cctx.stroke();
    cctx.strokeStyle = '#ffffff';
    cctx.lineWidth = 1;
    cctx.beginPath();
    cctx.arc(mx, my, 7.5, 0, Math.PI * 2);
    cctx.stroke();
    cctx.restore();
  }

  function drawTriangleWheel() {
    const tctx = triWheel.getContext('2d');
    tctx.clearRect(0, 0, triWheel.width, triWheel.height);

    // Triangle points
    const pad = 14;
    const A = { x: triWheel.width / 2, y: pad }; // top
    const B = { x: pad, y: triWheel.height - pad }; // bottom left
    const C = { x: triWheel.width - pad, y: triWheel.height - pad }; // bottom right

    // Build image
    const img = tctx.createImageData(triWheel.width, triWheel.height);
    const data = img.data;

    // Barycentric helpers
    const denom =
      (B.y - C.y) * (A.x - C.x) +
      (C.x - B.x) * (A.y - C.y);

    function bary(x, y) {
      const w1 =
        ((B.y - C.y) * (x - C.x) + (C.x - B.x) * (y - C.y)) / denom;
      const w2 =
        ((C.y - A.y) * (x - C.x) + (A.x - C.x) * (y - C.y)) / denom;
      const w3 = 1 - w1 - w2;
      return { w1, w2, w3 };
    }

    // Colors at vertices:
    // A = pure hue color (S=1,V=1)
    // B = white (S=0,V=1)
    // C = black (V=0)
    const hueRGB = hsvToRgb(wheelHue, 1, 1);

    for (let y = 0; y < triWheel.height; y++) {
      for (let x = 0; x < triWheel.width; x++) {
        const idx = (y * triWheel.width + x) * 4;
        const { w1, w2, w3 } = bary(x, y);

        if (w1 < 0 || w2 < 0 || w3 < 0) {
          data[idx + 3] = 0;
          continue;
        }

        // Interpolate RGB between hue, white, black
        const r = w1 * hueRGB.r + w2 * 255 + w3 * 0;
        const g = w1 * hueRGB.g + w2 * 255 + w3 * 0;
        const b = w1 * hueRGB.b + w2 * 255 + w3 * 0;

        data[idx] = Math.round(r);
        data[idx + 1] = Math.round(g);
        data[idx + 2] = Math.round(b);
        data[idx + 3] = 255;
      }
    }

    tctx.putImageData(img, 0, 0);

    // Marker from wheelSV (approx mapping):
    // We map s,v to barycentric:
    // v controls toward black (C); (1-v) toward C
    // s controls away from white (B) toward hue (A)
    const v = clamp(wheelSV.v, 0, 1);
    const s = clamp(wheelSV.s, 0, 1);

    const w3 = 1 - v; // black weight
    const remain = 1 - w3;
    const w1 = remain * s; // hue weight
    const w2 = remain * (1 - s); // white weight

    const mx = w1 * A.x + w2 * B.x + w3 * C.x;
    const my = w1 * A.y + w2 * B.y + w3 * C.y;

    tctx.save();
    tctx.strokeStyle = '#111827';
    tctx.lineWidth = 2;
    tctx.beginPath();
    tctx.arc(mx, my, 6, 0, Math.PI * 2);
    tctx.stroke();
    tctx.strokeStyle = '#ffffff';
    tctx.lineWidth = 1;
    tctx.beginPath();
    tctx.arc(mx, my, 7.5, 0, Math.PI * 2);
    tctx.stroke();
    tctx.restore();
  }

  function openWheelModal() {
    wheelModal.style.display = 'flex';
    drawCircleWheel();
    drawTriangleWheel();
  }
  function closeWheelModal() {
    wheelModal.style.display = 'none';
  }

  function pickFromCircle(evt) {
    const r = circleWheel.getBoundingClientRect();
    const x = evt.clientX - r.left;
    const y = evt.clientY - r.top;
    const cx = r.width / 2;
    const cy = r.height / 2;
    const dx = x - cx;
    const dy = y - cy;
    const distR = Math.hypot(dx, dy);
    const radius = r.width / 2;

    const sat = clamp(distR / radius, 0, 1);
    const ang = Math.atan2(dy, dx);
    const hue = ((ang * 180) / Math.PI + 360) % 360;

    wheelHue = hue;
    wheelSV.s = sat;
    wheelSV.v = 1;

    const rgb = hsvToRgb(wheelHue, wheelSV.s, wheelSV.v);
    wheelPickedHex = rgbToHex(rgb.r, rgb.g, rgb.b);

    drawCircleWheel();
    drawTriangleWheel();
  }

  function pickFromTriangle(evt) {
    const tctx = triWheel.getContext('2d');
    const r = triWheel.getBoundingClientRect();
    const x = Math.floor(((evt.clientX - r.left) / r.width) * triWheel.width);
    const y = Math.floor(((evt.clientY - r.top) / r.height) * triWheel.height);

    const px = tctx.getImageData(x, y, 1, 1).data;
    if (px[3] === 0) return;

    wheelPickedHex = rgbToHex(px[0], px[1], px[2]);

    // Approx inverse mapping for marker:
    // We'll estimate v by brightness and s by distance from white along hue direction (simple approx).
    const maxc = Math.max(px[0], px[1], px[2]);
    const minc = Math.min(px[0], px[1], px[2]);
    const v = maxc / 255;
    const s = maxc === 0 ? 0 : (maxc - minc) / maxc;
    wheelSV = { s: clamp(s, 0, 1), v: clamp(v, 0, 1) };

    drawTriangleWheel();
    drawCircleWheel();
  }

  on(wheelBtn, 'click', openWheelModal);
  on(btnCancelWheel, 'click', closeWheelModal);
  on(wheelModal, 'click', (e) => {
    if (e.target === wheelModal) closeWheelModal();
  });
  on(circleWheel, 'pointerdown', (e) => {
    circleWheel.setPointerCapture(e.pointerId);
    pickFromCircle(e);
  });
  on(circleWheel, 'pointermove', (e) => {
    if (e.buttons) pickFromCircle(e);
  });
  on(triWheel, 'pointerdown', (e) => {
    triWheel.setPointerCapture(e.pointerId);
    pickFromTriangle(e);
  });
  on(triWheel, 'pointermove', (e) => {
    if (e.buttons) pickFromTriangle(e);
  });

  on(btnUseWheel, 'click', () => {
    if (brushColorInput) {
      brushColorInput.value = wheelPickedHex || '#000000';
      addRecentColor(brushColorInput.value);
    }
    closeWheelModal();
  });

  // ===== Canvas sizing + New canvas modal (presets + custom) =====
  const newCanvasBtn = document.createElement('button');
  newCanvasBtn.type = 'button';
  newCanvasBtn.title = 'New canvas';
  newCanvasBtn.style.border = 'none';
  newCanvasBtn.style.borderRadius = '10px';
  newCanvasBtn.style.padding = '6px 10px';
  newCanvasBtn.style.cursor = 'pointer';
  newCanvasBtn.style.background = '#FFB2F7';
  newCanvasBtn.style.color = '#fff';
  newCanvasBtn.textContent = 'New';

  // Put near existing clear/undo/redo/download group if possible
  const actionRow = clearCanvasButton ? clearCanvasButton.parentElement : null;
  if (actionRow) actionRow.insertBefore(newCanvasBtn, actionRow.firstChild);

  const newCanvasModal = document.createElement('div');
  newCanvasModal.style.position = 'fixed';
  newCanvasModal.style.inset = '0';
  newCanvasModal.style.display = 'none';
  newCanvasModal.style.alignItems = 'center';
  newCanvasModal.style.justifyContent = 'center';
  newCanvasModal.style.zIndex = '9999';
  newCanvasModal.style.background = 'rgba(0,0,0,0.45)';
  document.body.appendChild(newCanvasModal);

  const newCanvasCard = document.createElement('div');
  newCanvasCard.style.width = '380px';
  newCanvasCard.style.maxWidth = '92vw';
  newCanvasCard.style.borderRadius = '14px';
  newCanvasCard.style.padding = '12px';
  newCanvasCard.style.background = document.body.classList.contains('dark') ? '#111827' : '#ffffff';
  newCanvasCard.style.boxShadow = '0 12px 30px rgba(0,0,0,0.25)';
  newCanvasCard.style.display = 'flex';
  newCanvasCard.style.flexDirection = 'column';
  newCanvasCard.style.gap = '10px';
  newCanvasModal.appendChild(newCanvasCard);

  const newCanvasTitle = document.createElement('div');
  newCanvasTitle.textContent = 'New canvas';
  newCanvasTitle.style.fontSize = '14px';
  newCanvasTitle.style.fontWeight = '800';
  newCanvasTitle.style.color = document.body.classList.contains('dark') ? '#e5e7eb' : '#111827';

  const presetGrid = document.createElement('div');
  presetGrid.style.display = 'grid';
  presetGrid.style.gridTemplateColumns = '1fr 1fr';
  presetGrid.style.gap = '8px';

  const presets = [
    { label: 'SD', w: 640, h: 480 },
    { label: 'HD', w: 1280, h: 720 },
    { label: '1:1', w: 1024, h: 1024 },
    { label: '4:3', w: 1200, h: 900 },
    { label: '16:9', w: 1600, h: 900 },
    { label: 'Full HD', w: 1920, h: 1080 },
  ];

  function presetBtn(p) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = `${p.label} (${p.w}×${p.h})`;
    b.title = `${p.w}×${p.h}`;
    b.style.border = 'none';
    b.style.borderRadius = '10px';
    b.style.padding = '8px 10px';
    b.style.cursor = 'pointer';
    b.style.background = document.body.classList.contains('dark') ? '#374151' : '#e5e7eb';
    b.style.color = document.body.classList.contains('dark') ? '#fff' : '#111827';
    b.onclick = () => {
      resizeAll(p.w, p.h);
      closeNewCanvasModal();
    };
    return b;
  }

  presets.forEach((p) => presetGrid.appendChild(presetBtn(p)));

  const customRow = document.createElement('div');
  customRow.style.display = 'grid';
  customRow.style.gridTemplateColumns = '1fr 1fr';
  customRow.style.gap = '8px';

  const customW = document.createElement('input');
  customW.type = 'number';
  customW.min = '64';
  customW.max = '4096';
  customW.value = String(canvasW);
  customW.placeholder = 'Width';
  customW.title = 'Custom width';

  const customH = document.createElement('input');
  customH.type = 'number';
  customH.min = '64';
  customH.max = '4096';
  customH.value = String(canvasH);
  customH.placeholder = 'Height';
  customH.title = 'Custom height';

  [customW, customH].forEach((inp) => {
    inp.style.borderRadius = '10px';
    inp.style.border = document.body.classList.contains('dark') ? '1px solid #374151' : '1px solid #d1d5db';
    inp.style.padding = '8px 10px';
    inp.style.outline = 'none';
  });

  customRow.appendChild(customW);
  customRow.appendChild(customH);

  const newCanvasBtns = document.createElement('div');
  newCanvasBtns.style.display = 'flex';
  newCanvasBtns.style.justifyContent = 'flex-end';
  newCanvasBtns.style.gap = '8px';

  const btnCloseNew = document.createElement('button');
  btnCloseNew.type = 'button';
  btnCloseNew.textContent = 'Close';
  btnCloseNew.title = 'Close';
  btnCloseNew.style.border = 'none';
  btnCloseNew.style.borderRadius = '10px';
  btnCloseNew.style.padding = '8px 12px';
  btnCloseNew.style.cursor = 'pointer';
  btnCloseNew.style.background = document.body.classList.contains('dark') ? '#374151' : '#e5e7eb';
  btnCloseNew.style.color = document.body.classList.contains('dark') ? '#fff' : '#111827';

  const btnCreateNew = document.createElement('button');
  btnCreateNew.type = 'button';
  btnCreateNew.textContent = 'Create';
  btnCreateNew.title = 'Create';
  btnCreateNew.style.border = 'none';
  btnCreateNew.style.borderRadius = '10px';
  btnCreateNew.style.padding = '8px 12px';
  btnCreateNew.style.cursor = 'pointer';
  btnCreateNew.style.background = '#FFB2F7';
  btnCreateNew.style.color = '#fff';

  newCanvasBtns.appendChild(btnCloseNew);
  newCanvasBtns.appendChild(btnCreateNew);

  newCanvasCard.appendChild(newCanvasTitle);
  newCanvasCard.appendChild(presetGrid);
  newCanvasCard.appendChild(customRow);
  newCanvasCard.appendChild(newCanvasBtns);

  function openNewCanvasModal() {
    customW.value = String(canvasW);
    customH.value = String(canvasH);
    newCanvasModal.style.display = 'flex';
  }
  function closeNewCanvasModal() {
    newCanvasModal.style.display = 'none';
  }

  on(newCanvasBtn, 'click', openNewCanvasModal);
  on(btnCloseNew, 'click', closeNewCanvasModal);
  on(newCanvasModal, 'click', (e) => {
    if (e.target === newCanvasModal) closeNewCanvasModal();
  });
  on(btnCreateNew, 'click', () => {
    const w = clamp(parseInt(customW.value, 10) || canvasW, 64, 4096);
    const h = clamp(parseInt(customH.value, 10) || canvasH, 64, 4096);
    resizeAll(w, h);
    closeNewCanvasModal();
  });

  // ===== Layer core =====
  function makeLayer(name) {
    const c = document.createElement('canvas');
    c.width = canvasW;
    c.height = canvasH;
    const cx = c.getContext('2d');
    cx.clearRect(0, 0, canvasW, canvasH);
    return { name, canvas: c, ctx: cx, visible: true };
  }

  function ensureBaseLayer() {
    if (layers.length) return;
    layers.push(makeLayer('Layer 1'));
    activeLayerIndex = 0;
  }

  function layerAt(i) {
    return layers[i] || null;
  }

  function rebuildLayerList() {
    layerList.innerHTML = '';

    // UI: show top layer first (most understandable)
    for (let uiRow = layers.length - 1; uiRow >= 0; uiRow--) {
      const i = uiRow; // actual index
      const layer = layers[i];

      const row = document.createElement('div');
      row.style.display = 'grid';
      row.style.gridTemplateColumns = '22px 1fr 24px';
      row.style.alignItems = 'center';
      row.style.gap = '6px';
      row.style.padding = '6px 8px';
      row.style.borderRadius = '10px';
      row.style.cursor = 'pointer';
      row.style.userSelect = 'none';
      row.style.border = i === activeLayerIndex ? '2px solid #3b82f6' : '1px solid rgba(0,0,0,0.08)';
      row.style.background = document.body.classList.contains('dark')
        ? (i === activeLayerIndex ? 'rgba(59,130,246,0.18)' : 'rgba(17,24,39,0.65)')
        : (i === activeLayerIndex ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.75)');

      const eye = document.createElement('input');
      eye.type = 'checkbox';
      eye.checked = !!layer.visible;
      eye.title = 'Toggle visibility';
      eye.style.width = '16px';
      eye.style.height = '16px';
      eye.onclick = (e) => {
        e.stopPropagation();
        saveState();
        layer.visible = eye.checked;
        redrawAll();
      };

      const name = document.createElement('div');
      name.textContent = layer.name;
      name.title = layer.name;
      name.style.fontSize = '12px';
      name.style.fontWeight = '700';
      name.style.whiteSpace = 'nowrap';
      name.style.overflow = 'hidden';
      name.style.textOverflow = 'ellipsis';
      name.style.color = document.body.classList.contains('dark') ? '#e5e7eb' : '#111827';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.title = 'Rename layer';
      editBtn.style.border = 'none';
      editBtn.style.background = 'transparent';
      editBtn.style.cursor = 'pointer';
      editBtn.style.padding = '0';
      editBtn.style.width = '24px';
      editBtn.style.height = '24px';
      editBtn.style.display = 'inline-flex';
      editBtn.style.alignItems = 'center';
      editBtn.style.justifyContent = 'center';
      editBtn.style.color = document.body.classList.contains('dark') ? '#e5e7eb' : '#111827';

      // Pencil icon
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('width', '16');
      svg.setAttribute('height', '16');
      svg.style.fill = 'currentColor';
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm2.92 2.83H5v-.92l9.06-9.06.92.92L5.92 20.08zM20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z');
      svg.appendChild(path);
      editBtn.appendChild(svg);

      editBtn.onclick = (e) => {
        e.stopPropagation();
        const next = prompt('Layer name:', layer.name);
        if (next === null) return;
        saveState();
        layer.name = (next || '').trim() || layer.name;
        rebuildLayerList();
      };

      row.onclick = () => {
        if (overlayObj) commitOverlay();
        activeLayerIndex = i;
        rebuildLayerList();
        redrawAll();
      };

      row.appendChild(eye);
      row.appendChild(name);
      row.appendChild(editBtn);
      layerList.appendChild(row);
    }
  }

  // ===== History snapshot (all layers, overlay cleared) =====
  function snapshot() {
    // Note: overlay is not part of layer pixels until committed.
    const snap = {
      w: canvasW,
      h: canvasH,
      activeLayerIndex,
      layers: layers.map((L) => ({
        name: L.name,
        visible: L.visible,
        data: L.ctx.getImageData(0, 0, canvasW, canvasH),
      })),
    };
    return snap;
  }

  function restoreSnapshot(snap) {
    if (!snap) return;

    // Resize if needed
    if (snap.w !== canvasW || snap.h !== canvasH) {
      resizeAll(snap.w, snap.h, true);
    }

    layers.length = 0;
    snap.layers.forEach((sL) => {
      const L = makeLayer(sL.name || 'Layer');
      L.visible = !!sL.visible;
      L.ctx.putImageData(sL.data, 0, 0);
      layers.push(L);
    });
    activeLayerIndex = clamp(snap.activeLayerIndex || 0, 0, layers.length - 1);

    overlayObj = null;
    hideSelectionOverlay();
    clearLassoOverlay();
    hideCropOverlay();
    updateTransformBox();

    rebuildLayerList();
    redrawAll();
  }

  function saveState() {
    redoStack.length = 0;
    try {
      undoStack.push(snapshot());
      if (undoStack.length > MAX_HISTORY) undoStack.shift();
    } catch (e) {
      console.warn('saveState failed', e);
    }
  }

  function undo() {
    if (!undoStack.length) return;
    try {
      const cur = snapshot();
      redoStack.push(cur);
      const prev = undoStack.pop();
      restoreSnapshot(prev);
    } catch (e) {
      console.warn('undo failed', e);
    }
  }

  function redo() {
    if (!redoStack.length) return;
    try {
      const cur = snapshot();
      undoStack.push(cur);
      const next = redoStack.pop();
      restoreSnapshot(next);
    } catch (e) {
      console.warn('redo failed', e);
    }
  }

  // ===== Rendering =====
  function clearDisplay() {
    ctxDisplay.setTransform(1, 0, 0, 1, 0, 0);
    ctxDisplay.globalCompositeOperation = 'source-over';
    ctxDisplay.clearRect(0, 0, canvasW, canvasH);
  }

  function drawLayerToDisplay(layer) {
    if (!layer || !layer.visible) return;
    ctxDisplay.drawImage(layer.canvas, 0, 0);
  }

  function drawOverlayToDisplay() {
    if (!overlayObj) return;
    ctxDisplay.save();
    ctxDisplay.translate(overlayObj.x, overlayObj.y);
    ctxDisplay.rotate(overlayObj.angle || 0);
    ctxDisplay.drawImage(overlayObj.img, 0, 0, overlayObj.w, overlayObj.h);
    ctxDisplay.restore();
  }

  function redrawAll() {
    clearDisplay();
    for (let i = 0; i < layers.length; i++) drawLayerToDisplay(layers[i]);
    drawOverlayToDisplay();
    renderSymmetryGuide();
  }

  // ===== Resize everything =====
  function resizeAll(w, h, silent = false) {
    if (!silent) saveState();

    canvasW = w;
    canvasH = h;

    displayCanvas.width = w;
    displayCanvas.height = h;

    inputOverlay.width = w;
    inputOverlay.height = h;

    symmetryGuide.width = w;
    symmetryGuide.height = h;

    if (lassoOverlay) {
      lassoOverlay.width = w;
      lassoOverlay.height = h;
    }

    // Scale existing layers into new size
    const oldLayers = layers.map((L) => {
      const tmp = document.createElement('canvas');
      tmp.width = L.canvas.width;
      tmp.height = L.canvas.height;
      tmp.getContext('2d').drawImage(L.canvas, 0, 0);
      return { name: L.name, visible: L.visible, tmp };
    });

    layers.length = 0;
    oldLayers.forEach((o, idx) => {
      const L = makeLayer(o.name || `Layer ${idx + 1}`);
      L.visible = !!o.visible;
      L.ctx.drawImage(o.tmp, 0, 0, w, h);
      layers.push(L);
    });

    if (!layers.length) ensureBaseLayer();

    activeLayerIndex = clamp(activeLayerIndex, 0, layers.length - 1);

    overlayObj = null;
    hideSelectionOverlay();
    clearLassoOverlay();
    hideCropOverlay();
    updateTransformBox();

    rebuildLayerList();
    redrawAll();
  }

  // ===== Layer operations (undoable) =====
  function addLayer() {
    if (layers.length >= MAX_LAYERS) return;
    saveState();

    const newIndex = layers.length + 1;
    const L = makeLayer(`Layer ${newIndex}`);
    layers.push(L);
    activeLayerIndex = layers.length - 1;

    rebuildLayerList();
    redrawAll();
  }

  function deleteActiveLayer() {
    if (layers.length <= 1) return;
    saveState();

    // Commit overlay if it belongs to this layer (safer)
    if (overlayObj) commitOverlay();

    layers.splice(activeLayerIndex, 1);
    activeLayerIndex = clamp(activeLayerIndex, 0, layers.length - 1);

    rebuildLayerList();
    redrawAll();
  }

  function mergeDown() {
    // Merge active layer into the one below (lower in stack).
    if (layers.length <= 1) return;
    if (activeLayerIndex <= 0) return;

    saveState();

    if (overlayObj) commitOverlay();

    const top = layers[activeLayerIndex];
    const below = layers[activeLayerIndex - 1];

    below.ctx.drawImage(top.canvas, 0, 0);
    layers.splice(activeLayerIndex, 1);
    activeLayerIndex = activeLayerIndex - 1;

    rebuildLayerList();
    redrawAll();
  }

  on(btnAddLayer, 'click', addLayer);
  on(btnDeleteLayer, 'click', deleteActiveLayer);
  on(btnMergeDown, 'click', mergeDown);

  // ===== Clear canvas (undoable, clears all layers) =====
  function clearAllLayers() {
    saveState();
    if (overlayObj) overlayObj = null;

    layers.forEach((L) => {
      L.ctx.setTransform(1, 0, 0, 1, 0, 0);
      L.ctx.globalCompositeOperation = 'source-over';
      L.ctx.clearRect(0, 0, canvasW, canvasH);
    });

    hideSelectionOverlay();
    clearLassoOverlay();
    hideCropOverlay();
    updateTransformBox();
    redrawAll();
  }

  on(clearCanvasButton, 'click', clearAllLayers);

  // ===== Brush UI sync =====
  on(brushSizeInput, 'input', () => {
    if (brushSizeValue) brushSizeValue.textContent = brushSizeInput.value;
  });
  on(opacityInput, 'input', () => {
    if (opacityValue) opacityValue.textContent = opacityInput.value;
  });
  on(brushTypeSelect, 'change', () => {
    currentBrush = brushTypeSelect.value;
  });

  // ===== Tool change =====
  on(toolSelect, 'change', () => {
    const nextTool = toolSelect.value;

    // Commit overlay if leaving transform to non-crop tool
    if (currentTool === 'transform' && nextTool !== 'transform' && nextTool !== 'cropImage') {
      commitOverlay();
    }

    currentTool = nextTool;

    // Reset modes
    isSelecting = false;
    selectRect = null;
    hideSelectionOverlay();

    isLassoing = false;
    lassoPoints = [];
    clearLassoOverlay();

    isCropping = false;
    cropRect = null;
    hideCropOverlay();

    updateTransformBox();
    syncShapeOptions();
    redrawAll();
  });

  // ===== Brushes (more distinct, with spacing support) =====
  function brushParams() {
    const size = clamp(parseInt(brushSizeInput ? brushSizeInput.value : '10', 10) || 10, 1, 200);
    const opacity = clamp(parseFloat(opacityInput ? opacityInput.value : '100') || 100, 0, 100);
    const color = brushColorInput ? brushColorInput.value : '#000000';
    return { size, opacity, color };
  }

  function shouldStamp(p) {
    if (brushSpacingPx <= 0) return true;
    return dist(p, lastStampPt) >= brushSpacingPx;
  }

  function beginStroke(pt) {
    strokeHasMoved = false;
    lastPt = { ...pt };
    lastStampPt = { ...pt };
  }

  function stampDot(ctx, x, y, r, color, opacity) {
    ctx.save();
    ctx.fillStyle = hexToRgba(color, opacity);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Distinct brush implementations:
  // Most are stamp-based so spacing makes a visible difference.
  const BRUSH = {
    round(ctx, from, to, p) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = hexToRgba(p.color, p.opacity);
      ctx.lineWidth = p.size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.restore();
    },
    pencil(ctx, from, to, p) {
      // Grainy thin pencil
      const steps = Math.max(1, Math.floor(dist(from, to) / 2));
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = from.x + (to.x - from.x) * t + (Math.random() - 0.5) * (p.size * 0.15);
        const y = from.y + (to.y - from.y) * t + (Math.random() - 0.5) * (p.size * 0.15);
        const r = Math.max(0.6, p.size * 0.18);
        stampDot(ctx, x, y, r, p.color, p.opacity * 0.75);
      }
      ctx.restore();
    },
    sketch(ctx, from, to, p) {
      // Cross-hatch scribble
      const steps = Math.max(1, Math.floor(dist(from, to) / 3));
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = hexToRgba(p.color, p.opacity * 0.7);
      ctx.lineWidth = Math.max(1, p.size * 0.2);
      ctx.lineCap = 'round';
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = from.x + (to.x - from.x) * t;
        const y = from.y + (to.y - from.y) * t;
        const a = (Math.random() * Math.PI) / 2;
        const len = p.size * (0.6 + Math.random() * 0.8);
        ctx.beginPath();
        ctx.moveTo(x - Math.cos(a) * len * 0.5, y - Math.sin(a) * len * 0.5);
        ctx.lineTo(x + Math.cos(a) * len * 0.5, y + Math.sin(a) * len * 0.5);
        ctx.stroke();
      }
      ctx.restore();
    },
    calligraphy(ctx, from, to, p) {
      // Angle pen nib
      const steps = Math.max(1, Math.floor(dist(from, to) / 2));
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = hexToRgba(p.color, p.opacity);
      const angle = -Math.PI / 6;
      const w = p.size * 0.9;
      const h = p.size * 0.28;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = from.x + (to.x - from.x) * t;
        const y = from.y + (to.y - from.y) * t;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.fillRect(-w / 2, -h / 2, w, h);
        ctx.restore();
      }
      ctx.restore();
    },
    marker(ctx, from, to, p) {
      // Soft marker
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = hexToRgba(p.color, p.opacity * 0.65);
      ctx.lineWidth = p.size * 1.1;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = hexToRgba(p.color, p.opacity * 0.25);
      ctx.shadowBlur = Math.max(2, p.size * 0.35);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.restore();
    },
    spray(ctx, from, to, p) {
      const steps = Math.max(1, Math.floor(dist(from, to) / 2));
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = hexToRgba(p.color, p.opacity * 0.7);
      const radius = p.size * 1.2;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = from.x + (to.x - from.x) * t;
        const y = from.y + (to.y - from.y) * t;
        for (let k = 0; k < 26; k++) {
          const a = Math.random() * Math.PI * 2;
          const rr = Math.random() * radius;
          ctx.fillRect(x + Math.cos(a) * rr, y + Math.sin(a) * rr, 1, 1);
        }
      }
      ctx.restore();
    },
    neon(ctx, from, to, p) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = hexToRgba(p.color, p.opacity * 0.9);
      ctx.shadowColor = p.color;
      ctx.shadowBlur = Math.max(8, p.size * 0.9);
      ctx.lineWidth = p.size * 0.8;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.lineWidth = p.size * 0.3;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.restore();
    },
    crayon(ctx, from, to, p) {
      const steps = Math.max(1, Math.floor(dist(from, to) / 2));
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = from.x + (to.x - from.x) * t;
        const y = from.y + (to.y - from.y) * t;
        const jitter = p.size * 0.35;
        const rr = p.size * 0.22;
        stampDot(ctx, x + (Math.random() - 0.5) * jitter, y + (Math.random() - 0.5) * jitter, rr, p.color, p.opacity * 0.85);
        stampDot(ctx, x + (Math.random() - 0.5) * jitter, y + (Math.random() - 0.5) * jitter, rr * 0.7, p.color, p.opacity * 0.55);
      }
      ctx.restore();
    },
    dotted(ctx, from, to, p) {
      const steps = Math.max(1, Math.floor(dist(from, to) / Math.max(2, p.size * 0.6)));
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = from.x + (to.x - from.x) * t;
        const y = from.y + (to.y - from.y) * t;
        stampDot(ctx, x, y, p.size * 0.35, p.color, p.opacity);
      }
      ctx.restore();
    },
    star(ctx, from, to, p) {
      // Star stamps with spacing bias
      const baseStep = Math.max(1, Math.floor(dist(from, to) / Math.max(6, p.size * 0.9)));
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = hexToRgba(p.color, p.opacity);
      ctx.lineWidth = Math.max(1, p.size * 0.12);
      for (let i = 0; i <= baseStep; i++) {
        const t = i / baseStep;
        const x = from.x + (to.x - from.x) * t;
        const y = from.y + (to.y - from.y) * t;
        drawStar(ctx, x, y, 5, p.size * 0.65, p.size * 0.3);
      }
      ctx.restore();
    },
    heart(ctx, from, to, p) {
      // Heart stamps with spacing bias
      const baseStep = Math.max(1, Math.floor(dist(from, to) / Math.max(6, p.size * 0.95)));
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = hexToRgba(p.color, p.opacity);
      ctx.lineWidth = Math.max(1, p.size * 0.12);
      for (let i = 0; i <= baseStep; i++) {
        const t = i / baseStep;
        const x = from.x + (to.x - from.x) * t;
        const y = from.y + (to.y - from.y) * t;
        drawHeart(ctx, x, y, p.size * 0.65);
      }
      ctx.restore();
    },
  };

  function drawStar(ctx, cx, cy, spikes, outerR, innerR) {
    let rot = (Math.PI / 2) * 3;
    const step = Math.PI / spikes;
    ctx.beginPath();
    ctx.moveTo(cx, cy - outerR);
    for (let i = 0; i < spikes; i++) {
      let x = cx + Math.cos(rot) * outerR;
      let y = cy + Math.sin(rot) * outerR;
      ctx.lineTo(x, y);
      rot += step;

      x = cx + Math.cos(rot) * innerR;
      y = cy + Math.sin(rot) * innerR;
      ctx.lineTo(x, y);
      rot += step;
    }
    ctx.closePath();
    ctx.stroke();
  }

  function drawHeart(ctx, cx, cy, size) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(0, -size * 0.3, -size, -size * 0.3, -size, 0);
    ctx.bezierCurveTo(-size, size * 0.5, 0, size, 0, size * 1.2);
    ctx.bezierCurveTo(0, size, size, size * 0.5, size, 0);
    ctx.bezierCurveTo(size, -size * 0.3, 0, -size * 0.3, 0, 0);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  function doBrushStroke(from, to) {
    const L = layerAt(activeLayerIndex);
    if (!L) return;
    const p = brushParams();

    // Eraser uses destination-out
    if (currentTool === 'eraser') {
      L.ctx.save();
      L.ctx.globalCompositeOperation = 'destination-out';
      L.ctx.strokeStyle = `rgba(0,0,0,${clamp(p.opacity, 0, 100) / 100})`;
      L.ctx.lineWidth = p.size;
      L.ctx.lineCap = 'round';
      L.ctx.lineJoin = 'round';
      L.ctx.beginPath();
      L.ctx.moveTo(from.x, from.y);
      L.ctx.lineTo(to.x, to.y);
      L.ctx.stroke();
      L.ctx.restore();
      return;
    }

    const brushName = currentBrush || 'round';
    const fn = BRUSH[brushName] || BRUSH.round;

    // Spacing: if enabled, stamp strokes become discrete.
    if (brushSpacingPx > 0 && brushName !== 'round' && brushName !== 'marker' && brushName !== 'neon') {
      if (!shouldStamp(to)) return;
      lastStampPt = { ...to };
    }

    fn(L.ctx, from, to, p);
  }

  // ===== Fill tool (tolerance + 1px bleed) =====
  function floodFillAt(x, y, hex, opacity100, tolerance = 26, bleed = 1) {
    const L = layerAt(activeLayerIndex);
    if (!L) return;

    const w = canvasW, h = canvasH;
    const img = L.ctx.getImageData(0, 0, w, h);
    const data = img.data;

    const idx0 = (Math.floor(y) * w + Math.floor(x)) * 4;
    const target = [data[idx0], data[idx0 + 1], data[idx0 + 2], data[idx0 + 3]];
    const fill = hexToRgbaArray(hex, opacity100);

    // If already close to fill, skip
    if (rgbaDist(target, fill) <= 2) return;

    const stack = [[Math.floor(x), Math.floor(y)]];
    const seen = new Uint8Array(w * h);

    function matchAt(px, py, tol) {
      if (px < 0 || py < 0 || px >= w || py >= h) return false;
      const k = py * w + px;
      const i = k * 4;
      const cur = [data[i], data[i + 1], data[i + 2], data[i + 3]];
      return rgbaDist(cur, target) <= tol;
    }

    while (stack.length) {
      const [px, py] = stack.pop();
      if (px < 0 || py < 0 || px >= w || py >= h) continue;

      const k = py * w + px;
      if (seen[k]) continue;
      seen[k] = 1;

      const i = k * 4;
      const cur = [data[i], data[i + 1], data[i + 2], data[i + 3]];

      // Main tolerance
      if (rgbaDist(cur, target) > tolerance) continue;

      // Paint
      data[i] = fill[0];
      data[i + 1] = fill[1];
      data[i + 2] = fill[2];
      data[i + 3] = fill[3];

      // Neighbor push
      stack.push([px + 1, py]);
      stack.push([px - 1, py]);
      stack.push([px, py + 1]);
      stack.push([px, py - 1]);
    }

    // Bleed: attempt to fill tiny 1px gaps under outlines
    if (bleed > 0) {
      const copy = new Uint8ClampedArray(data);
      for (let py = 1; py < h - 1; py++) {
        for (let px = 1; px < w - 1; px++) {
          const k = py * w + px;
          const i = k * 4;

          // If pixel not filled but is within a looser tolerance and neighbors are filled, fill it.
          const cur = [copy[i], copy[i + 1], copy[i + 2], copy[i + 3]];
          const closeEnough = rgbaDist(cur, target) <= tolerance + 12;

          if (!closeEnough) continue;

          // Check if any 4-neighbor is already filled
          const n = (py - 1) * w + px;
          const s = (py + 1) * w + px;
          const e = py * w + (px + 1);
          const wq = py * w + (px - 1);

          const ni = n * 4, si = s * 4, ei = e * 4, wi = wq * 4;

          const neighborIsFill =
            (copy[ni] === fill[0] && copy[ni + 1] === fill[1] && copy[ni + 2] === fill[2] && copy[ni + 3] === fill[3]) ||
            (copy[si] === fill[0] && copy[si + 1] === fill[1] && copy[si + 2] === fill[2] && copy[si + 3] === fill[3]) ||
            (copy[ei] === fill[0] && copy[ei + 1] === fill[1] && copy[ei + 2] === fill[2] && copy[ei + 3] === fill[3]) ||
            (copy[wi] === fill[0] && copy[wi + 1] === fill[1] && copy[wi + 2] === fill[2] && copy[wi + 3] === fill[3]);

          if (neighborIsFill) {
            data[i] = fill[0];
            data[i + 1] = fill[1];
            data[i + 2] = fill[2];
            data[i + 3] = fill[3];
          }
        }
      }
    }

    L.ctx.putImageData(img, 0, 0);
  }

  // ===== Shapes tool (preview on input overlay) =====
  let shapeActive = false;
  let shapeStart = { x: 0, y: 0 };

  function drawShapePreview(from, to) {
    ctxInputOverlay.clearRect(0, 0, canvasW, canvasH);

    const p = brushParams();
    ctxInputOverlay.save();
    ctxInputOverlay.strokeStyle = hexToRgba(p.color, p.opacity);
    ctxInputOverlay.lineWidth = p.size;
    ctxInputOverlay.lineCap = 'round';
    ctxInputOverlay.lineJoin = 'round';

    const shape = shapeTypeSelect ? shapeTypeSelect.value : 'line';
    const w = to.x - from.x;
    const h = to.y - from.y;

    if (shape === 'line' || shape === 'dottedLine') {
      if (shape === 'dottedLine') ctxInputOverlay.setLineDash([2, 6]);
      ctxInputOverlay.beginPath();
      ctxInputOverlay.moveTo(from.x, from.y);
      ctxInputOverlay.lineTo(to.x, to.y);
      ctxInputOverlay.stroke();
      ctxInputOverlay.setLineDash([]);
    } else if (shape === 'rectangle' || shape === 'dottedRectangle') {
      if (shape === 'dottedRectangle') ctxInputOverlay.setLineDash([2, 6]);
      ctxInputOverlay.strokeRect(from.x, from.y, w, h);
      ctxInputOverlay.setLineDash([]);
    } else if (shape === 'circle') {
      const r = Math.sqrt(w * w + h * h);
      ctxInputOverlay.beginPath();
      ctxInputOverlay.arc(from.x, from.y, r, 0, Math.PI * 2);
      ctxInputOverlay.stroke();
    } else if (shape === 'ellipse' || shape === 'oval') {
      ctxInputOverlay.beginPath();
      ctxInputOverlay.ellipse(from.x + w / 2, from.y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
      ctxInputOverlay.stroke();
    } else if (shape === 'star') {
      const r = Math.max(Math.abs(w), Math.abs(h));
      drawStar(ctxInputOverlay, from.x, from.y, 5, r, r / 2);
    } else if (shape === 'heart') {
      drawHeart(ctxInputOverlay, from.x, from.y, Math.max(Math.abs(w), Math.abs(h)));
    }

    ctxInputOverlay.restore();
  }

  function commitShape(from, to) {
    const L = layerAt(activeLayerIndex);
    if (!L) return;

    saveState();
    ctxInputOverlay.clearRect(0, 0, canvasW, canvasH);

    const p = brushParams();
    L.ctx.save();
    L.ctx.strokeStyle = hexToRgba(p.color, p.opacity);
    L.ctx.lineWidth = p.size;
    L.ctx.lineCap = 'round';
    L.ctx.lineJoin = 'round';

    const shape = shapeTypeSelect ? shapeTypeSelect.value : 'line';
    const w = to.x - from.x;
    const h = to.y - from.y;

    if (shape === 'line' || shape === 'dottedLine') {
      if (shape === 'dottedLine') L.ctx.setLineDash([2, 6]);
      L.ctx.beginPath();
      L.ctx.moveTo(from.x, from.y);
      L.ctx.lineTo(to.x, to.y);
      L.ctx.stroke();
      L.ctx.setLineDash([]);
    } else if (shape === 'rectangle' || shape === 'dottedRectangle') {
      if (shape === 'dottedRectangle') L.ctx.setLineDash([2, 6]);
      L.ctx.strokeRect(from.x, from.y, w, h);
      L.ctx.setLineDash([]);
    } else if (shape === 'circle') {
      const r = Math.sqrt(w * w + h * h);
      L.ctx.beginPath();
      L.ctx.arc(from.x, from.y, r, 0, Math.PI * 2);
      L.ctx.stroke();
    } else if (shape === 'ellipse' || shape === 'oval') {
      L.ctx.beginPath();
      L.ctx.ellipse(from.x + w / 2, from.y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
      L.ctx.stroke();
    } else if (shape === 'star') {
      const r = Math.max(Math.abs(w), Math.abs(h));
      drawStar(L.ctx, from.x, from.y, 5, r, r / 2);
    } else if (shape === 'heart') {
      drawHeart(L.ctx, from.x, from.y, Math.max(Math.abs(w), Math.abs(h)));
    }

    L.ctx.restore();
    redrawAll();
  }

  // ===== Overlay / Transform =====
  function updateTransformBox() {
    if (!transformBox) return;
    if (!overlayObj || currentTool !== 'transform') {
      transformBox.style.display = 'none';
      return;
    }
    transformBox.style.display = 'block';
    transformBox.style.width = `${overlayObj.w}px`;
    transformBox.style.height = `${overlayObj.h}px`;
    transformBox.style.transform = `translate(${overlayObj.x}px, ${overlayObj.y}px) rotate(${overlayObj.angle || 0}rad)`;
  }

  function renderOverlayOnly() {
    redrawAll();
    updateTransformBox();
  }

  function commitOverlay() {
    if (!overlayObj) return;
    const L = layerAt(overlayObj.sourceLayerIndex != null ? overlayObj.sourceLayerIndex : activeLayerIndex);
    if (!L) {
      overlayObj = null;
      updateTransformBox();
      redrawAll();
      return;
    }

    saveState();

    // Draw overlay into its source layer (keeps quality)
    L.ctx.save();
    L.ctx.translate(overlayObj.x, overlayObj.y);
    L.ctx.rotate(overlayObj.angle || 0);
    L.ctx.drawImage(overlayObj.img, 0, 0, overlayObj.w, overlayObj.h);
    L.ctx.restore();

    overlayObj = null;
    updateTransformBox();
    redrawAll();
  }

  // ===== Selection (rect) to overlay, no duplication =====
  function extractRectToOverlay(rect) {
    const L = layerAt(activeLayerIndex);
    if (!L) return;
    if (rect.w < 1 || rect.h < 1) return;

    // Create offscreen at exact pixels (no quality loss)
    const off = document.createElement('canvas');
    off.width = Math.max(1, Math.round(rect.w));
    off.height = Math.max(1, Math.round(rect.h));
    const offCtx = off.getContext('2d');

    // Draw from layer canvas (not display) to preserve exact layer pixels
    offCtx.drawImage(L.canvas, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);

    const img = new Image();
    img.onload = () => {
      saveState();

      // Cut region from layer
      L.ctx.clearRect(rect.x, rect.y, rect.w, rect.h);

      overlayObj = {
        img,
        x: rect.x,
        y: rect.y,
        w: rect.w,
        h: rect.h,
        angle: 0,
        source: 'layer',
        sourceLayerIndex: activeLayerIndex,
        cutShape: 'rect',
      };

      toolSelect.value = 'transform';
      currentTool = 'transform';
      syncShapeOptions();
      hideSelectionOverlay();
      selectRect = null;

      updateTransformBox();
      renderOverlayOnly();
    };
    img.src = off.toDataURL('image/png');
  }

  // ===== Lasso to overlay, no duplication =====
  function createClosedPath(ctx, points, offsetX = 0, offsetY = 0) {
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const x = p.x - offsetX;
      const y = p.y - offsetY;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function finalizeLassoSelection() {
    if (!lassoPoints || lassoPoints.length < 3) {
      isLassoing = false;
      lassoPoints = [];
      clearLassoOverlay();
      return;
    }

    const L = layerAt(activeLayerIndex);
    if (!L) return;

    // Bounds
    const xs = lassoPoints.map((p) => p.x);
    const ys = lassoPoints.map((p) => p.y);
    const bounds = {
      x: Math.floor(Math.min(...xs)),
      y: Math.floor(Math.min(...ys)),
      w: Math.ceil(Math.max(...xs) - Math.min(...xs)),
      h: Math.ceil(Math.max(...ys) - Math.min(...ys)),
    };
    if (bounds.w < 2 || bounds.h < 2) {
      isLassoing = false;
      lassoPoints = [];
      clearLassoOverlay();
      return;
    }

    // Offscreen exact extract with clip
    const off = document.createElement('canvas');
    off.width = bounds.w;
    off.height = bounds.h;
    const offCtx = off.getContext('2d');

    offCtx.save();
    createClosedPath(offCtx, lassoPoints, bounds.x, bounds.y);
    offCtx.clip();
    offCtx.drawImage(L.canvas, -bounds.x, -bounds.y);
    offCtx.restore();

    const img = new Image();
    img.onload = () => {
      saveState();

      // Cut from layer using same clip path
      L.ctx.save();
      createClosedPath(L.ctx, lassoPoints, 0, 0);
      L.ctx.clip();
      L.ctx.clearRect(bounds.x, bounds.y, bounds.w, bounds.h);
      L.ctx.restore();

      overlayObj = {
        img,
        x: bounds.x,
        y: bounds.y,
        w: bounds.w,
        h: bounds.h,
        angle: 0,
        source: 'layer',
        sourceLayerIndex: activeLayerIndex,
        cutShape: 'lasso',
        maskPoints: lassoPoints.map((p) => ({ x: p.x, y: p.y })),
        bounds: { ...bounds },
      };

      // Switch to transform
      toolSelect.value = 'transform';
      currentTool = 'transform';
      syncShapeOptions();

      // Reset lasso overlay
      isLassoing = false;
      lassoPoints = [];
      clearLassoOverlay();

      updateTransformBox();
      renderOverlayOnly();
    };
    img.src = off.toDataURL('image/png');
  }

  // ===== Crop tool (works on overlay only, non-rotated) =====
  function cropOverlayToRect(rect) {
    if (!overlayObj) return;
    if (Math.abs(overlayObj.angle || 0) > 0.0001) {
      alert('Crop supports only non-rotated overlay. Please set rotation to 0 first.');
      return;
    }

    // Intersect crop rect with overlay bounds (canvas coords)
    const ox1 = overlayObj.x;
    const oy1 = overlayObj.y;
    const ox2 = overlayObj.x + overlayObj.w;
    const oy2 = overlayObj.y + overlayObj.h;

    const cx1 = rect.x;
    const cy1 = rect.y;
    const cx2 = rect.x + rect.w;
    const cy2 = rect.y + rect.h;

    const ix1 = Math.max(ox1, cx1);
    const iy1 = Math.max(oy1, cy1);
    const ix2 = Math.min(ox2, cx2);
    const iy2 = Math.min(oy2, cy2);

    const iw = Math.max(0, ix2 - ix1);
    const ih = Math.max(0, iy2 - iy1);
    if (iw < 1 || ih < 1) return;

    // Map to source image pixels
    const imgW = overlayObj.img.naturalWidth || overlayObj.img.width;
    const imgH = overlayObj.img.naturalHeight || overlayObj.img.height;

    const sx = ((ix1 - overlayObj.x) / overlayObj.w) * imgW;
    const sy = ((iy1 - overlayObj.y) / overlayObj.h) * imgH;
    const sw = (iw / overlayObj.w) * imgW;
    const sh = (ih / overlayObj.h) * imgH;

    const off = document.createElement('canvas');
    off.width = Math.max(1, Math.round(sw));
    off.height = Math.max(1, Math.round(sh));
    const offCtx = off.getContext('2d');
    offCtx.drawImage(overlayObj.img, sx, sy, sw, sh, 0, 0, off.width, off.height);

    const cropped = new Image();
    cropped.onload = () => {
      saveState();
      overlayObj.img = cropped;
      overlayObj.x = ix1;
      overlayObj.y = iy1;
      overlayObj.w = iw;
      overlayObj.h = ih;
      overlayObj.angle = 0;

      hideCropOverlay();
      cropRect = null;

      updateTransformBox();
      renderOverlayOnly();
    };
    cropped.src = off.toDataURL('image/png');
  }

  // ===== Clipboard =====
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
    overlayObj = null;
    updateTransformBox();
    redrawAll();
  }

  function pasteClipboardAsOverlay() {
    if (!clipboardObj) return;
    const img = new Image();
    img.onload = () => {
      saveState();
      const w = clipboardObj.w;
      const h = clipboardObj.h;
      const x = Math.floor((canvasW - w) / 2);
      const y = Math.floor((canvasH - h) / 2);
      overlayObj = {
        img,
        x,
        y,
        w,
        h,
        angle: 0,
        source: 'layer',
        sourceLayerIndex: activeLayerIndex,
        cutShape: 'rect',
      };
      toolSelect.value = 'transform';
      currentTool = 'transform';
      syncShapeOptions();
      updateTransformBox();
      renderOverlayOnly();
    };
    img.src = clipboardObj.dataUrl;
  }

  // ===== Flip canvas (all layers, undoable) =====
  function flipAllHorizontal() {
    saveState();
    if (overlayObj) commitOverlay();

    layers.forEach((L) => {
      const off = document.createElement('canvas');
      off.width = canvasW;
      off.height = canvasH;
      const oc = off.getContext('2d');
      oc.drawImage(L.canvas, 0, 0);

      L.ctx.save();
      L.ctx.setTransform(-1, 0, 0, 1, canvasW, 0);
      L.ctx.clearRect(0, 0, canvasW, canvasH);
      L.ctx.drawImage(off, 0, 0);
      L.ctx.restore();
    });

    redrawAll();
  }

  on(flipCanvasButton, 'click', flipAllHorizontal);

  // ===== Image insertion (as overlay -> transform) =====
  on(addImageButton, 'click', () => addImageInput && addImageInput.click());
  on(addImageInput, 'change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        saveState();

        const scale = Math.min(canvasW / img.width, canvasH / img.height, 1);
        const w = Math.floor(img.width * scale);
        const h = Math.floor(img.height * scale);
        const x = Math.floor((canvasW - w) / 2);
        const y = Math.floor((canvasH - h) / 2);

        overlayObj = {
          img,
          x,
          y,
          w,
          h,
          angle: 0,
          source: 'layer',
          sourceLayerIndex: activeLayerIndex,
          cutShape: 'rect',
        };

        toolSelect.value = 'transform';
        currentTool = 'transform';
        syncShapeOptions();

        updateTransformBox();
        renderOverlayOnly();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
    addImageInput.value = '';
  });

  // ===== Download =====
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
    exportCanvas.width = canvasW;
    exportCanvas.height = canvasH;
    const exportCtx = exportCanvas.getContext('2d');

    if (fillColor) {
      exportCtx.fillStyle = fillColor;
      exportCtx.fillRect(0, 0, canvasW, canvasH);
    }

    // Composite layers
    layers.forEach((L) => {
      if (!L.visible) return;
      exportCtx.drawImage(L.canvas, 0, 0);
    });

    // If overlay exists, export it too (without committing)
    if (overlayObj) {
      exportCtx.save();
      exportCtx.translate(overlayObj.x, overlayObj.y);
      exportCtx.rotate(overlayObj.angle || 0);
      exportCtx.drawImage(overlayObj.img, 0, 0, overlayObj.w, overlayObj.h);
      exportCtx.restore();
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

  on(downloadCanvasButton, 'click', () => {
    const format = downloadFormatSelect ? downloadFormatSelect.value : 'png';
    const link = document.createElement('a');
    link.download = getDownloadFilename(format);
    link.href = getDownloadDataUrl(format);
    link.click();
  });

  // ===== Transform interactions (uses existing #transformBox handles if present) =====
  on(transformBox, 'pointerdown', (e) => {
    if (!overlayObj || currentTool !== 'transform') return;

    transformBox.setPointerCapture(e.pointerId);

    const t = e.target;
    const isRotate = t && t.dataset && t.dataset.rotate === 'true';
    const handle = t && t.dataset ? t.dataset.handle || null : null;

    transformMode = isRotate ? 'rotate' : handle ? 'resize' : 'move';
    activeHandle = handle;

    const p = canvasPointFromEvent(e);
    startMouse = p;
    startState = {
      x: overlayObj.x,
      y: overlayObj.y,
      w: overlayObj.w,
      h: overlayObj.h,
      angle: overlayObj.angle || 0,
    };

    e.preventDefault();
  });

  on(transformBox, 'pointermove', (e) => {
    if (!overlayObj || currentTool !== 'transform' || !transformMode) return;
    const p = canvasPointFromEvent(e);
    const dx = p.x - startMouse.x;
    const dy = p.y - startMouse.y;

    if (transformMode === 'move') {
      overlayObj.x = startState.x + dx;
      overlayObj.y = startState.y + dy;
    } else if (transformMode === 'resize') {
      let x = startState.x;
      let y = startState.y;
      let w = startState.w;
      let h = startState.h;
      const aspect = w / h;
      const keepAspect = e.shiftKey;

      const applyResize = (left, top, right, bottom) => {
        if (left) { x = startState.x + dx; w = startState.w - dx; }
        if (right) { w = startState.w + dx; }
        if (top) { y = startState.y + dy; h = startState.h - dy; }
        if (bottom) { h = startState.h + dy; }
        w = Math.max(5, w);
        h = Math.max(5, h);
        if (keepAspect) {
          const newAspect = w / h;
          if (newAspect > aspect) h = w / aspect;
          else w = h * aspect;
        }
        if (left) x = startState.x + (startState.w - w);
        if (top) y = startState.y + (startState.h - h);
      };

      const map = {
        nw: [true, true, false, false],
        n: [false, true, false, false],
        ne: [false, true, true, false],
        e: [false, false, true, false],
        se: [false, false, true, true],
        s: [false, false, false, true],
        sw: [true, false, false, true],
        w: [true, false, false, false],
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
      const a0 = Math.atan2(startMouse.y - cy, startMouse.x - cx);
      const a1 = Math.atan2(p.y - cy, p.x - cx);
      overlayObj.angle = startState.angle + (a1 - a0);
    }

    updateTransformBox();
    renderOverlayOnly();
  });

  on(transformBox, 'pointerup', (e) => {
    if (!transformMode) return;
    transformBox.releasePointerCapture(e.pointerId);
    transformMode = null;
    activeHandle = null;
  });

  // Double click commits transform
  on(transformBox, 'dblclick', () => commitOverlay());

  // ===== Keyboard shortcuts =====
  on(document, 'keydown', (e) => {
    const key = (e.key || '').toLowerCase();
    const ctrlOrCmd = e.ctrlKey || e.metaKey;

    const t = e.target;
    const isTypingTarget =
      t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);

    const prevent = () => {
      e.preventDefault();
      e.stopPropagation();
    };

    // Escape cancels active interactions
    if (key === 'escape') {
      prevent();
      isSelecting = false;
      isLassoing = false;
      isCropping = false;
      selectRect = null;
      cropRect = null;
      hideSelectionOverlay();
      clearLassoOverlay();
      hideCropOverlay();
      transformMode = null;
      activeHandle = null;
      redrawAll();
      return;
    }

    if (!ctrlOrCmd) return;

    // Undo / Redo
    if (key === 'z' && !e.shiftKey) {
      if (!isTypingTarget) {
        prevent();
        undo();
      }
      return;
    }
    if (key === 'y' || (key === 'z' && e.shiftKey)) {
      if (!isTypingTarget) {
        prevent();
        redo();
      }
      return;
    }

    // Copy/Cut/Paste overlay
    if (key === 'c') {
      if (!isTypingTarget) {
        prevent();
        copyOverlayToClipboard();
      }
      return;
    }
    if (key === 'x') {
      if (!isTypingTarget) {
        prevent();
        if (overlayObj) cutOverlayToClipboard();
      }
      return;
    }
    if (key === 'v') {
      if (!isTypingTarget) {
        prevent();
        pasteClipboardAsOverlay();
      }
      return;
    }

    // Save/Download
    if (key === 's') {
      if (!isTypingTarget) {
        prevent();
        if (downloadCanvasButton) downloadCanvasButton.click();
      }
      return;
    }

    // New canvas
    if (key === 'n') {
      if (!isTypingTarget) {
        prevent();
        openNewCanvasModal();
      }
      return;
    }

    // Commit overlay
    if (key === 'enter') {
      if (!isTypingTarget && currentTool === 'transform' && overlayObj) {
        prevent();
        commitOverlay();
      }
    }
  });

  // ===== Pointer input (ALL tools work here) =====
  function beginTool(pt) {
    if (overlayObj && currentTool !== 'transform' && currentTool !== 'cropImage') {
      // Keep overlay unless explicitly committed by changing tools; safe to still draw underneath by committing
      // We choose to commit for sanity when starting a new action in other tools.
      commitOverlay();
    }

    if (currentTool === 'pen' || currentTool === 'eraser') {
      saveState();
      beginStroke(pt);
      isPointerDown = true;
      // Single click stamp
      doBrushStroke(pt, pt);

      // Symmetry mirror
      if (symmetryCheckbox && symmetryCheckbox.checked) {
        const m = { x: canvasW - pt.x, y: pt.y };
        doBrushStroke(m, m);
      }

      redrawAll();
      return;
    }

    if (currentTool === 'fill') {
      saveState();
      const p = brushParams();
      floodFillAt(pt.x, pt.y, p.color, p.opacity, 26, 1);
      redrawAll();
      return;
    }

    if (currentTool === 'shape') {
      shapeActive = true;
      shapeStart = { ...pt };
      ctxInputOverlay.clearRect(0, 0, canvasW, canvasH);
      isPointerDown = true;
      return;
    }

    if (currentTool === 'select') {
      isSelecting = true;
      selectStart = { ...pt };
      selectRect = { x: pt.x, y: pt.y, w: 0, h: 0 };
      showSelectionOverlay(pt.x, pt.y, 0, 0);
      isPointerDown = true;
      return;
    }

    if (currentTool === 'lasso') {
      isLassoing = true;
      lassoPoints = [{ ...pt }];
      drawLassoOverlay(lassoPoints);
      isPointerDown = true;
      return;
    }

    if (currentTool === 'text') {
      // Text to active layer
      const text = prompt('Enter text (Use \\n for new lines):', 'Text');
      if (!text) return;
      saveState();

      const L = layerAt(activeLayerIndex);
      const p = brushParams();
      const size = Math.max(6, p.size);
      L.ctx.save();
      L.ctx.fillStyle = hexToRgba(p.color, p.opacity);
      L.ctx.textBaseline = 'top';
      L.ctx.font = `${size}px Arial`;
      const lines = String(text).split('\n');
      const lineH = Math.round(size * 1.2);
      for (let i = 0; i < lines.length; i++) {
        L.ctx.fillText(lines[i], pt.x, pt.y + i * lineH);
      }
      L.ctx.restore();

      redrawAll();
      return;
    }

    if (currentTool === 'cropImage') {
      // Crop works only when overlay exists
      if (!overlayObj) return;
      isCropping = true;
      cropStart = { ...pt };
      cropRect = { x: pt.x, y: pt.y, w: 0, h: 0 };
      showCropOverlay(pt.x, pt.y, 0, 0);
      isPointerDown = true;
      return;
    }
  }

  function moveTool(pt) {
    if (!isPointerDown) return;

    if (currentTool === 'pen' || currentTool === 'eraser') {
      strokeHasMoved = true;

      const from = { ...lastPt };
      const to = { ...pt };

      // Spacing: for all brushes, also skip if spacing requires
      if (brushSpacingPx > 0) {
        if (!shouldStamp(to)) {
          lastPt = to;
          return;
        }
        lastStampPt = { ...to };
      }

      doBrushStroke(from, to);
      if (symmetryCheckbox && symmetryCheckbox.checked) {
        const mf = { x: canvasW - from.x, y: from.y };
        const mt = { x: canvasW - to.x, y: to.y };
        doBrushStroke(mf, mt);
      }

      lastPt = to;
      redrawAll();
      return;
    }

    if (currentTool === 'shape' && shapeActive) {
      drawShapePreview(shapeStart, pt);
      return;
    }

    if (currentTool === 'select' && isSelecting) {
      const x1 = Math.min(selectStart.x, pt.x);
      const y1 = Math.min(selectStart.y, pt.y);
      const w = Math.abs(pt.x - selectStart.x);
      const h = Math.abs(pt.y - selectStart.y);
      selectRect = { x: x1, y: y1, w, h };
      showSelectionOverlay(x1, y1, w, h);
      return;
    }

    if (currentTool === 'lasso' && isLassoing) {
      const last = lassoPoints[lassoPoints.length - 1];
      if (!last || dist(last, pt) > 1) lassoPoints.push({ ...pt });
      drawLassoOverlay(lassoPoints);
      return;
    }

    if (currentTool === 'cropImage' && isCropping && cropRect) {
      const x1 = Math.min(cropStart.x, pt.x);
      const y1 = Math.min(cropStart.y, pt.y);
      const w = Math.abs(pt.x - cropStart.x);
      const h = Math.abs(pt.y - cropStart.y);
      cropRect = { x: x1, y: y1, w, h };
      showCropOverlay(x1, y1, w, h);
      return;
    }
  }

  function endTool(pt) {
    if (!isPointerDown) return;
    isPointerDown = false;

    if (currentTool === 'shape' && shapeActive) {
      shapeActive = false;
      commitShape(shapeStart, pt);
      ctxInputOverlay.clearRect(0, 0, canvasW, canvasH);
      return;
    }

    if (currentTool === 'select' && isSelecting) {
      isSelecting = false;
      hideSelectionOverlay();

      if (selectRect && selectRect.w >= 1 && selectRect.h >= 1) {
        extractRectToOverlay(selectRect);
      }
      selectRect = null;
      return;
    }

    if (currentTool === 'lasso' && isLassoing) {
      isLassoing = false;
      // Ensure last point is included
      const last = lassoPoints[lassoPoints.length - 1];
      if (!last || dist(last, pt) > 1) lassoPoints.push({ ...pt });
      drawLassoOverlay(lassoPoints);
      finalizeLassoSelection();
      return;
    }

    if (currentTool === 'cropImage' && isCropping) {
      isCropping = false;
      hideCropOverlay();
      if (cropRect && cropRect.w >= 1 && cropRect.h >= 1) {
        cropOverlayToRect(cropRect);
      }
      cropRect = null;
      return;
    }
  }

  on(inputOverlay, 'pointerdown', (e) => {
    inputOverlay.setPointerCapture(e.pointerId);
    const pt = canvasPointFromEvent(e);
    beginTool(pt);
  });

  on(inputOverlay, 'pointermove', (e) => {
    const pt = canvasPointFromEvent(e);
    moveTool(pt);
  });

  on(inputOverlay, 'pointerup', (e) => {
    const pt = canvasPointFromEvent(e);
    endTool(pt);
  });

  on(inputOverlay, 'pointercancel', () => {
    isPointerDown = false;
    isSelecting = false;
    isLassoing = false;
    isCropping = false;
    shapeActive = false;
    hideSelectionOverlay();
    clearLassoOverlay();
    hideCropOverlay();
    ctxInputOverlay.clearRect(0, 0, canvasW, canvasH);
  });

  // ===== Undo/Redo buttons =====
  on(undoCanvasButton, 'click', undo);
  on(redoCanvasButton, 'click', redo);

  // ===== Symmetry toggle =====
  on(symmetryCheckbox, 'change', renderSymmetryGuide);

  // ===== Tool dropdown safe defaults =====
  function normalizeBrushOptions() {
    // If your HTML still has old options, we map them to new ones.
    const map = {
      square: 'marker',
      textured: 'sketch',
      airbrush: 'spray',
      watercolor: 'marker',
      chalk: 'crayon',
      oil: 'marker',
      glitter: 'spray',
      pattern: 'dotted',
      zigzag: 'sketch',
      scatter: 'spray',
    };
    if (map[currentBrush]) currentBrush = map[currentBrush];
  }

  // ===== Initial =====
  ensureBaseLayer();
  rebuildLayerList();
  syncShapeOptions();
  normalizeBrushOptions();
  redrawAll();
  renderSymmetryGuide();
});

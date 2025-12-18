document.addEventListener('DOMContentLoaded', () => {
  // Canvas & state
  const canvas = document.getElementById('drawingCanvas');
  const ctx = canvas.getContext('2d');
  let isDrawing = false;
  let lastX = 0, lastY = 0;
  let savedImageData = null;
  let currentTool = document.getElementById('tool').value;
  let currentBrush = document.getElementById('brushType').value;
  let undoStack = [];
  let redoStack = [];
  const MAX_HISTORY = 50;

  // UI elements
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
  const downloadCanvasButton = document.getElementById('downloadCanvas');
  const darkModeToggle = document.getElementById('darkModeToggle');
  const shapeOptionsDiv = document.getElementById('shapeOptions');
  const shapeTypeSelect = document.getElementById('shapeType');
  const symmetryCheckbox = document.getElementById('symmetry');
  const canvasContainer = document.getElementById('canvasContainer');

  // Overlays & transform
  const selectionOverlay = document.getElementById('selectionOverlay');
  const cropOverlay = document.getElementById('cropOverlay');
  const transformBox = document.getElementById('transformBox');

  // Overlay state: can represent an inserted image OR a selected region
  let overlayObj = null; // { img: HTMLImageElement, x, y, w, h, angle }
  let baseImageData = null; // snapshot of canvas under overlay
  let transformMode = null; // 'move' | 'resize' | 'rotate'
  let activeHandle = null;
  let startMouse = { x: 0, y: 0 };
  let startState = null; // { x, y, w, h, angle }

  // Selection state
  let isSelecting = false;
  let selectStartX = 0, selectStartY = 0;
  let selectRect = null; // { x, y, w, h }

  // CROP IMAGE
  let isCropping = false, cropStartX = 0, cropStartY = 0, cropRect = null;

  // THEME (body.dark + localStorage + emoji ☀️ / 🌙)
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

  // HISTORY (save once before change)
  function saveState() {
    redoStack = [];
    try {
      undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
      if (undoStack.length > MAX_HISTORY) undoStack.shift();
    } catch (e) {}
  }
  function undo() {
    if (!undoStack.length) return;
    try {
      redoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
      const prev = undoStack.pop();
      ctx.putImageData(prev, 0, 0);
      if (overlayObj) baseImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      renderOverlay();
    } catch (e) {}
  }
  function redo() {
    if (!redoStack.length) return;
    try {
      undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
      const next = redoStack.pop();
      ctx.putImageData(next, 0, 0);
      if (overlayObj) baseImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      renderOverlay();
    } catch (e) {}
  }

  // COLOR UTILS
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
  function matchColors(a, b) { return a[0]===b[0] && a[1]===b[1] && a[2]===b[2] && a[3]===b[3]; }
  function matchColorsAt(i, t, d) { return d[i]===t[0] && d[i+1]===t[1] && d[i+2]===t[2] && d[i+3]===t[3]; }
  function setPixelColor(i, c, d) { d[i]=c[0]; d[i+1]=c[1]; d[i+2]=c[2]; d[i+3]=c[3]; }

  // FLOOD FILL
  function floodFill(startX, startY, fillColor) {
    const width = canvas.width, height = canvas.height;
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const stack = [];
    const startPos = (startY * width + startX) * 4;
    const targetColor = data.slice(startPos, startPos + 4);
    const fillColorArr = hexToRgbaArray(fillColor, opacityInput.value);
    if (matchColors(targetColor, fillColorArr)) return;

    stack.push([startX, startY]);
    while (stack.length) {
      let [x, y] = stack.pop();
      let pixelPos = (y * width + x) * 4;
      while (y >= 0 && matchColorsAt(pixelPos, targetColor, data)) { y--; pixelPos -= width * 4; }
      y++; pixelPos += width * 4;
      let reachLeft = false, reachRight = false;
      while (y < height && matchColorsAt(pixelPos, targetColor, data)) {
        setPixelColor(pixelPos, fillColorArr, data);
        if (x > 0) {
          if (matchColorsAt(pixelPos - 4, targetColor, data)) { if (!reachLeft) { stack.push([x - 1, y]); reachLeft = true; } }
          else reachLeft = false;
        }
        if (x < width - 1) {
          if (matchColorsAt(pixelPos + 4, targetColor, data)) { if (!reachRight) { stack.push([x + 1, y]); reachRight = true; } }
          else reachRight = false;
        }
        y++; pixelPos += width * 4;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  // SHAPES
  function drawStar(cx, cy, spikes, outerRadius, innerRadius) {
    let rot = (Math.PI / 2) * 3, x = cx, y = cy, step = Math.PI / spikes;
    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
      x = cx + Math.cos(rot) * outerRadius; y = cy + Math.sin(rot) * outerRadius; ctx.lineTo(x, y); rot += step;
      x = cx + Math.cos(rot) * innerRadius; y = cy + Math.sin(rot) * innerRadius; ctx.lineTo(x, y); rot += step;
    }
    ctx.closePath(); ctx.stroke();
  }
  function drawHeart(cx, cy, size) {
    ctx.save(); ctx.beginPath(); ctx.translate(cx, cy); ctx.moveTo(0, 0);
    ctx.bezierCurveTo(0, -size * 0.3, -size, -size * 0.3, -size, 0);
    ctx.bezierCurveTo(-size, size * 0.5, 0, size, 0, size * 1.2);
    ctx.bezierCurveTo(0, size, size, size * 0.5, size, 0);
    ctx.bezierCurveTo(size, -size * 0.3, 0, -size * 0.3, 0, 0);
    ctx.closePath(); ctx.stroke(); ctx.restore();
  }

  // BRUSHES
  const brushFunctions = {
    round(e, x, y, size, color, opacity) { ctx.strokeStyle = hexToRgba(color, opacity); ctx.lineWidth = size; ctx.lineCap = 'round'; ctx.lineTo(x, y); ctx.stroke(); },
    square(e, x, y, size, color, opacity) { ctx.fillStyle = hexToRgba(color, opacity); ctx.fillRect(x - size / 2, y - size / 2, size, size); },
    dotted(e, x, y, size, color, opacity) { ctx.fillStyle = hexToRgba(color, opacity); ctx.beginPath(); ctx.arc(x, y, size / 2, 0, Math.PI * 2); ctx.fill(); },
    spray(e, x, y, size, color, opacity) { ctx.fillStyle = hexToRgba(color, opacity); for (let i = 0; i < 30; i++) { const ox=(Math.random()-0.5)*size*2, oy=(Math.random()-0.5)*size*2; ctx.fillRect(x+ox, y+oy, 1, 1);} },
    calligraphy(e, x, y, size, color, opacity) { ctx.strokeStyle = hexToRgba(color, opacity); ctx.lineWidth = size; ctx.lineCap = 'butt'; ctx.lineTo(x + size / 2, y); ctx.stroke(); },
    splatter(e, x, y, size, color, opacity) { ctx.fillStyle = hexToRgba(color, opacity); for (let i = 0; i < 20; i++) { const a=Math.random()*Math.PI*2, r=Math.random()*size; ctx.beginPath(); ctx.arc(x+Math.cos(a)*r, y+Math.sin(a)*r, size/10, 0, Math.PI*2); ctx.fill(); } },
    watercolor(e, x, y, size, color, opacity) { ctx.strokeStyle = hexToRgba(color, opacity * 0.7); ctx.lineWidth = size; ctx.lineCap = 'round'; ctx.lineTo(x, y); ctx.stroke(); },
    chalk(e, x, y, size, color, opacity) { ctx.fillStyle = hexToRgba(color, opacity * 0.5); for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(x+Math.random()*size-size/2, y+Math.random()*size-size/2, size/4, 0, Math.PI*2); ctx.fill(); } },
    oil(e, x, y, size, color, opacity) { ctx.fillStyle = hexToRgba(color, opacity); ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill(); },
    pencil(e, x, y, size, color, opacity) { ctx.strokeStyle = hexToRgba(color, opacity * 0.8); ctx.lineWidth = size / 2; ctx.lineCap = 'round'; ctx.lineTo(x, y); ctx.stroke(); },
    neon(e, x, y, size, color, opacity) { ctx.strokeStyle = hexToRgba(color, opacity); ctx.shadowColor = color; ctx.shadowBlur = 10; ctx.lineWidth = size; ctx.lineTo(x, y); ctx.stroke(); ctx.shadowBlur = 0; },
    glitter(e, x, y, size, color, opacity) { ctx.fillStyle = hexToRgba(color, opacity); for (let i = 0; i < 10; i++) { ctx.fillRect(x+Math.random()*size-size/2, y+Math.random()*size-size/2, 2, 2);} },
    textured(e, x, y, size, color, opacity) { ctx.strokeStyle = hexToRgba(color, opacity); ctx.lineWidth = size; ctx.lineTo(x, y); ctx.stroke(); },
    pattern(e, x, y, size, color, opacity) { ctx.fillStyle = hexToRgba(color, opacity); ctx.beginPath(); ctx.arc(x, y, size/3, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(x+size/2, y, size/6, 0, Math.PI*2); ctx.fill(); },
    airbrush(e, x, y, size, color, opacity) { for (let i=0;i<20;i++){const ox=(Math.random()-0.5)*size, oy=(Math.random()-0.5)*size; ctx.fillStyle=hexToRgba(color, opacity*Math.random()); ctx.fillRect(x+ox, y+oy, 1, 1);} },
    star(e, x, y, size, color, opacity) { ctx.strokeStyle = hexToRgba(color, opacity); drawStar(x, y, 5, size, size / 2); },
    heart(e, x, y, size, color, opacity) { ctx.strokeStyle = hexToRgba(color, opacity); drawHeart(x, y, size); },
    zigzag(e, x, y, size, color, opacity) { ctx.strokeStyle = hexToRgba(color, opacity); ctx.lineWidth = size; ctx.lineTo(x + (Math.random() - 0.5) * size, y + (Math.random() - 0.5) * size); ctx.stroke(); },
    scatter(e, x, y, size, color, opacity) { ctx.fillStyle = hexToRgba(color, opacity); for (let i=0;i<5;i++){ctx.beginPath(); ctx.arc(x+Math.random()*size-size/2, y+Math.random()*size-size/2, size/6, 0, Math.PI*2); ctx.fill();} },
    crayon(e, x, y, size, color, opacity) { ctx.strokeStyle = hexToRgba(color, opacity * 0.9); ctx.lineWidth = size; ctx.lineCap = 'round'; ctx.lineTo(x, y); ctx.stroke(); }
  };

  // DRAWING (disabled when select/transform/crop active)
  canvas.addEventListener('mousedown', (e) => {
    if (['shape','fill','select','transform','cropImage'].includes(currentTool)) return;
    const rect = canvas.getBoundingClientRect();
    lastX = e.clientX - rect.left;
    lastY = e.clientY - rect.top;
    saveState();
    isDrawing = true;
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
  });
  canvas.addEventListener('mousemove', (e) => {
    if (!isDrawing || ['fill','shape','select','transform','cropImage'].includes(currentTool)) return;
    const rect = canvas.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;
    const size = parseInt(brushSizeInput.value, 10);
    const opacity = parseFloat(opacityInput.value);
    const color = brushColorInput.value;

    ctx.globalCompositeOperation = (currentTool === 'eraser') ? 'destination-out' : 'source-over';

    if (symmetryCheckbox.checked) {
      ctx.beginPath(); ctx.moveTo(lastX, lastY);
      brushFunctions[currentBrush](e, currentX, currentY, size, color, opacity);
      ctx.beginPath(); ctx.moveTo(canvas.width - lastX, lastY);
      brushFunctions[currentBrush](e, canvas.width - currentX, currentY, size, color, opacity);
    } else {
      ctx.beginPath(); ctx.moveTo(lastX, lastY);
      brushFunctions[currentBrush](e, currentX, currentY, size, color, opacity);
    }
    lastX = currentX; lastY = currentY;
  });
  canvas.addEventListener('mouseup', () => { isDrawing = false; });
  canvas.addEventListener('mouseout', () => { isDrawing = false; });

  // FILL TOOL
  canvas.addEventListener('mousedown', (e) => {
    if (currentTool !== 'fill') return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(e.clientX - rect.left);
    const y = Math.floor(e.clientY - rect.top);
    saveState();
    floodFill(x, y, brushColorInput.value);
    if (overlayObj) baseImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    renderOverlay();
  });

  // SHAPES (save before preview)
  let shapeActive = false;
  canvas.addEventListener('mousedown', (e) => {
    if (currentTool !== 'shape') return;
    const rect = canvas.getBoundingClientRect();
    lastX = e.clientX - rect.left;
    lastY = e.clientY - rect.top;
    savedImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    saveState();
    shapeActive = true;
  });
  canvas.addEventListener('mousemove', (e) => {
    if (!shapeActive || currentTool !== 'shape') return;
    const rect = canvas.getBoundingClientRect();
    const currX = e.clientX - rect.left;
    const currY = e.clientY - rect.top;
    ctx.putImageData(savedImageData, 0, 0);
    ctx.strokeStyle = hexToRgba(brushColorInput.value, opacityInput.value);
    ctx.lineWidth = parseInt(brushSizeInput.value, 10);

    const shape = shapeTypeSelect.value;
    const w = currX - lastX, h = currY - lastY;

    if (shape === 'line' || shape === 'dottedLine') {
      ctx.beginPath(); ctx.moveTo(lastX, lastY);
      if (shape === 'dottedLine') ctx.setLineDash([2, 6]);
      ctx.lineTo(currX, currY); ctx.stroke(); ctx.setLineDash([]);
    } else if (shape === 'rectangle' || shape === 'dottedRectangle') {
      if (shape === 'dottedRectangle') ctx.setLineDash([2, 6]);
      ctx.strokeRect(lastX, lastY, w, h); ctx.setLineDash([]);
    } else if (shape === 'circle') {
      const radius = Math.sqrt(w * w + h * h);
      ctx.beginPath(); ctx.arc(lastX, lastY, radius, 0, Math.PI * 2); ctx.stroke();
    } else if (shape === 'ellipse' || shape === 'oval') {
      ctx.beginPath();
      ctx.ellipse(lastX + w / 2, lastY + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (shape === 'star') {
      const r = Math.max(Math.abs(w), Math.abs(h)); drawStar(lastX, lastY, 5, r, r / 2);
    } else if (shape === 'heart') {
      drawHeart(lastX, lastY, Math.max(Math.abs(w), Math.abs(h)));
    }
  });
  canvas.addEventListener('mouseup', () => { if (currentTool === 'shape') shapeActive = false; });

  // BACKGROUND SELECTOR
  backgroundPatternSelect.addEventListener('change', () => {
    const pattern = backgroundPatternSelect.value;
    canvasContainer.className = 'canvas-container ' + pattern;
  });

  // IMAGE INSERTION (auto-switch to Transform)
  const addImageButton = document.getElementById('addImageButton');
  const addImageInput = document.getElementById('addImageInput');
  addImageButton.addEventListener('click', () => addImageInput.click());
  addImageInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        baseImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const scale = Math.min(canvas.width / img.width, canvas.height / img.height, 1);
        const w = Math.floor(img.width * scale);
        const h = Math.floor(img.height * scale);
        const x = Math.floor((canvas.width - w) / 2);
        const y = Math.floor((canvas.height - h) / 2);

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

  // SELECTION TOOL
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

  canvas.addEventListener('mousedown', (e) => {
    if (currentTool !== 'select') return;
    const r = canvas.getBoundingClientRect();
    selectStartX = e.clientX - r.left;
    selectStartY = e.clientY - r.top;
    isSelecting = true;
    hideSelection();
  });
  canvas.addEventListener('mousemove', (e) => {
    if (!isSelecting || currentTool !== 'select') return;
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const x1 = Math.min(selectStartX, x);
    const y1 = Math.min(selectStartY, y);
    const w = Math.abs(x - selectStartX);
    const h = Math.abs(y - selectStartY);
    selectRect = { x: x1, y: y1, w, h };
    showSelection(x1, y1, w, h);
  });
  canvas.addEventListener('mouseup', () => {
    if (!isSelecting || currentTool !== 'select' || !selectRect) return;
    isSelecting = false;
    hideSelection();

    if (selectRect.w < 1 || selectRect.h < 1) return;

    // Extract selected region into an overlay image
    const off = document.createElement('canvas');
    off.width = selectRect.w; off.height = selectRect.h;
    const offCtx = off.getContext('2d');
    offCtx.drawImage(canvas, selectRect.x, selectRect.y, selectRect.w, selectRect.h, 0, 0, selectRect.w, selectRect.h);

    const img = new Image();
    img.onload = () => {
      saveState();
      // Erase selected area from base canvas and snapshot base
      ctx.clearRect(selectRect.x, selectRect.y, selectRect.w, selectRect.h);
      baseImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // Create overlay from selection
      overlayObj = { img, x: selectRect.x, y: selectRect.y, w: selectRect.w, h: selectRect.h, angle: 0 };
      // Switch to transform automatically
      toolSelect.value = 'transform';
      currentTool = 'transform';
      updateTransformBox();
      renderOverlay();
      selectRect = null;
    };
    img.src = off.toDataURL('image/png');
  });

  // Overlay rendering: base + transformed overlay (prevents duplicates)
  function renderOverlay() {
    if (!overlayObj || !baseImageData) return;
    ctx.putImageData(baseImageData, 0, 0);
    ctx.save();
    ctx.translate(overlayObj.x, overlayObj.y);
    ctx.rotate(overlayObj.angle || 0);
    ctx.drawImage(overlayObj.img, 0, 0, overlayObj.w, overlayObj.h);
    ctx.restore();
  }

  // Transform box sync
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

  // Helpers
  function canvasPoint(evt) {
    const r = canvas.getBoundingClientRect();
    return { x: evt.clientX - r.left, y: evt.clientY - r.top };
  }

  // Transform interactions (Pointer Events for robustness)
  transformBox.addEventListener('pointerdown', (e) => {
    if (!overlayObj || currentTool !== 'transform') return;
    transformBox.setPointerCapture(e.pointerId);

    if (!baseImageData) baseImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

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
          if (newAspect > aspect) h = w / aspect; else w = h * aspect;
        }
        if (left)  x = startState.x + (startState.w - w);
        if (top)   y = startState.y + (startState.h - h);
      };

      const map = { 'nw':[true,true,false,false], 'n':[false,true,false,false], 'ne':[false,true,true,false],
                    'e':[false,false,true,false], 'se':[false,false,true,true], 's':[false,false,false,true],
                    'sw':[true,false,false,true], 'w':[true,false,false,false] };
      const sides = map[activeHandle] || [false,false,false,false];
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
    transformBox.releasePointerCapture(e.pointerId);
    transformMode = null;
    activeHandle = null;
  });

  // Double-click to commit the transform (flatten to canvas)
  transformBox.addEventListener('dblclick', () => {
    commitOverlay();
  });

  // Commit on tool change when leaving transform
  toolSelect.addEventListener('change', () => {
    currentTool = toolSelect.value;
    shapeOptionsDiv.style.display = (currentTool === 'shape') ? 'inline-block' : 'none';

    if (currentTool !== 'transform') {
      commitOverlay();
    } else {
      if (!baseImageData) baseImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      updateTransformBox();
      renderOverlay();
    }

    // Show crop overlay only in crop mode
    cropOverlay.style.display = currentTool === 'cropImage' ? 'block' : 'none';
    if (currentTool !== 'cropImage') {
      cropOverlay.style.display = 'none';
    }
  });

  function commitOverlay() {
    if (overlayObj && baseImageData) {
      saveState();
      // Redraw final composite into canvas
      renderOverlay();
      // Update base snapshot to include overlay content
      baseImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      // Clear overlay and box
      overlayObj = null;
      updateTransformBox();
    }
  }

  // CROP IMAGE
  canvas.addEventListener('mousedown', (e) => {
    if (currentTool !== 'cropImage') return;
    if (!overlayObj) return;
    if (Math.abs(overlayObj.angle || 0) > 0.0001) {
      alert('Crop supports only non-rotated images/selection. Please set rotation to 0 first.');
      return;
    }
    const rect = canvas.getBoundingClientRect();
    cropStartX = e.clientX - rect.left;
    cropStartY = e.clientY - rect.top;
    isCropping = true;
  });
  canvas.addEventListener('mousemove', (e) => {
    if (!isCropping || currentTool !== 'cropImage' || !overlayObj) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const x1 = Math.min(cropStartX, x);
    const y1 = Math.min(cropStartY, y);
    const w = Math.abs(x - cropStartX);
    const h = Math.abs(y - cropStartY);
    cropRect = { x: x1, y: y1, w, h };
    Object.assign(cropOverlay.style, {
      left: x1 + 'px', top: y1 + 'px', width: w + 'px', height: h + 'px', display: 'block'
    });
  });
  canvas.addEventListener('mouseup', () => {
    if (!isCropping || currentTool !== 'cropImage' || !overlayObj || !cropRect) return;
    isCropping = false; cropOverlay.style.display = 'none';

    // Intersection with overlay bounds in canvas coordinates (no rotation)
    const ix1 = Math.max(cropRect.x, overlayObj.x);
    const iy1 = Math.max(cropRect.y, overlayObj.y);
    const ix2 = Math.min(cropRect.x + cropRect.w, overlayObj.x + overlayObj.w);
    const iy2 = Math.min(cropRect.y + cropRect.h, overlayObj.y + overlayObj.h);
    const iw = Math.max(0, ix2 - ix1), ih = Math.max(0, iy2 - iy1);
    if (iw <= 0 || ih <= 0) return;

    const off = document.createElement('canvas'); off.width = iw; off.height = ih;
    const offCtx = off.getContext('2d');
    const sx = ix1 - overlayObj.x, sy = iy1 - overlayObj.y;
    offCtx.drawImage(overlayObj.img, sx, sy, iw, ih, 0, 0, iw, ih);

    const croppedImg = new Image();
    croppedImg.onload = () => {
      overlayObj.img = croppedImg; overlayObj.x = ix1; overlayObj.y = iy1; overlayObj.w = iw; overlayObj.h = ih;
      overlayObj.angle = 0;
      updateTransformBox(); renderOverlay();
    };
    croppedImg.src = off.toDataURL('image/png');
  });

  // ACTION BUTTONS
  newCanvasButton.addEventListener('click', () => {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    undoStack = []; redoStack = [];
    overlayObj = null; baseImageData = null; selectRect = null;
    hideSelection(); updateTransformBox();
  });
  clearCanvasButton.addEventListener('click', () => {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    undoStack = []; redoStack = [];
    overlayObj = null; baseImageData = null; selectRect = null;
    hideSelection(); updateTransformBox();
  });
  undoCanvasButton.addEventListener('click', undo);
  redoCanvasButton.addEventListener('click', redo);
  downloadCanvasButton.addEventListener('click', () => {
    if (overlayObj && baseImageData) renderOverlay(); // flatten for export
    const link = document.createElement('a');
    link.download = 'DrawNow_art.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  });

  // UI SYNC
  brushSizeInput.addEventListener('input', () => { brushSizeValue.textContent = brushSizeInput.value; });
  opacityInput.addEventListener('input', () => { opacityValue.textContent = opacityInput.value; });

  // Recent colors
  let recentColors = [];
  function addRecentColor(color) {
    if (!recentColors.includes(color)) {
      recentColors.push(color);
      const swatch = document.createElement('div');
      swatch.className = 'color-swatch';
      swatch.style.backgroundColor = color;
      swatch.onclick = () => { brushColorInput.value = color; };
      recentColorsDiv.appendChild(swatch);
    }
  }
  brushColorInput.addEventListener('change', () => addRecentColor(brushColorInput.value));

  // Tool changes visibility
  toolSelect.addEventListener('change', () => {
    currentTool = toolSelect.value;
    shapeOptionsDiv.style.display = (currentTool === 'shape') ? 'inline-block' : 'none';
    if (currentTool !== 'cropImage') cropOverlay.style.display = 'none';
    if (currentTool !== 'select') hideSelection();

    if (currentTool === 'transform') {
      if (!baseImageData) baseImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      updateTransformBox();
      renderOverlay();
    } else {
      updateTransformBox(); // hides box if not transforming
    }
  });

  // KEYBOARD SHORTCUTS 
  document.addEventListener('keydown', (e) => {
    const key = (e.key || '').toLowerCase();
    const ctrlOrCmd = e.ctrlKey || e.metaKey;

    // Don't steal shortcuts while typing in inputs/textareas/selects or contenteditable
    const t = e.target;
    const isTypingTarget =
      t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);

    const prevent = () => { e.preventDefault(); e.stopPropagation(); };

    // ESC: cancel selection/crop/transform interaction (doesn't delete overlay)
    if (key === 'escape') {
      prevent();
      isSelecting = false;
      isCropping = false;
      cropOverlay.style.display = 'none';
      hideSelection();
      transformMode = null;
      activeHandle = null;
      return;
    }

    if (!ctrlOrCmd) return;

    // Undo / Redo (Ctrl/Cmd+Z, Ctrl/Cmd+Y, Ctrl/Cmd+Shift+Z)
    if (key === 'z' && !e.shiftKey) {
      if (!isTypingTarget) { prevent(); undo(); }
      return;
    }
    if (key === 'y' || (key === 'z' && e.shiftKey)) {
      if (!isTypingTarget) { prevent(); redo(); }
      return;
    }

    // Cut/Copy/Paste: let browser handle for inputs; provide minimal canvas helpers
    if (key === 'x') {
      // Optional: switch to select tool for "cut workflow"
      if (!isTypingTarget) {
        prevent();
        toolSelect.value = 'select';
        currentTool = 'select';
      }
      return;
    }

    if (key === 'c') {
      // Optional: duplicate overlay when transforming
      if (!isTypingTarget && overlayObj && currentTool === 'transform') {
        prevent();

        const temp = document.createElement('canvas');
        temp.width = overlayObj.w;
        temp.height = overlayObj.h;
        temp.getContext('2d').drawImage(overlayObj.img, 0, 0, overlayObj.w, overlayObj.h);

        const img = new Image();
        img.onload = () => {
          if (!baseImageData) baseImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          overlayObj = {
            img,
            x: overlayObj.x + 10,
            y: overlayObj.y + 10,
            w: overlayObj.w,
            h: overlayObj.h,
            angle: overlayObj.angle || 0
          };
          toolSelect.value = 'transform';
          currentTool = 'transform';
          updateTransformBox();
          renderOverlay();
        };
        img.src = temp.toDataURL('image/png');
      }
      return;
    }

    if (key === 'v') {
      // Clipboard image paste needs permissions (navigator.clipboard.read()).
      return;
    }

    // Select all: switch to select tool (canvas has no native "select all")
    if (key === 'a') {
      if (!isTypingTarget) {
        prevent();
        toolSelect.value = 'select';
        currentTool = 'select';
      }
      return;
    }

    // Save/Download: Ctrl/Cmd+S
    if (key === 's') {
      if (!isTypingTarget) {
        prevent();
        downloadCanvasButton.click();
      }
      return;
    }

    // New canvas: Ctrl/Cmd+N
    if (key === 'n') {
      if (!isTypingTarget) {
        prevent();
        newCanvasButton.click();
      }
      return;
    }

    // Commit overlay: Ctrl/Cmd+Enter (handy when transforming)
    if (key === 'enter') {
      if (!isTypingTarget && currentTool === 'transform' && overlayObj) {
        prevent();
        commitOverlay();
      }
      return;
    }
  });
});

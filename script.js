document.addEventListener('DOMContentLoaded', () => {
  // ----- CANVAS & STATE -----
  const canvas = document.getElementById('drawingCanvas');
  const ctx = canvas.getContext('2d');
  let isDrawing = false;
  let lastX = 0, lastY = 0;
  let savedImageData = null; // for shape preview
  let currentTool = document.getElementById('tool').value;
  let currentBrush = document.getElementById('brushType').value;
  let undoStack = [];
  let redoStack = [];
  const MAX_HISTORY = 50;

  // ----- UI ELEMENTS -----
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

  // ----- THEME (matches styles/theme.css) -----
  const STORAGE_KEY = 'canvas-theme';
  const root = document.documentElement;

  function systemTheme() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    if (theme === 'light' || theme === 'dark') {
      root.setAttribute('data-theme', theme);
    } else {
      root.removeAttribute('data-theme');
    }
    const effective = root.getAttribute('data-theme') || systemTheme();
    darkModeToggle.textContent = effective === 'dark' ? '🌙' : '☀️';
    darkModeToggle.setAttribute('aria-pressed', String(effective === 'dark'));
    darkModeToggle.title = effective === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  }

  function initTheme() {
    const stored = localStorage.getItem(STORAGE_KEY); // 'light' | 'dark' | null
    applyTheme(stored);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', () => {
      if (!localStorage.getItem(STORAGE_KEY)) applyTheme(null);
    });
  }

  darkModeToggle.addEventListener('click', () => {
    const current = root.getAttribute('data-theme') || systemTheme();
    const next = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  });

  initTheme();

  // ----- HISTORY -----
  function saveState() {
    redoStack = [];
    try {
      undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
      if (undoStack.length > MAX_HISTORY) undoStack.shift();
    } catch (e) {
      // In very large canvases, getImageData may fail due to memory; ignore gracefully.
    }
  }

  function undo() {
    if (!undoStack.length) return;
    try {
      redoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
      const prev = undoStack.pop();
      ctx.putImageData(prev, 0, 0);
    } catch (e) {}
  }

  function redo() {
    if (!redoStack.length) return;
    try {
      undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
      const next = redoStack.pop();
      ctx.putImageData(next, 0, 0);
    } catch (e) {}
  }

  // ----- COLOR UTILS -----
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
  function matchColors(a, b) {
    return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
  }
  function matchColorsAt(index, targetColor, data) {
    return (
      data[index] === targetColor[0] &&
      data[index + 1] === targetColor[1] &&
      data[index + 2] === targetColor[2] &&
      data[index + 3] === targetColor[3]
    );
  }
  function setPixelColor(index, color, data) {
    data[index] = color[0];
    data[index + 1] = color[1];
    data[index + 2] = color[2];
    data[index + 3] = color[3];
  }

  // ----- FLOOD FILL -----
  function floodFill(startX, startY, fillColor) {
    const width = canvas.width;
    const height = canvas.height;
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
      while (y >= 0 && matchColorsAt(pixelPos, targetColor, data)) {
        y--;
        pixelPos -= width * 4;
      }
      y++;
      pixelPos += width * 4;
      let reachLeft = false;
      let reachRight = false;
      while (y < height && matchColorsAt(pixelPos, targetColor, data)) {
        setPixelColor(pixelPos, fillColorArr, data);

        if (x > 0) {
          if (matchColorsAt(pixelPos - 4, targetColor, data)) {
            if (!reachLeft) {
              stack.push([x - 1, y]);
              reachLeft = true;
            }
          } else {
            reachLeft = false;
          }
        }
        if (x < width - 1) {
          if (matchColorsAt(pixelPos + 4, targetColor, data)) {
            if (!reachRight) {
              stack.push([x + 1, y]);
              reachRight = true;
            }
          } else {
            reachRight = false;
          }
        }
        y++;
        pixelPos += width * 4;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  // ----- SHAPES -----
  function drawStar(cx, cy, spikes, outerRadius, innerRadius) {
    let rot = (Math.PI / 2) * 3;
    let x = cx, y = cy;
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

  // ----- THEME-AWARE CANVAS CLEAR (optional utility) -----
  function clearCanvasToThemeBg() {
    // If you want the canvas to show theme background instead of transparent:
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--canvas-bg').trim() || '#ffffff';
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  // ----- DRAWING -----
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
        const offsetX = (Math.random() - 0.5) * size * 2;
        const offsetY = (Math.random() - 0.5) * size * 2;
        ctx.fillRect(x + offsetX, y + offsetY, 1, 1);
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
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * size;
        ctx.beginPath();
        ctx.arc(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, size / 10, 0, Math.PI * 2);
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
        ctx.arc(
          x + Math.random() * size - size / 2,
          y + Math.random() * size - size / 2,
          size / 4,
          0,
          Math.PI * 2
        );
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
        ctx.fillRect(
          x + Math.random() * size - size / 2,
          y + Math.random() * size - size / 2,
          2,
          2
        );
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
        const offsetX = (Math.random() - 0.5) * size;
        const offsetY = (Math.random() - 0.5) * size;
        ctx.fillStyle = hexToRgba(color, opacity * Math.random());
        ctx.fillRect(x + offsetX, y + offsetY, 1, 1);
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
      ctx.lineTo(
        x + (Math.random() - 0.5) * size,
        y + (Math.random() - 0.5) * size
      );
      ctx.stroke();
    },
    scatter(e, x, y, size, color, opacity) {
      ctx.fillStyle = hexToRgba(color, opacity);
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc(
          x + Math.random() * size - size / 2,
          y + Math.random() * size - size / 2,
          size / 6,
          0,
          Math.PI * 2
        );
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

  // Drawing start
  canvas.addEventListener('mousedown', (e) => {
    if (currentTool === 'shape' || currentTool === 'fill') return;
    const rect = canvas.getBoundingClientRect();
    lastX = e.clientX - rect.left;
    lastY = e.clientY - rect.top;
    saveState(); // snapshot before modification
    isDrawing = true;
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
  });

  // Drawing move
  canvas.addEventListener('mousemove', (e) => {
    if (!isDrawing || currentTool === 'fill' || currentTool === 'shape') return;
    const rect = canvas.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;
    const size = parseInt(brushSizeInput.value, 10);
    const opacity = parseFloat(opacityInput.value);
    const color = brushColorInput.value;

    ctx.globalCompositeOperation = (currentTool === 'eraser') ? 'destination-out' : 'source-over';

    if (symmetryCheckbox.checked) {
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      brushFunctions[currentBrush](e, currentX, currentY, size, color, opacity);
      ctx.beginPath();
      ctx.moveTo(canvas.width - lastX, lastY);
      brushFunctions[currentBrush](e, canvas.width - currentX, currentY, size, color, opacity);
    } else {
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      brushFunctions[currentBrush](e, currentX, currentY, size, color, opacity);
    }
    lastX = currentX;
    lastY = currentY;
  });

  // Drawing end
  canvas.addEventListener('mouseup', () => {
    isDrawing = false;
  });
  canvas.addEventListener('mouseout', () => {
    isDrawing = false;
  });

  // ----- FILL TOOL -----
  canvas.addEventListener('mousedown', (e) => {
    if (currentTool !== 'fill') return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(e.clientX - rect.left);
    const y = Math.floor(e.clientY - rect.top);
    saveState();
    floodFill(x, y, brushColorInput.value);
  });

  // ----- SHAPES TOOL -----
  let shapeActive = false;
  canvas.addEventListener('mousedown', (e) => {
    if (currentTool !== 'shape') return;
    const rect = canvas.getBoundingClientRect();
    lastX = e.clientX - rect.left;
    lastY = e.clientY - rect.top;
    savedImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    saveState(); // snapshot before shape commit
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
    const w = currX - lastX;
    const h = currY - lastY;

    if (shape === 'line' || shape === 'dottedLine') {
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      if (shape === 'dottedLine') ctx.setLineDash([2, 6]);
      ctx.lineTo(currX, currY);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (shape === 'rectangle' || shape === 'dottedRectangle') {
      if (shape === 'dottedRectangle') ctx.setLineDash([2, 6]);
      ctx.strokeRect(lastX, lastY, w, h);
      ctx.setLineDash([]);
    } else if (shape === 'circle') {
      const radius = Math.sqrt(w * w + h * h);
      ctx.beginPath();
      ctx.arc(lastX, lastY, radius, 0, Math.PI * 2);
      ctx.stroke();
    } else if (shape === 'ellipse' || shape === 'oval') {
      ctx.beginPath();
      ctx.ellipse(lastX + w / 2, lastY + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (shape === 'star') {
      const r = Math.max(Math.abs(w), Math.abs(h));
      drawStar(lastX, lastY, 5, r, r / 2);
    } else if (shape === 'heart') {
      drawHeart(lastX, lastY, Math.max(Math.abs(w), Math.abs(h)));
    }
  });
  canvas.addEventListener('mouseup', (e) => {
    if (currentTool === 'shape' && shapeActive) {
      shapeActive = false;
    }
  });

  // ----- ACTION BUTTONS -----
  newCanvasButton.addEventListener('click', () => {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    undoStack = [];
    redoStack = [];
  });
  clearCanvasButton.addEventListener('click', () => {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    undoStack = [];
    redoStack = [];
  });
  undoCanvasButton.addEventListener('click', undo);
  redoCanvasButton.addEventListener('click', redo);

  downloadCanvasButton.addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = 'DrawNow_art.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  });

  // ----- UI SYNC -----
  brushSizeInput.addEventListener('input', () => {
    brushSizeValue.textContent = brushSizeInput.value;
  });
  opacityInput.addEventListener('input', () => {
    opacityValue.textContent = opacityInput.value;
  });

  let recentColors = [];
  function addRecentColor(color) {
    if (!recentColors.includes(color)) {
      recentColors.push(color);
      const swatch = document.createElement('div');
      swatch.className = 'color-swatch';
      swatch.style.backgroundColor = color;
      swatch.onclick = () => {
        brushColorInput.value = color;
      };
      recentColorsDiv.appendChild(swatch);
    }
  }
  brushColorInput.addEventListener('change', () => {
    addRecentColor(brushColorInput.value);
  });

  toolSelect.addEventListener('change', () => {
    currentTool = toolSelect.value;
    shapeOptionsDiv.style.display = (currentTool === 'shape') ? 'inline-block' : 'none';
  });
  brushTypeSelect.addEventListener('change', () => {
    currentBrush = brushTypeSelect.value;
  });
  backgroundPatternSelect.addEventListener('change', () => {
    const pattern = backgroundPatternSelect.value;
    canvasContainer.className = 'canvas-container ' + pattern;
  });

  // ----- KEYBOARD SHORTCUTS -----
  document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;

    if (!ctrl) {
      if (key === 'p') {
        toolSelect.value = 'pen';
        currentTool = 'pen';
      } else if (key === 'e') {
        toolSelect.value = 'eraser';
        currentTool = 'eraser';
      } else if (key === 'f') {
        toolSelect.value = 'fill';
        currentTool = 'fill';
      } else if (key === 's') {
        toolSelect.value = 'shape';
        currentTool = 'shape';
      } else if (key === 'y') {
        symmetryCheckbox.checked = !symmetryCheckbox.checked;
      }
      return;
    }

    if (ctrl && key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (ctrl && (key === 'y' || (key === 'z' && e.shiftKey))) {
      e.preventDefault();
      redo();
    }
  });
});

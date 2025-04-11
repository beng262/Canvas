// ----- GLOBAL VARIABLES & SETUP -----
const canvas = document.getElementById('drawingCanvas');
const ctx = canvas.getContext('2d');
let isDrawing = false;
let lastX = 0, lastY = 0;
let savedImageData = null;  // for shapes preview
let currentTool = document.getElementById('tool').value;
let currentBrush = document.getElementById('brushType').value;

// UI ELEMENTS
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
const downloadCanvasButton = document.getElementById('downloadCanvas');
const shapeOptionsDiv = document.getElementById('shapeOptions');
const shapeTypeSelect = document.getElementById('shapeType');
const symmetryCheckbox = document.getElementById('symmetry');
const canvasContainer = document.getElementById('canvasContainer');

// Update brush size & opacity display
brushSizeInput.addEventListener('input', () => {
  brushSizeValue.textContent = brushSizeInput.value;
});
opacityInput.addEventListener('input', () => {
  opacityValue.textContent = opacityInput.value;
});

// Recent Colors Palette
let recentColors = [];
function addRecentColor(color) {
  if (!recentColors.includes(color)) {
    recentColors.push(color);
    let swatch = document.createElement('div');
    swatch.className = 'color-swatch';
    swatch.style.backgroundColor = color;
    swatch.onclick = () => { brushColorInput.value = color; };
    recentColorsDiv.appendChild(swatch);
  }
}
brushColorInput.addEventListener('change', () => {
  addRecentColor(brushColorInput.value);
});

// Show shape options only if 'shape' tool is selected
toolSelect.addEventListener('change', () => {
  currentTool = toolSelect.value;
  shapeOptionsDiv.style.display = (currentTool === 'shape') ? 'inline-block' : 'none';
});

// Update brush type
brushTypeSelect.addEventListener('change', () => {
  currentBrush = brushTypeSelect.value;
});

// Update canvas background
backgroundPatternSelect.addEventListener('change', () => {
  const pattern = backgroundPatternSelect.value;
  canvasContainer.className = 'canvas-container ' + pattern;
});

// Utility: Convert hex to rgba (opacity is 0-100, so divide by 100)
function hexToRgba(hex, opacity) {
  hex = hex.replace('#', '');
  if(hex.length === 3) hex = hex.split('').map(c => c+c).join('');
  const bigint = parseInt(hex, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${opacity/100})`;
}

// ----- BRUSH FUNCTIONS (20+ types) -----
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
    ctx.fillRect(x - size/2, y - size/2, size, size);
  },
  dotted(e, x, y, size, color, opacity) {
    ctx.fillStyle = hexToRgba(color, opacity);
    ctx.beginPath();
    ctx.arc(x, y, size/2, 0, Math.PI * 2);
    ctx.fill();
  },
  spray(e, x, y, size, color, opacity) {
    ctx.fillStyle = hexToRgba(color, opacity);
    for (let i = 0; i < 30; i++) {
      let offsetX = (Math.random() - 0.5) * size * 2;
      let offsetY = (Math.random() - 0.5) * size * 2;
      ctx.fillRect(x + offsetX, y + offsetY, 1, 1);
    }
  },
  calligraphy(e, x, y, size, color, opacity) {
    ctx.strokeStyle = hexToRgba(color, opacity);
    ctx.lineWidth = size;
    ctx.lineCap = '*****';
    ctx.lineTo(x + size/2, y);
    ctx.stroke();
  },
  splatter(e, x, y, size, color, opacity) {
    ctx.fillStyle = hexToRgba(color, opacity);
    for (let i = 0; i < 20; i++) {
      let angle = Math.random() * Math.PI * 2;
      let radius = Math.random() * size;
      ctx.beginPath();
      ctx.arc(x + Math.cos(angle)*radius, y + Math.sin(angle)*radius, size/10, 0, Math.PI*2);
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
      ctx.arc(x + Math.random()*size - size/2, y + Math.random()*size - size/2, size/4, 0, Math.PI*2);
      ctx.fill();
    }
  },
  oil(e, x, y, size, color, opacity) {
    ctx.fillStyle = hexToRgba(color, opacity);
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI*2);
    ctx.fill();
  },
  pencil(e, x, y, size, color, opacity) {
    ctx.strokeStyle = hexToRgba(color, opacity * 0.8);
    ctx.lineWidth = size/2;
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
      ctx.fillRect(x + Math.random()*size - size/2, y + Math.random()*size - size/2, 2, 2);
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
    ctx.arc(x, y, size/3, 0, Math.PI*2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + size/2, y, size/6, 0, Math.PI*2);
    ctx.fill();
  },
  airbrush(e, x, y, size, color, opacity) {
    for (let i = 0; i < 20; i++) {
      let offsetX = (Math.random()-0.5)*size;
      let offsetY = (Math.random()-0.5)*size;
      ctx.fillStyle = hexToRgba(color, opacity * Math.random());
      ctx.fillRect(x+offsetX, y+offsetY, 1, 1);
    }
  },
  star(e, x, y, size, color, opacity) {
    ctx.fillStyle = hexToRgba(color, opacity);
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      ctx.lineTo(x + size * Math.cos((18 + 72 * i) * Math.PI/180),
                 y - size * Math.sin((18 + 72 * i) * Math.PI/180));
      ctx.lineTo(x + (size/2) * Math.cos((54 + 72 * i) * Math.PI/180),
                 y - (size/2) * Math.sin((54 + 72 * i) * Math.PI/180));
    }
    ctx.closePath();
    ctx.fill();
  },
  heart(e, x, y, size, color, opacity) {
    ctx.fillStyle = hexToRgba(color, opacity);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x, y - size/2, x - size, y - size/2, x - size, y);
    ctx.bezierCurveTo(x - size, y + size/2, x, y + size, x, y + size*1.2);
    ctx.bezierCurveTo(x, y + size, x + size, y + size/2, x + size, y);
    ctx.bezierCurveTo(x + size, y - size/2, x, y - size/2, x, y);
    ctx.fill();
  },
  zigzag(e, x, y, size, color, opacity) {
    ctx.strokeStyle = hexToRgba(color, opacity);
    ctx.lineWidth = size;
    ctx.lineTo(x + (Math.random()-0.5)*size, y + (Math.random()-0.5)*size);
    ctx.stroke();
  },
  scatter(e, x, y, size, color, opacity) {
    ctx.fillStyle = hexToRgba(color, opacity);
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.arc(x + Math.random()*size - size/2, y + Math.random()*size - size/2, size/6, 0, Math.PI*2);
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

// ----- DRAWING HANDLERS FOR PEN, ERASER, FILL, & SHAPES -----
canvas.addEventListener('mousedown', (e) => {
  const rect = canvas.getBoundingClientRect();
  lastX = e.clientX - rect.left;
  lastY = e.clientY - rect.top;
  savedImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  
  if (currentTool === 'fill') {
    // Immediate fill on mousedown if using fill tool:
    ctx.fillStyle = hexToRgba(brushColorInput.value, opacityInput.value);
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    isDrawing = true;
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
  }
});
canvas.addEventListener('mousemove', (e) => {
  if (!isDrawing || currentTool === 'fill') return;
  const rect = canvas.getBoundingClientRect();
  let currentX = e.clientX - rect.left;
  let currentY = e.clientY - rect.top;
  const size = parseInt(brushSizeInput.value);
  const opacity = parseFloat(opacityInput.value);
  const color = brushColorInput.value;
  
  // Choose composite mode based on tool
  if (currentTool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
  } else {
    ctx.globalCompositeOperation = 'source-over';
  }
  
  // Handle symmetry mode if enabled
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
canvas.addEventListener('mouseup', (e) => {
  isDrawing = false;
});
canvas.addEventListener('mouseout', (e) => {
  isDrawing = false;
});

// ----- SHAPES TOOL HANDLERS -----
let shapeActive = false;
canvas.addEventListener('mousedown', (e) => {
  if (currentTool === 'shape') {
    const rect = canvas.getBoundingClientRect();
    lastX = e.clientX - rect.left;
    lastY = e.clientY - rect.top;
    savedImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    shapeActive = true;
  }
});
canvas.addEventListener('mousemove', (e) => {
  if (!shapeActive || currentTool !== 'shape') return;
  const rect = canvas.getBoundingClientRect();
  const currX = e.clientX - rect.left;
  const currY = e.clientY - rect.top;
  ctx.putImageData(savedImageData, 0, 0);
  ctx.strokeStyle = hexToRgba(brushColorInput.value, opacityInput.value);
  ctx.lineWidth = parseInt(brushSizeInput.value);
  let shape = shapeTypeSelect.value;
  let w = currX - lastX;
  let h = currY - lastY;
  if (shape === 'line' || shape === 'dottedLine') {
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(currX, currY);
    if (shape === 'dottedLine') ctx.setLineDash([5,5]);
    ctx.stroke();
    ctx.setLineDash([]);
  } else if (shape === 'rectangle' || shape === 'dottedRectangle') {
    if (shape === 'dottedRectangle') ctx.setLineDash([5,5]);
    ctx.strokeRect(lastX, lastY, w, h);
    ctx.setLineDash([]);
  } else if (shape === 'circle') {
    let radius = Math.sqrt(w*w + h*h);
    ctx.beginPath();
    ctx.arc(lastX, lastY, radius, 0, Math.PI * 2);
    ctx.stroke();
  } else if (shape === 'ellipse' || shape === 'oval') {
    ctx.beginPath();
    ctx.ellipse(lastX + w/2, lastY + h/2, Math.abs(w/2), Math.abs(h/2), 0, 0, Math.PI*2);
    ctx.stroke();
  }
});
canvas.addEventListener('mouseup', (e) => {
  if (currentTool === 'shape') shapeActive = false;
});

// ----- ACTION BUTTONS -----
// New Canvas: clears the drawing and resets composite mode.
newCanvasButton.addEventListener('click', () => {
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});
// Clear Canvas: simply clear the current drawing.
clearCanvasButton.addEventListener('click', () => {
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});
// Download Canvas: create a PNG data URL and trigger download.
downloadCanvasButton.addEventListener('click', () => {
  let link = document.createElement('a');
  link.download = 'DrawNow_art.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
});

// ----- KEYBOARD SHORTCUTS -----
document.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  if (key === 'p') { toolSelect.value = 'pen'; currentTool = 'pen'; }
  else if (key === 'e') { toolSelect.value = 'eraser'; currentTool = 'eraser'; }
  else if (key === 'f') { toolSelect.value = 'fill'; currentTool = 'fill'; }
  else if (key === 's') { toolSelect.value = 'shape'; currentTool = 'shape'; }
  else if (key === 'y') {
    symmetryCheckbox.checked = !symmetryCheckbox.checked;
  }
});

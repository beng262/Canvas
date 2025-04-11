// ----- GLOBAL VARIABLES & SETUP -----
const canvas = document.getElementById('drawingCanvas');
const ctx = canvas.getContext('2d');
let isDrawing = false;
let lastX = 0, lastY = 0;
let savedImageData = null;  // For shapes preview
let currentTool = document.getElementById('tool').value;
let currentBrush = document.getElementById('brushType').value;
let undoStack = [];

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
const undoCanvasButton = document.getElementById('undoCanvas');
const downloadCanvasButton = document.getElementById('downloadCanvas');
const shapeOptionsDiv = document.getElementById('shapeOptions');
const shapeTypeSelect = document.getElementById('shapeType');
const symmetryCheckbox = document.getElementById('symmetry');
const canvasContainer = document.getElementById('canvasContainer');

// ----- HISTORY FUNCTIONS -----
function saveState() {
  // Save the current canvas state for undo functionality.
  undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
}
function undo() {
  if (undoStack.length) {
    let prevState = undoStack.pop();
    ctx.putImageData(prevState, 0, 0);
  }
}

// ----- UTILITY FUNCTIONS -----
function hexToRgba(hex, opacity) {
  hex = hex.replace('#', '');
  if(hex.length === 3) hex = hex.split('').map(c => c+c).join('');
  const bigint = parseInt(hex, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${opacity/100})`;
}
function hexToRgbaArray(hex, opacity) {
  hex = hex.replace('#','');
  if(hex.length === 3) hex = hex.split('').map(c => c+c).join('');
  const bigint = parseInt(hex, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  const a = opacity / 100 * 255;
  return [r, g, b, a];
}
function matchColors(a, b) {
  return a[0]===b[0] && a[1]===b[1] && a[2]===b[2] && a[3]===b[3];
}
function matchColorsAt(index, targetColor, data) {
  return (
    data[index] === targetColor[0] &&
    data[index+1] === targetColor[1] &&
    data[index+2] === targetColor[2] &&
    data[index+3] === targetColor[3]
  );
}
function setPixelColor(index, color, data) {
  data[index] = color[0];
  data[index+1] = color[1];
  data[index+2] = color[2];
  data[index+3] = color[3];
}

// ----- REVISED FLOOD FILL ALGORITHM -----
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
    // Move up until the color changes.
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

// ----- STAR & HEART SHAPE FUNCTIONS -----
function drawStar(cx, cy, spikes, outerRadius, innerRadius) {
  let rot = Math.PI / 2 * 3;
  let x = cx;
  let y = cy;
  let step = Math.PI / spikes;
  
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

function drawHeart(cx, cy, width, height) {
  ctx.beginPath();
  const topCurveHeight = height * 0.3;
  ctx.moveTo(cx, cy + topCurveHeight);
  ctx.bezierCurveTo(
    cx, cy, 
    cx - width / 2, cy, 
    cx - width / 2, cy + topCurveHeight
  );
  ctx.bezierCurveTo(
    cx - width / 2, cy + (height + topCurveHeight) / 2, 
    cx, cy + (height + topCurveHeight) / 2, 
    cx, cy + height
  );
  ctx.bezierCurveTo(
    cx, cy + (height + topCurveHeight) / 2, 
    cx + width / 2, cy + (height + topCurveHeight) / 2, 
    cx + width / 2, cy + topCurveHeight
  );
  ctx.bezierCurveTo(
    cx + width / 2, cy, 
    cx, cy, 
    cx, cy + topCurveHeight
  );
  ctx.closePath();
  ctx.stroke();
}

// ----- EVENT LISTENERS & HANDLERS -----
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
    ctx.lineCap = 'butt';
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
    // For star brush, we simply call our drawStar helper.
    ctx.strokeStyle = hexToRgba(color, opacity);
    drawStar(x, y, 5, size, size/2);
  },
  heart(e, x, y, size, color, opacity) {
    // For heart brush, we call our drawHeart helper.
    ctx.strokeStyle = hexToRgba(color, opacity);
    drawHeart(x, y, size, size);
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

// ----- DRAWING HANDLERS -----
// General drawing (only if not using shape or fill tool)
canvas.addEventListener('mousedown', (e) => {
  if (currentTool === 'shape' || currentTool === 'fill') return;
  const rect = canvas.getBoundingClientRect();
  lastX = e.clientX - rect.left;
  lastY = e.clientY - rect.top;
  saveState(); // Save before drawing
  isDrawing = true;
  ctx.beginPath();
  ctx.moveTo(lastX, lastY);
});
canvas.addEventListener('mousemove', (e) => {
  if (!isDrawing || currentTool === 'fill' || currentTool === 'shape') return;
  const rect = canvas.getBoundingClientRect();
  let currentX = e.clientX - rect.left;
  let currentY = e.clientY - rect.top;
  const size = parseInt(brushSizeInput.value);
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
canvas.addEventListener('mouseup', (e) => {
  if (isDrawing) {
    isDrawing = false;
    saveState();
  }
});
canvas.addEventListener('mouseout', (e) => {
  if (isDrawing) {
    isDrawing = false;
    saveState();
  }
});

// ----- FILL TOOL HANDLER (Flood Fill) -----
canvas.addEventListener('mousedown', (e) => {
  if (currentTool === 'fill') {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(e.clientX - rect.left);
    const y = Math.floor(e.clientY - rect.top);
    saveState();
    floodFill(x, y, brushColorInput.value);
  }
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
    if (shape === 'dottedLine') ctx.setLineDash([4,4]);
    ctx.lineTo(currX, currY);
    ctx.stroke();
    ctx.setLineDash([]);
  } else if (shape === 'rectangle' || shape === 'dottedRectangle') {
    if (shape === 'dottedRectangle') ctx.setLineDash([4,4]);
    ctx.strokeRect(lastX, lastY, w, h);
    ctx.setLineDash([]);
  } else if (shape === 'circle') {
    let radius = Math.sqrt(w * w + h * h);
    ctx.beginPath();
    ctx.arc(lastX, lastY, radius, 0, Math.PI * 2);
    ctx.stroke();
  } else if (shape === 'ellipse' || shape === 'oval') {
    ctx.beginPath();
    ctx.ellipse(lastX + w/2, lastY + h/2, Math.abs(w/2), Math.abs(h/2), 0, 0, Math.PI*2);
    ctx.stroke();
  } else if (shape === 'star') {
    // Use the average distance as radius.
    let r = Math.max(Math.abs(w), Math.abs(h));
    drawStar(lastX, lastY, 5, r, r/2);
  } else if (shape === 'heart') {
    // Draw heart with width and height based on drag.
    drawHeart(lastX, lastY, Math.abs(w), Math.abs(h));
  }
});
canvas.addEventListener('mouseup', (e) => {
  if (currentTool === 'shape' && shapeActive) {
    shapeActive = false;
    saveState();
  }
});

// ----- ACTION BUTTONS -----
newCanvasButton.addEventListener('click', () => {
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  undoStack = [];
});
clearCanvasButton.addEventListener('click', () => {
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  undoStack = [];
});
undoCanvasButton.addEventListener('click', () => {
  undo();
});
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
  else if (key === 'y') { symmetryCheckbox.checked = !symmetryCheckbox.checked; }
  else if (key === 'z') { undo(); }
});

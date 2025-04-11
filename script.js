// ----- GLOBAL VARIABLES & SETUP -----
const canvas = document.getElementById('drawingCanvas');
const ctx = canvas.getContext('2d');
let isDrawing = false;
let lastX = 0, lastY = 0;
let savedImageData = null;  // for shapes preview
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
// Convert hex and opacity to an array [r, g, b, a]
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

// ----- FLOOD FILL ALGORITHM -----
function floodFill(startX, startY, fillColor) {
  const pixelStack = [[startX, startY]];
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const width = canvas.width;

  // Get the target color at the start position.
  const startPos = (startY * width + startX) * 4;
  const targetColor = data.slice(startPos, startPos + 4);
  const fillColorArr = hexToRgbaArray(fillColor, opacityInput.value);

  // If the target color is the same as fill color, no need to fill.
  if (targetColor[0] === fillColorArr[0] &&
      targetColor[1] === fillColorArr[1] &&
      targetColor[2] === fillColorArr[2] &&
      targetColor[3] === fillColorArr[3]) {
    return;
  }

  function matchColor(index) {
    return (
      data[index] === targetColor[0] &&
      data[index + 1] === targetColor[1] &&
      data[index + 2] === targetColor[2] &&
      data[index + 3] === targetColor[3]
    );
  }

  function setColor(index) {
    data[index] = fillColorArr[0];
    data[index + 1] = fillColorArr[1];
    data[index + 2] = fillColorArr[2];
    data[index + 3] = fillColorArr[3];
  }

  while(pixelStack.length) {
    const [x, y] = pixelStack.pop();
    let currentPos = (y * width + x) * 4;

    // Move up as long as the color matches.
    while(y >= 0 && matchColor(currentPos)) {
      y--;
      currentPos -= width * 4;
    }
    y++;
    currentPos += width * 4;

    let reachLeft = false;
    let reachRight = false;

    while(y < canvas.height && matchColor(currentPos)) {
      setColor(currentPos);

      // Check left pixel.
      if(x > 0) {
        if(matchColor(currentPos - 4)) {
          if(!reachLeft) {
            pixelStack.push([x - 1, y]);
            reachLeft = true;
          }
        } else if(reachLeft) {
          reachLeft = false;
        }
      }
      
      // Check right pixel.
      if(x < width - 1) {
        if(matchColor(currentPos + 4)) {
          if(!reachRight) {
            pixelStack.push([x + 1, y]);
            reachRight = true;
          }
        } else if(reachRight) {
          reachRight = false;
        }
      }

      y++;
      currentPos += width * 4;
    }
  }

  ctx.putImageData(imageData, 0, 0);
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

// ----- DRAWING HANDLERS -----
// General drawing (only if not using shape or fill tool)
canvas.addEventListener('mousedown', (e) => {
  if (currentTool === 'shape' || currentTool === 'fill') return; // skip general drawing for these tools
  const rect = canvas.getBoundingClientRect();
  lastX = e.clientX - rect.left;
  lastY = e.clientY - rect.top;
  saveState(); // save before starting drawing
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
  
  // Set composite mode based on tool
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
    // Save state after drawing is complete.
    saveState();
  }
});
canvas.addEventListener('mouseout', (e) => {
  if (isDrawing) {
    isDrawing = false;
    saveState();
  }
});

// ----- FILL TOOL HANDLER (FLOOD FILL) -----
canvas.addEventListener('mousedown', (e) => {
  if (currentTool === 'fill') {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(e.clientX - rect.left);
    const y = Math.floor(e.clientY - rect.top);
    saveState(); // save state before filling
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
  // Restore saved state for live preview of shape.
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
    let radius = Math.sqrt(w * w + h * h);
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
  if (currentTool === 'shape' && shapeActive) {
    shapeActive = false;
    // Save state after drawing shape.
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
  else if (key === 'z') { // Shortcut for undo/back function
    undo();
  }
});

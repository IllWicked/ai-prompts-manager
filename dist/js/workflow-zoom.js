/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WORKFLOW ZOOM MODULE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Edit mode: Camera model (camera.x, camera.y, camera.z)
 *   - Один CSS transform: scale(z) translate(x, y)
 *   - Нет scroll — камера управляет позицией
 *   - screenToCanvas / canvasToScreen конвертеры
 * 
 * View mode: Авто-zoom с опциональным zoom in (scroll-based, без изменений)
 */

// ═══════════════════════════════════════════════════════════════════════════
// CAMERA MODEL (edit mode)
// ═══════════════════════════════════════════════════════════════════════════

const camera = { x: 0, y: 0, z: 0.6 };

function screenToCanvas(sx, sy) {
    return { x: sx / camera.z - camera.x, y: sy / camera.z - camera.y };
}

function canvasToScreen(cx, cy) {
    return { x: (cx + camera.x) * camera.z, y: (cy + camera.y) * camera.z };
}

function applyCamera() {
    const canvas = getWorkflowCanvas();
    const wrapper = getWorkflowWrapper();
    if (!canvas || !wrapper) return;
    
    canvas.style.transform = `scale(${camera.z}) translate(${camera.x}px, ${camera.y}px)`;
    canvas.style.transformOrigin = 'top left';
    canvas.style.setProperty('--zoom-inverse', 1 / camera.z);
    
    const canvasSize = getCanvasSize();
    canvas.style.minWidth = canvasSize + 'px';
    canvas.style.minHeight = canvasSize + 'px';
    canvas.style.width = '';
    canvas.style.height = '';
    
    wrapper.style.width = '100%';
    wrapper.style.height = '100%';
    
    workflowZoom = camera.z;
    
    const indicator = getZoomIndicator();
    if (indicator) {
        indicator.textContent = Math.round(camera.z * 100) + '%';
        indicator.classList.add('visible');
    }
}

function zoomCameraToPoint(screenX, screenY, newZ) {
    const oldZ = camera.z;
    camera.z = newZ;
    camera.x += screenX / newZ - screenX / oldZ;
    camera.y += screenY / newZ - screenY / oldZ;
    applyCamera();
}

function centerOnContent() {
    const container = getWorkflowContainer();
    if (!container) return;
    
    const bounds = calculateContentBounds();
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    const vw = container.clientWidth;
    const vh = container.clientHeight;
    
    camera.x = vw / (2 * camera.z) - cx;
    camera.y = vh / (2 * camera.z) - cy;
    applyCamera();
}

// ═══════════════════════════════════════════════════════════════════════════
// VIEW MODE STATE
// ═══════════════════════════════════════════════════════════════════════════

let viewModeZoom = null;
let viewModeBaseZoom = 0.5;

// ═══════════════════════════════════════════════════════════════════════════
// MAIN SCALE FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

function adjustWorkflowScale() {
    const container = getWorkflowContainer();
    const canvas = getWorkflowCanvas();
    const wrapper = getWorkflowWrapper();
    if (!container || !canvas || !wrapper) return;
    
    if (isEditMode) {
        applyCamera();
        viewModeZoom = null;
    } else {
        // View mode — scroll-based, без изменений
        viewModeBaseZoom = calculateViewModeZoom();
        const currentZoom = viewModeZoom !== null ? viewModeZoom : viewModeBaseZoom;
        
        canvas.style.setProperty('--zoom-inverse', 1 / currentZoom);
        
        const canvasSize = getCanvasSize();
        canvas.style.minWidth = canvasSize + 'px';
        canvas.style.minHeight = canvasSize + 'px';
        canvas.style.width = '';
        canvas.style.height = '';
        canvas.style.left = '0';
        canvas.style.top = '0';
        
        const bounds = calculateContentBounds();
        const offsetX = -bounds.minX + 25;
        const offsetY = -bounds.minY + 25;
        canvas.style.transform = `scale(${currentZoom}) translate(${offsetX}px, ${offsetY}px)`;
        canvas.style.transformOrigin = 'top left';
        
        const contentWidth = bounds.maxX - bounds.minX + 50;
        const contentHeight = bounds.maxY - bounds.minY + 50;
        wrapper.style.width = (contentWidth * currentZoom) + 'px';
        
        const finishBtn = document.getElementById('finish-project-btn');
        const continueBtn = document.getElementById('continue-project-btn');
        const buttonVisible = finishBtn?.classList.contains('visible') || continueBtn?.classList.contains('visible');
        const buttonOffset = buttonVisible ? 75 : 0;
        wrapper.style.height = (contentHeight * currentZoom) + buttonOffset + 'px';
        
        const indicator = getZoomIndicator();
        if (indicator) {
            if (viewModeZoom !== null) {
                indicator.textContent = Math.round(currentZoom * 100) + '%';
                indicator.classList.add('visible');
            } else {
                indicator.classList.remove('visible');
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTENT BOUNDS & CANVAS SIZE
// ═══════════════════════════════════════════════════════════════════════════

function calculateContentBounds() {
    const nodes = document.querySelectorAll('.workflow-node, .workflow-note');
    if (nodes.length === 0) return { minX: 0, maxX: 800, minY: 0, maxY: 600 };
    let minX = Infinity, maxX = 0, minY = Infinity, maxY = 0;
    nodes.forEach(node => {
        const x = parseInt(node.style.left) || 0;
        const y = parseInt(node.style.top) || 0;
        const w = node.offsetWidth || 700;
        const h = node.offsetHeight || 200;
        if (x < minX) minX = x;
        if (x + w > maxX) maxX = x + w;
        if (y < minY) minY = y;
        if (y + h > maxY) maxY = y + h;
    });
    return { minX, maxX, minY, maxY };
}

let _cachedCanvasSize = null;
function getCanvasSize() {
    if (_cachedCanvasSize !== null) return _cachedCanvasSize;
    const bounds = calculateContentBounds();
    const padding = WORKFLOW_CONFIG.CANVAS_PADDING;
    const minSize = WORKFLOW_CONFIG.CANVAS_CENTER * 2;
    _cachedCanvasSize = Math.max(minSize, Math.max(bounds.maxX, bounds.maxY) + padding);
    return _cachedCanvasSize;
}

function invalidateCanvasSize() { _cachedCanvasSize = null; }

function calculateViewModeZoom() {
    const container = getWorkflowContainer();
    const nodes = document.querySelectorAll('.workflow-node, .workflow-note');
    if (!container || nodes.length === 0) return 0.6;
    let minX = Infinity, maxX = 0;
    nodes.forEach(node => {
        const x = parseInt(node.style.left) || 0;
        const w = node.offsetWidth || 700;
        if (x < minX) minX = x;
        if (x + w > maxX) maxX = x + w;
    });
    return Math.max(0.1, Math.min(0.5, container.clientWidth / (maxX - minX + 80)));
}

// ═══════════════════════════════════════════════════════════════════════════
// SETUP: ZOOM + PAN + MARQUEE
// ═══════════════════════════════════════════════════════════════════════════

function setupWorkflowZoom() {
    const container = getWorkflowContainer();
    if (!container) return;
    
    // Загружаем камеру
    loadCameraState();
    
    // ── Zoom indicator click to reset ──
    const zoomIndicator = getZoomIndicator();
    if (zoomIndicator) {
        zoomIndicator.addEventListener('click', () => {
            if (isEditMode) {
                camera.z = 0.6;
                centerOnContent();
                saveCameraState();
            } else if (viewModeZoom !== null) {
                viewModeZoom = null;
                adjustWorkflowScale();
                const container = getWorkflowContainer();
                if (container) { container.scrollTop = 0; container.scrollLeft = 0; }
            }
        });
    }
    
    // ── Wheel ──
    container.addEventListener('wheel', (e) => {
        if (e.ctrlKey) {
            e.preventDefault();
            if (!getWorkflowCanvas()) return;
            const zoomSpeed = 0.05;
            const delta = e.deltaY > 0 ? -zoomSpeed : zoomSpeed;
            
            if (isEditMode) {
                const newZ = Math.round(Math.max(WORKFLOW_CONFIG.ZOOM_MIN, Math.min(WORKFLOW_CONFIG.ZOOM_MAX, camera.z + delta)) * 100) / 100;
                if (newZ !== camera.z) {
                    const rect = container.getBoundingClientRect();
                    zoomCameraToPoint(e.clientX - rect.left, e.clientY - rect.top, newZ);
                    saveCameraState();
                }
            } else {
                // View mode zoom
                const cur = viewModeZoom !== null ? viewModeZoom : viewModeBaseZoom;
                const nz = Math.round(Math.max(viewModeBaseZoom, Math.min(WORKFLOW_CONFIG.ZOOM_MAX, cur + delta)) * 100) / 100;
                
                // Zoom out ниже минимума — сброс (как клик по индикатору)
                if (delta < 0 && viewModeZoom !== null && nz <= viewModeBaseZoom) {
                    viewModeZoom = null;
                    adjustWorkflowScale();
                    container.scrollTop = 0;
                    container.scrollLeft = 0;
                } else if (nz !== cur) {
                    const rect = container.getBoundingClientRect();
                    const mx = e.clientX - rect.left + container.scrollLeft;
                    const my = e.clientY - rect.top + container.scrollTop;
                    const cx = mx / cur, cy = my / cur;
                    viewModeZoom = nz <= viewModeBaseZoom ? null : nz;
                    adjustWorkflowScale();
                    const ez = viewModeZoom !== null ? viewModeZoom : viewModeBaseZoom;
                    container.scrollTo({ left: Math.round(cx * ez - (e.clientX - rect.left)), top: Math.round(cy * ez - (e.clientY - rect.top)), behavior: 'instant' });
                }
            }
        } else if (isEditMode) {
            // Скролл внутри textarea
            const scrollableEl = e.target.closest('textarea, .workflow-node-body');
            if (scrollableEl && scrollableEl.scrollHeight > scrollableEl.clientHeight) {
                const atTop = scrollableEl.scrollTop <= 0;
                const atBottom = scrollableEl.scrollTop + scrollableEl.clientHeight >= scrollableEl.scrollHeight - 1;
                if ((e.deltaY < 0 && !atTop) || (e.deltaY > 0 && !atBottom)) return;
                e.preventDefault();
                return;
            }
            // Camera pan
            e.preventDefault();
            camera.x += (e.shiftKey ? -e.deltaY : -(e.deltaX || 0)) / camera.z;
            camera.y += (e.shiftKey ? 0 : -e.deltaY) / camera.z;
            applyCamera();
        }
    }, { passive: false });
    
    // ── Space ──
    let isSpacePressed = false;
    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && !e.target.matches('input, textarea, [contenteditable]')) {
            if (!isSpacePressed) { isSpacePressed = true; if (isEditMode) container.style.cursor = 'grab'; }
            e.preventDefault();
        }
    });
    window.addEventListener('keyup', (e) => {
        if (e.code === 'Space') { isSpacePressed = false; if (!isPanning) container.style.cursor = ''; }
    });
    
    // ── Panning + Marquee ──
    let isPanning = false;
    let panLastX = 0, panLastY = 0;
    
    container.addEventListener('mousedown', (e) => {
        const isEmptyCanvas = e.target.id === 'workflow-canvas' || e.target.id === 'workflow-container' ||
            e.target.classList.contains('workflow-svg') || e.target.classList.contains('workflow-wrapper') ||
            e.target.classList.contains('grid-overlay') || e.target.tagName === 'path';
        
        if (e.button === 0 && isEmptyCanvas && !window.isTextSelecting) {
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) sel.removeAllRanges();
            if (document.activeElement?.tagName === 'TEXTAREA') document.activeElement.blur();
        }
        
        if (!isEditMode) {
            if (e.button === 1) {
                e.preventDefault(); isPanning = true; panLastX = e.clientX; panLastY = e.clientY;
                container.style.cursor = 'grabbing';
            }
            return;
        }
        
        if (e.button === 1 || (e.button === 0 && isEmptyCanvas)) {
            e.preventDefault();
            if (e.button === 1 || isSpacePressed) {
                isPanning = true; panLastX = e.clientX; panLastY = e.clientY;
                container.style.cursor = 'grabbing';
            } else {
                if (!e.ctrlKey && selectedNodes.size > 0) clearNodeSelection();
                startMarqueeSelection(container, e);
            }
        }
    });
    
    container.addEventListener('click', (e) => {
        const isEmptyCanvas = e.target.id === 'workflow-canvas' || e.target.id === 'workflow-container' ||
            e.target.classList.contains('workflow-svg') || e.target.classList.contains('workflow-wrapper') ||
            e.target.classList.contains('grid-overlay') || e.target.tagName === 'path';
        if (isEmptyCanvas && !window.isTextSelecting) { const sel = window.getSelection(); if (sel) sel.removeAllRanges(); }
    });
    
    container.addEventListener('mousemove', (e) => {
        if (isPanning) {
            e.preventDefault();
            const dx = e.clientX - panLastX, dy = e.clientY - panLastY;
            panLastX = e.clientX; panLastY = e.clientY;
            if (isEditMode) {
                camera.x += dx / camera.z; camera.y += dy / camera.z;
                applyCamera();
            } else {
                container.scrollLeft -= dx; container.scrollTop -= dy;
            }
        } else {
            updateMarqueeSelection(container, e);
        }
    });
    
    container.addEventListener('mouseup', () => {
        if (isPanning) { isPanning = false; container.style.cursor = isSpacePressed ? 'grab' : ''; saveCameraState(); }
        else endMarqueeSelection(container);
    });
    
    container.addEventListener('mouseleave', () => {
        if (isPanning) { isPanning = false; container.style.cursor = ''; saveCameraState(); }
        else endMarqueeSelection(container);
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// SCROLL TO BLOCKS
// ═══════════════════════════════════════════════════════════════════════════

function scrollToBlocks() {
    const container = getWorkflowContainer();
    if (!container) return;
    if (!isEditMode) { container.scrollTop = 0; return; }
    centerOnContent();
}

// ═══════════════════════════════════════════════════════════════════════════
// CAMERA PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════

function saveCameraState() {
    localStorage.setItem(STORAGE_KEYS.WORKFLOW_ZOOM, camera.z);
    try { localStorage.setItem('workflowCameraX', camera.x); localStorage.setItem('workflowCameraY', camera.y); } catch (_) {}
}

function loadCameraState() {
    const z = parseFloat(localStorage.getItem(STORAGE_KEYS.WORKFLOW_ZOOM));
    const x = parseFloat(localStorage.getItem('workflowCameraX'));
    const y = parseFloat(localStorage.getItem('workflowCameraY'));
    if (!isNaN(z) && z > 0) camera.z = z;
    if (!isNaN(x)) camera.x = x;
    if (!isNaN(y)) camera.y = y;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

window.adjustWorkflowScale = adjustWorkflowScale;
window.scrollToBlocks = scrollToBlocks;
window.getCanvasSize = getCanvasSize;
window.invalidateCanvasSize = invalidateCanvasSize;
window.resetViewModeZoom = function() { viewModeZoom = null; };
window.screenToCanvas = screenToCanvas;
window.canvasToScreen = canvasToScreen;
window.applyCamera = applyCamera;
window.centerOnContent = centerOnContent;
window.saveCameraState = saveCameraState;
window.loadCameraState = loadCameraState;
window.camera = camera;

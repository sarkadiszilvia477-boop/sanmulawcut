/**
 * 诉讼长图智能分割工具 - 应用逻辑
 * App Logic
 */

const DOM = {
    // Zones
    uploadZone: document.getElementById('landing-view'),
    editorZone: document.getElementById('editor-view'),
    loadingOverlay: document.getElementById('loading-overlay'),
    dragDropOverlay: document.getElementById('drag-drop-overlay'),
    
    // Inputs
    fileInput: document.getElementById('file-input'),
    fileNameDisplay: document.getElementById('file-info-name'),
    btnReupload: document.getElementById('btn-reupload'),
    
    // File Nav
    fileNavContainer: document.getElementById('file-nav-container'),
    btnPrevFile: document.getElementById('btn-prev-file'),
    btnNextFile: document.getElementById('btn-next-file'),
    fileCounter: document.getElementById('file-counter'),
    
    // Controls
    splitCountSlider: document.getElementById('split-count'),
    splitCountVal: document.getElementById('split-count-val'),
    toleranceSlider: document.getElementById('tolerance'),
    toleranceVal: document.getElementById('tolerance-val'),
    bgRadios: document.getElementsByName('bg-type'),
    imagesPerPageSelect: document.getElementById('images-per-page'),
    
    // Buttons
    btnAutoSplit: document.getElementById('btn-auto-split'),
    btnExportPDF: document.getElementById('btn-export-pdf'),
    btnExportZip: document.getElementById('btn-export-zip'),
    
    // Canvas & Editor
    masterCanvas: document.getElementById('master-canvas'),
    splitLinesContainer: document.getElementById('split-lines-container'),
    scrollInstruction: document.getElementById('scroll-instruction')
};

// State
const AppState = {
    // Queue of { file: File, imageObj: Image, splitPoints: [] }
    fileQueue: [],
    currentIndex: 0,
    
    get currentFile() { return this.fileQueue[this.currentIndex]; },
    
    get imageObj() { return this.currentFile?.imageObj; },
    get imageWidth() { return this.currentFile?.imageObj.width; },
    get imageHeight() { return this.currentFile?.imageObj.height; },
    
    get splitPoints() { return this.currentFile?.splitPoints || []; },
    set splitPoints(val) { if(this.currentFile) this.currentFile.splitPoints = val; },

    renderScale: 1, // Canvas visually scaled relative to actual image
    
    // Parameters
    splitCount: 4,
    tolerance: 300,
    backgroundMode: 'light', // light or dark
    imagesPerPage: 4
};

/**
 * Initialize Event Listeners
 */
function initEvents() {
    // ------------------- Global Upload Handling -------------------
    let dragCounter = 0; // prevent flickering with child elements
    
    document.body.addEventListener('dragover', (e) => {
        e.preventDefault();
    });
    
    document.body.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dragCounter++;
        DOM.dragDropOverlay.classList.remove('hidden');
        setTimeout(()=> DOM.dragDropOverlay.classList.add('dragover'), 10);
    });
    
    document.body.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dragCounter--;
        if (dragCounter === 0) {
            DOM.dragDropOverlay.classList.remove('dragover');
            DOM.dragDropOverlay.classList.add('hidden');
        }
    });
    
    document.body.addEventListener('drop', (e) => {
        e.preventDefault();
        dragCounter = 0;
        DOM.dragDropOverlay.classList.remove('dragover');
        DOM.dragDropOverlay.classList.add('hidden');
        
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFileUploads(e.dataTransfer.files);
        }
    });
    
    DOM.fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            handleFileUploads(e.target.files);
        }
    });

    DOM.btnReupload.addEventListener('click', () => {
        DOM.editorZone.classList.remove('active');
        DOM.uploadZone.classList.add('active');
        DOM.fileInput.value = '';
        AppState.fileQueue = [];
        AppState.currentIndex = 0;
        disableControls();
    });
    
    // ------------------- Navigation Binding -----------------
    DOM.btnPrevFile.addEventListener('click', () => {
        if (AppState.currentIndex > 0) {
            AppState.currentIndex--;
            switchToFile(AppState.currentIndex);
        }
    });
    DOM.btnNextFile.addEventListener('click', () => {
        if (AppState.currentIndex < AppState.fileQueue.length - 1) {
            AppState.currentIndex++;
            switchToFile(AppState.currentIndex);
        }
    });

    // ------------------- Controls Binding -------------------
    DOM.splitCountSlider.addEventListener('input', (e) => {
        AppState.splitCount = parseInt(e.target.value);
        DOM.splitCountVal.textContent = `${AppState.splitCount} 段`;
    });
    
    DOM.toleranceSlider.addEventListener('input', (e) => {
        AppState.tolerance = parseInt(e.target.value);
        DOM.toleranceVal.textContent = `±${AppState.tolerance}px`;
    });

    DOM.imagesPerPageSelect.addEventListener('change', (e) => {
        AppState.imagesPerPage = parseInt(e.target.value);
    });

    Array.from(DOM.bgRadios).forEach(r => {
        r.addEventListener('change', (e) => {
            if(e.target.checked) AppState.backgroundMode = e.target.value;
        });
    });

    // ------------------- Actions Bindings -------------------
    DOM.btnAutoSplit.addEventListener('click', calculateSmartSplits);
    
    DOM.btnExportPDF.addEventListener('click', exportToPDF);
    DOM.btnExportZip.addEventListener('click', exportToZip);
}

/**
 * File Upload and Processing (Batch)
 */
async function handleFileUploads(fileList) {
    const validFiles = Array.from(fileList).filter(f => f.type.match('image.*'));
    if (validFiles.length === 0) {
        alert('请上传有效的图片文件 (JPG / PNG / WebP)');
        return;
    }
    
    showLoading(true);
    DOM.loadingOverlay.querySelector('.loading-text').textContent = `正在读取 ${validFiles.length} 张图片...`;
    
    AppState.fileQueue = [];
    AppState.currentIndex = 0;
    
    // Process files sequentially
    for (const file of validFiles) {
        await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    AppState.fileQueue.push({
                        file: file,
                        imageObj: img,
                        splitPoints: []
                    });
                    resolve();
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    }
    
    DOM.uploadZone.classList.remove('active');
    DOM.editorZone.classList.add('active');
    enableControls();
    
    // Start with the first file
    switchToFile(0, true);
}

function switchToFile(index, initialCalc = false) {
    const fileItem = AppState.fileQueue[index];
    DOM.fileNameDisplay.textContent = fileItem.file.name;
    
    // Update Nav UI
    if (AppState.fileQueue.length > 1) {
        DOM.fileNavContainer.style.display = 'flex';
        DOM.fileCounter.textContent = `${index + 1} / ${AppState.fileQueue.length}`;
        DOM.btnPrevFile.disabled = index === 0;
        DOM.btnNextFile.disabled = index === AppState.fileQueue.length - 1;
    } else {
        DOM.fileNavContainer.style.display = 'none';
    }
    
    renderMasterCanvas();
    
    // If it's the first time landing on this file and it has no splits yet, auto-calculate.
    // If we just loaded a batch, we calculate for the visible one immediately.
    // Optimization: Should we auto-calc all in background? For large sets, calculating on-demand is better memory-wise.
    if (initialCalc || fileItem.splitPoints.length === 0) {
        setTimeout(() => {
            if(initialCalc) DOM.scrollInstruction.classList.add('show');
            calculateSmartSplits();
            if(initialCalc) setTimeout(() => DOM.scrollInstruction.classList.remove('show'), 5000);
        }, 100); // UI frame delay
    } else {
        // Just render existing lines
        renderSplitLinesUI();
    }
}

function renderMasterCanvas() {
    const ctx = DOM.masterCanvas.getContext('2d');
    
    // We render the actual size to the canvas internally
    // CSS scales it down to max 600px width
    DOM.masterCanvas.width = AppState.imageWidth;
    DOM.masterCanvas.height = AppState.imageHeight;
    
    ctx.drawImage(AppState.imageObj, 0, 0);
    
    // Calculate the scale ratio of the displayed canvas vs actual image size
    // Need to do this after rendering and DOM update to get correct clientWidth
    setTimeout(updateRenderScale, 50);
    window.addEventListener('resize', updateRenderScale);
}

function updateRenderScale() {
    if(!AppState.imageWidth) return;
    const rect = DOM.masterCanvas.getBoundingClientRect();
    AppState.renderScale = rect.height / AppState.imageHeight;
    
    // Also attach the container height exactly to the canvas height
    DOM.splitLinesContainer.style.height = `${rect.height}px`;
    DOM.splitLinesContainer.style.width = `${rect.width}px`;
}

/**
 * Smart Split Calculation Algorithm
 */
function calculateSmartSplits() {
    if(!AppState.imageObj) return;
    
    showLoading(true);
    
    // Use setTimeout to allow UI to update loading state before heavy calculation
    setTimeout(() => {
        try {
            // Segment the target points
            const segments = AppState.splitCount;
            const targetHeight = AppState.imageHeight / segments;
            
            AppState.splitPoints = [];
            
            // Context to read pixel data
            const ctx = DOM.masterCanvas.getContext('2d');
            const imgData = ctx.getImageData(0, 0, AppState.imageWidth, AppState.imageHeight);
            
            for (let i = 1; i < segments; i++) {
                const targetY = Math.floor(targetHeight * i);
                
                const bestY = findBestSplitLine(imgData, targetY, AppState.tolerance, AppState.imageWidth, AppState.imageHeight, AppState.backgroundMode);
                AppState.splitPoints.push(bestY);
            }
            
            renderSplitLinesUI();
        } catch (err) {
            console.error(err);
            alert("由于图片过大或浏览器内存限制，智能分析失败。您可手动进行裁剪。");
        } finally {
            showLoading(false);
        }
    }, 100);
}

/**
 * The core smart split feature - variance calculation across rows
 */
function findBestSplitLine(imgData, targetY, tolerance, width, height, bgMode) {
    const startY = Math.max(0, targetY - tolerance);
    const endY = Math.min(height - 1, targetY + tolerance);
    
    let bestY = targetY;
    let minVariance = Infinity;
    
    // Define the ideal background color based on mode
    // Light mode: usually near white / light gray RGB(237, 237, 237)
    // Dark mode: dark gray or black RGB(25, 25, 25)
    
    // Fast path: subsampling columns for performance (e.g. check every 4th pixel)
    const colStep = 4; 
    
    for (let y = startY; y <= endY; y++) {
        let rSum = 0, gSum = 0, bSum = 0;
        let pCount = 0;
        
        let rowBaseIdx = y * width * 4;
        
        // 1. Calculate Average Color of Row
        for (let x = 0; x < width; x += colStep) {
            let idx = rowBaseIdx + x * 4;
            rSum += imgData.data[idx];
            gSum += imgData.data[idx+1];
            bSum += imgData.data[idx+2];
            pCount++;
        }
        
        let avgR = rSum / pCount;
        let avgG = gSum / pCount;
        let avgB = bSum / pCount;
        
        // 2. Calculate sum of squared differences (variance)
        let variance = 0;
        for (let x = 0; x < width; x += colStep) {
            let idx = rowBaseIdx + x * 4;
            variance += Math.pow(imgData.data[idx] - avgR, 2) +
                        Math.pow(imgData.data[idx+1] - avgG, 2) +
                        Math.pow(imgData.data[idx+2] - avgB, 2);
        }
        
        // If variance is very low, it's a solid line. 
        // Penalize variance based on how far it is from targetY to prefer cutting near target
        const distancePenalty = Math.abs(y - targetY) * 0.1;
        
        const score = variance + distancePenalty;
        
        if (score < minVariance) {
            minVariance = score;
            bestY = y;
        }
    }
    
    return bestY;
}

/**
 * Draw Interactive Split Lines on Top of Canvas
 */
function renderSplitLinesUI() {
    // Clear old lines
    DOM.splitLinesContainer.innerHTML = '';
    
    AppState.splitPoints.forEach((origY, index) => {
        const line = document.createElement('div');
        line.className = 'split-line';
        
        // Calculate % position relative to container
        const percentY = (origY / AppState.imageHeight) * 100;
        line.style.top = `${percentY}%`;
        line.dataset.index = index;
        
        const handleInfo = document.createElement('div');
        handleInfo.className = 'drag-handle';
        handleInfo.textContent = `y:${origY}`;
        line.appendChild(handleInfo);
        
        setupDraggable(line, index, handleInfo);
        
        DOM.splitLinesContainer.appendChild(line);
    });
}

function setupDraggable(element, pointIndex, handleInfo) {
    let isDragging = false;
    let containerRect;
    
    element.addEventListener('pointerdown', (e) => {
        isDragging = true;
        element.setPointerCapture(e.pointerId);
        element.classList.add('dragging');
        containerRect = DOM.splitLinesContainer.getBoundingClientRect();
        document.body.style.cursor = 'ns-resize';
        e.preventDefault();
    });
    
    element.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        
        let yPos = e.clientY - containerRect.top;
        // constrain
        yPos = Math.max(0, Math.min(yPos, containerRect.height));
        
        const percentY = (yPos / containerRect.height) * 100;
        element.style.top = `${percentY}%`;
        
        // Update Actual Model State
        const originalY = Math.round((yPos / containerRect.height) * AppState.imageHeight);
        AppState.splitPoints[pointIndex] = originalY;
        handleInfo.textContent = `y:${originalY}`;
    });
    
    element.addEventListener('pointerup', (e) => {
        if (isDragging) {
            isDragging = false;
            element.releasePointerCapture(e.pointerId);
            element.classList.remove('dragging');
            document.body.style.cursor = 'default';
        }
    });

    element.addEventListener('pointercancel', (e) => {
        if (isDragging) {
            isDragging = false;
            element.releasePointerCapture(e.pointerId);
            element.classList.remove('dragging');
            document.body.style.cursor = 'default';
        }
    });
}

function enableControls() {
    DOM.btnAutoSplit.disabled = false;
    DOM.btnExportPDF.disabled = false;
    DOM.btnExportZip.disabled = false;
}

function disableControls() {
    DOM.btnAutoSplit.disabled = true;
    DOM.btnExportPDF.disabled = true;
    DOM.btnExportZip.disabled = true;   
}

function showLoading(show) {
    if(show) DOM.loadingOverlay.classList.remove('hidden');
    else DOM.loadingOverlay.classList.add('hidden');
}


/**
 * Helpers to get image slices for a SPECIFIC file item
 */
function getSlicedImagesForFile(fileItem) {
    if (!fileItem || !fileItem.imageObj) return [];
    
    // Sort just in case 
    let points = [...fileItem.splitPoints].sort((a, b) => a - b);
    
    // Safety clamp
    points = points.map(p => Math.max(0, Math.min(fileItem.imageObj.height, p)));
    
    let slices = [];
    let currentY = 0;
    
    // Add the bottom-most point to finish the loop
    points.push(fileItem.imageObj.height);
    
    points.forEach(y => {
        let h = y - currentY;
        if (h <= 0) return; // Skip zero height slice
        
        let canvas = document.createElement('canvas');
        canvas.width = fileItem.imageObj.width;
        canvas.height = h;
        let ctx = canvas.getContext('2d');
        
        // drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh)
        ctx.drawImage(fileItem.imageObj, 0, currentY, fileItem.imageObj.width, h, 0, 0, fileItem.imageObj.width, h);
        
        slices.push({
            url: canvas.toDataURL('image/jpeg', 0.95),
            width: fileItem.imageObj.width,
            height: h
        });
        currentY = y;
    });
    
    return slices;
}

/**
 * Export to PDF using jsPDF
 * Optimizing for print quality and exact aspect ratio maintenance across MULTIPLE files
 */
async function exportToPDF() {
    if (AppState.fileQueue.length === 0) return;
    
    showLoading(true);
    DOM.loadingOverlay.querySelector('.loading-text').textContent = '正在生成PDF...';
    
    setTimeout(() => {
        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4',
                compress: true // enable compression for faster output without losing quality
            });
            
            const pageWidth = 210;
            const pageHeight = 297;
            const margin = 15; // Increased margin slightly for standard binders
            
            const perPage = AppState.imagesPerPage;
            
            // Determine grid columns and rows based on perPage setting
            let cols = 1;
            let rows = perPage;
            if (perPage === 2) {
                cols = 2; // 2 cols, 1 row
                rows = 1;
            } else if (perPage === 4) {
                cols = 2; // 2 cols, 2 rows
                rows = 2;
            } else if (perPage === 6) {
                cols = 2; // 2 cols, 3 rows
                rows = 3;
            }
            
            // Layout params
            const contentWidth = pageWidth - margin * 2;
            const contentHeight = pageHeight - margin * 2;
            const gap = 10; // mm between images
            
            // Collect ALL slices from ALL queued files
            let allImageInfos = [];
            AppState.fileQueue.forEach(fileItem => {
                const slices = getSlicedImagesForFile(fileItem);
                allImageInfos = allImageInfos.concat(slices);
            });
            
            let imgCountOnPage = 0;

            // Calculate exact slot dimensions for each image in the grid
            const slotWidth = (contentWidth - gap * (cols - 1)) / cols;
            const slotHeight = (contentHeight - gap * (rows - 1)) / rows;

            allImageInfos.forEach(info => {
                // Determine scale to fit within slot (contain)
                let scaleW = slotWidth / info.width;
                let scaleH = slotHeight / info.height;
                let scale = Math.min(scaleW, scaleH); // prevent stretching
                
                let displayWidth = info.width * scale;
                let displayHeight = info.height * scale;
                
                // Page break logic if this page is full
                if (imgCountOnPage >= perPage) {
                    doc.addPage();
                    imgCountOnPage = 0;
                }
                
                // Which col and row is this image placed in?
                let colIdx = imgCountOnPage % cols;
                let rowIdx = Math.floor(imgCountOnPage / cols);
                
                // Calculate drawing coordinates
                let slotX = margin + colIdx * (slotWidth + gap);
                let slotY = margin + rowIdx * (slotHeight + gap);
                
                // Center horizontally within its specific grid slot
                let xPosition = slotX + (slotWidth - displayWidth) / 2;
                // Align to top of its slot for neatness across rows
                let yPosition = slotY;
                
                // Draw high-quality JPEG
                doc.addImage(info.url, 'JPEG', xPosition, yPosition, displayWidth, displayHeight, undefined, 'FAST');
                imgCountOnPage++;
            });
            
            // Save the PDF
            // Use the first file's name as base, indicate total files if multiple
            let baseName = AppState.fileQueue[0].file.name.replace(/\.[^/.]+$/, "");
            if (AppState.fileQueue.length > 1) {
                baseName += `_等${AppState.fileQueue.length}个文件`;
            }
            doc.save(`${baseName}_分割排版.pdf`);
            
        } catch(e) {
            console.error(e);
            alert("生成 PDF 失败，可能是电脑运行内存不足或总截图过多。建议分批导出。");
        } finally {
            DOM.loadingOverlay.querySelector('.loading-text').textContent = '处理中...';
            showLoading(false);
        }
    }, 100);
}

/**
 * Export to ZIP using JSZip (Batch Mode)
 */
async function exportToZip() {
    if (AppState.fileQueue.length === 0) return;
    
    showLoading(true);
    DOM.loadingOverlay.querySelector('.loading-text').textContent = '正在导出图片...';
    
    setTimeout(async () => {
        try {
            const zip = new JSZip();
            
            AppState.fileQueue.forEach((fileItem, fileIdx) => {
                const slices = getSlicedImagesForFile(fileItem);
                
                slices.forEach((info, sliceIdx) => {
                    // remove 'data:image/jpeg;base64,'
                    const base64Data = info.url.split(',')[1];
                    const originalName = fileItem.file.name.replace(/\.[^/.]+$/, "");
                    
                    zip.file(`${originalName}_分段${sliceIdx + 1}.jpg`, base64Data, {base64: true});
                });
            });
            
            const content = await zip.generateAsync({type: 'blob'});
            
            // download
            const link = document.createElement('a');
            link.href = URL.createObjectURL(content);
            
            // Use the first file's name as base, indicate total files if multiple
            let baseName = AppState.fileQueue[0].file.name.replace(/\.[^/.]+$/, "");
            if (AppState.fileQueue.length > 1) {
                baseName += `_等${AppState.fileQueue.length}个文件`;
            }
            link.download = `${baseName}_压缩包.zip`;
            link.click();
            URL.revokeObjectURL(link.href);
            
        } catch(e) {
            console.error(e);
            alert("打包 ZIP 失败");
        } finally {
            DOM.loadingOverlay.querySelector('.loading-text').textContent = '处理中...';
            showLoading(false);
        }
    }, 100);
}

// Kickoff
document.addEventListener('DOMContentLoaded', initEvents);
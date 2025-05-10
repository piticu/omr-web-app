document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const imageUpload = document.getElementById('imageUpload');
    const dropArea = document.getElementById('dropArea');
    const canvas = document.getElementById('omrCanvas');
    const ctx = canvas.getContext('2d');
    const confirmAndNextBtn = document.getElementById('confirmAndNextBtn');
    const downloadResultsBtn = document.getElementById('downloadResultsBtn');
    const statusEl = document.getElementById('status');
    const columnCounterDisplayEl = document.getElementById('columnCounterDisplay');
    const darkModeToggle = document.getElementById('darkModeToggle');
    const canvasPanelEl = document.getElementById('canvasPanel'); // For resize handler

    const numColumnsConfigEl = document.getElementById('numColumnsConfig');
    const numRowsConfigEl = document.getElementById('numRowsConfig');
    const confidenceConfigEl = document.getElementById('confidenceConfig');
    const confidenceValueEl = document.getElementById('confidenceValue');

    // --- State Variables ---
    let originalImage = null;
    let originalImageFilename = "omr_results.txt";
    let uploadedFileObject = null; 
    let canvasScaleX = 1, canvasScaleY = 1;

    let isDrawing = false;
    let selectionStartX, selectionStartY;
    let currentSelectionRect = null; 

    let currentLogicalColumnIndex = 0; 
    let lastAutoProcessedData = null; 

    let processedColumnsData = []; 

    // --- Dark Mode Implementation ---
    if (localStorage.getItem('darkMode') === 'enabled' || 
        (localStorage.getItem('darkMode') === null && 
         window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
    }

    darkModeToggle.addEventListener('click', () => {
        if (document.documentElement.classList.contains('dark')) {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('darkMode', 'disabled');
        } else {
            document.documentElement.classList.add('dark');
            localStorage.setItem('darkMode', 'enabled');
        }
    });
                                   
    // --- Configuration Getters ---
    const getConfig = () => ({
        numColumns: parseInt(numColumnsConfigEl.value) || 5,
        numRowsPerColumn: parseInt(numRowsConfigEl.value) || 20,
        minConfidenceScore: parseFloat(confidenceConfigEl.value) || 0.20
    });

    // --- UI Update Functions ---
    function updateStatus(message, type = "info") {
        statusEl.textContent = message;
        statusEl.className = "mt-5 p-3 rounded border min-h-[50px] flex items-center justify-center text-center font-medium";
        switch (type) {
            case "error":
                statusEl.classList.add("bg-red-100", "text-red-800", "border-red-200", "dark:bg-red-900", "dark:text-red-200", "dark:border-red-800");
                break;
            case "success":
                statusEl.classList.add("bg-green-100", "text-green-800", "border-green-200", "dark:bg-green-900", "dark:text-green-200", "dark:border-green-800");
                break;
            case "info":
            default:
                statusEl.classList.add("bg-blue-100", "text-blue-800", "border-blue-200", "dark:bg-blue-900", "dark:text-blue-200", "dark:border-blue-800");
                break;
        }
    }

    function updateColumnCounter() {
        const config = getConfig();
        if (originalImage && currentLogicalColumnIndex < config.numColumns) {
            columnCounterDisplayEl.textContent = `Drawing Column ${currentLogicalColumnIndex + 1} of ${config.numColumns}`;
        } else if (originalImage && currentLogicalColumnIndex >= config.numColumns) {
            columnCounterDisplayEl.textContent = `All ${config.numColumns} columns processed.`;
        } else {
            columnCounterDisplayEl.textContent = "";
        }
    }

    function updateButtonStates() {
        const config = getConfig();
        const isLastColumn = currentLogicalColumnIndex === config.numColumns - 1;
        const allColumnsConfirmed = currentLogicalColumnIndex >= config.numColumns;

        if (isLastColumn && lastAutoProcessedData) {
            confirmAndNextBtn.textContent = "Confirm Last Column";
        } else {
            confirmAndNextBtn.textContent = "Confirm Column & Draw Next";
        }

        confirmAndNextBtn.disabled = !lastAutoProcessedData || allColumnsConfirmed;
        downloadResultsBtn.disabled = !(processedColumnsData.length > 0 && allColumnsConfirmed && processedColumnsData.length === config.numColumns);

        const disableConfig = processedColumnsData.length > 0 || (currentLogicalColumnIndex > 0 && lastAutoProcessedData);
        numColumnsConfigEl.disabled = disableConfig;
        numRowsConfigEl.disabled = disableConfig;
        confidenceConfigEl.disabled = disableConfig;

        if (!originalImage) { 
            confirmAndNextBtn.disabled = true;
            downloadResultsBtn.disabled = true;
            numColumnsConfigEl.disabled = false;
            numRowsConfigEl.disabled = false;
            confidenceConfigEl.disabled = false;
            canvas.style.cursor = 'default';
        } else if (allColumnsConfirmed) {
            canvas.style.cursor = 'default';
        } else { 
             canvas.style.cursor = 'crosshair'; 
        }
    }

    // --- Main Redraw Function ---
    function redrawCanvasAndAnnotations() {
        if (!originalImage) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            return;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(originalImage, 0, 0, canvas.width, canvas.height);

        processedColumnsData.forEach(colEntry => {
            if (!colEntry) return;
            ctx.strokeStyle = 'green';
            ctx.lineWidth = 3; 
            ctx.strokeRect(colEntry.rect.x, colEntry.rect.y, colEntry.rect.width, colEntry.rect.height);
            drawBubblesForColumn(colEntry.rect, colEntry.data);
        });

        if (lastAutoProcessedData && lastAutoProcessedData.rect) {
            ctx.strokeStyle = 'blue';
            ctx.lineWidth = 2;
            ctx.strokeRect(lastAutoProcessedData.rect.x, lastAutoProcessedData.rect.y, lastAutoProcessedData.rect.width, lastAutoProcessedData.rect.height);
            drawBubblesForColumn(lastAutoProcessedData.rect, lastAutoProcessedData.data);
        }
        
        if (isDrawing && currentSelectionRect) {
             ctx.strokeStyle = 'red';
             ctx.lineWidth = 2;
             ctx.strokeRect(currentSelectionRect.x, currentSelectionRect.y, currentSelectionRect.width, currentSelectionRect.height);
        }
    }

    function drawBubblesForColumn(columnCanvasRect, columnBackendData) {
        if (!columnBackendData || columnBackendData.length === 0) return;

        columnBackendData.forEach(rowBubblesArray => {
            rowBubblesArray.forEach(bubble => {
                if (bubble.box_in_column) {
                    const b_meta = bubble.box_in_column;
                    const bubbleRectScaleX = columnCanvasRect.width / b_meta.crop_origin_w;
                    const bubbleRectScaleY = columnCanvasRect.height / b_meta.crop_origin_h;

                    const canvasBubbleX = columnCanvasRect.x + (b_meta.x * bubbleRectScaleX);
                    const canvasBubbleY = columnCanvasRect.y + (b_meta.y * bubbleRectScaleY);
                    const canvasBubbleW = b_meta.w * bubbleRectScaleX;
                    const canvasBubbleH = b_meta.h * bubbleRectScaleY;

                    ctx.strokeStyle = 'magenta';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(canvasBubbleX, canvasBubbleY, canvasBubbleW, canvasBubbleH);
                }
            });
        });
    }
    
    // --- Event Listeners ---
    confidenceConfigEl.addEventListener('input', () => {
        confidenceValueEl.textContent = parseFloat(confidenceConfigEl.value).toFixed(2);
    });
    
    // --- File Handling (Common Function) ---
    function handleFile(file) {
        console.log("handleFile called with:", file); // DEBUG
        if (!file || !file.type.startsWith('image/')) {
            console.log("handleFile: Invalid file or no file."); // DEBUG
            updateStatus("Invalid file type. Please upload an image.", "error");
            uploadedFileObject = null;
            return;
        }

        uploadedFileObject = file; 

        const lastDotIndex = file.name.lastIndexOf('.');
        if (lastDotIndex > 0) { originalImageFilename = file.name.substring(0, lastDotIndex) + ".txt"; }
        else if (lastDotIndex === -1 && file.name.length > 0) { originalImageFilename = file.name + ".txt"; }
        else { originalImageFilename = "omr_results.txt"; }

        const reader = new FileReader();
        reader.onload = (e) => {
            originalImage = new Image();
            originalImage.onload = () => {
                // Use the ID for the canvas panel
                const panelStyle = getComputedStyle(canvasPanelEl);
                const panelPaddingX = parseFloat(panelStyle.paddingLeft) + parseFloat(panelStyle.paddingRight);
                const panelPaddingY = parseFloat(panelStyle.paddingTop) + parseFloat(panelStyle.paddingBottom);
                const maxCanvasWidth = canvasPanelEl.clientWidth - panelPaddingX;
                const maxCanvasHeight = (window.innerHeight * 0.9) - panelPaddingY;
                let targetWidth = originalImage.width, targetHeight = originalImage.height;
                const aspectRatio = originalImage.width / originalImage.height;
                if (targetHeight > maxCanvasHeight) { targetHeight = maxCanvasHeight; targetWidth = targetHeight * aspectRatio; }
                if (targetWidth > maxCanvasWidth) { targetWidth = maxCanvasWidth; targetHeight = targetWidth / aspectRatio; }
                canvas.width = targetWidth; canvas.height = targetHeight;
                canvasScaleX = canvas.width / originalImage.width;
                canvasScaleY = canvas.height / originalImage.height;
                processedColumnsData = [];
                currentLogicalColumnIndex = 0;
                currentSelectionRect = null;
                lastAutoProcessedData = null;
                isDrawing = false;
                redrawCanvasAndAnnotations();
                updateStatus(`2. Set configuration if needed. Then, draw Column ${currentLogicalColumnIndex + 1}.`, "info");
                updateColumnCounter();
                updateButtonStates();
            };
            originalImage.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    // --- Image Upload (Click) ---
    imageUpload.addEventListener('change', (event) => {
        if (event.target.files && event.target.files[0]) {
            handleFile(event.target.files[0]);
        } else {
            uploadedFileObject = null; 
        }
    });

    // --- Drag and Drop Area ---
    dropArea.addEventListener('click', () => {
        imageUpload.click(); 
    });

    function preventDefaultsAndStopPropagation(e) { 
        e.preventDefault();
        e.stopPropagation();
    }

    dropArea.addEventListener('dragenter', (e) => {
        preventDefaultsAndStopPropagation(e);
        dropArea.classList.add('bg-gray-100', 'dark:bg-gray-700'); 
    }, false);

    dropArea.addEventListener('dragover', (e) => {
        preventDefaultsAndStopPropagation(e); 
        dropArea.classList.add('bg-gray-100', 'dark:bg-gray-700'); 
    }, false);

    dropArea.addEventListener('dragleave', (e) => {
        preventDefaultsAndStopPropagation(e);
        dropArea.classList.remove('bg-gray-100', 'dark:bg-gray-700');
    }, false);

    dropArea.addEventListener('drop', (e) => {
        preventDefaultsAndStopPropagation(e);
        dropArea.classList.remove('bg-gray-100', 'dark:bg-gray-700'); 

        console.log("Drop event fired!"); // DEBUG
        const dt = e.dataTransfer;
        const files = dt.files;
        console.log("Files from drop:", files); // DEBUG
        if (files && files[0]) {
            console.log("Handling dropped file:", files[0].name); // DEBUG
            handleFile(files[0]);
        } else {
            console.log("No files found in drop event."); // DEBUG
            uploadedFileObject = null; 
        }
    }, false);


    // --- Canvas Drawing and Auto-Processing ---
    canvas.addEventListener('mousedown', (e) => {
        const config = getConfig();
        if (!originalImage || isDrawing || currentLogicalColumnIndex >= config.numColumns) {
            return; 
        }

        if (lastAutoProcessedData) {
            lastAutoProcessedData = null; 
            currentSelectionRect = null; 
            updateStatus(`Previous drawing for Column ${currentLogicalColumnIndex + 1} cleared. Redraw it.`, "info");
            redrawCanvasAndAnnotations(); 
        }
        
        isDrawing = true;
        confirmAndNextBtn.disabled = true;

        const canvasBoundingRect = canvas.getBoundingClientRect();
        selectionStartX = e.clientX - canvasBoundingRect.left;
        selectionStartY = e.clientY - canvasBoundingRect.top;
        currentSelectionRect = { x: selectionStartX, y: selectionStartY, width: 0, height: 0 };
    });

    canvas.addEventListener('mousemove', (e) => {
        if (!isDrawing || !currentSelectionRect) return;
        const canvasBoundingRect = canvas.getBoundingClientRect();
        const currentX = e.clientX - canvasBoundingRect.left;
        const currentY = e.clientY - canvasBoundingRect.top;
        currentSelectionRect.width = currentX - selectionStartX;
        currentSelectionRect.height = currentY - selectionStartY;
        redrawCanvasAndAnnotations(); 
    });

    canvas.addEventListener('mouseup', async () => { 
        if (!isDrawing || !currentSelectionRect) return; 
        isDrawing = false; 
        
        if (currentSelectionRect.width < 0) { 
            currentSelectionRect.x += currentSelectionRect.width;
            currentSelectionRect.width *= -1;
        }
        if (currentSelectionRect.height < 0) { 
            currentSelectionRect.y += currentSelectionRect.height;
            currentSelectionRect.height *= -1;
        }

        if (currentSelectionRect.width < 5 || currentSelectionRect.height < 5) { 
            currentSelectionRect = null;
            redrawCanvasAndAnnotations();
            updateStatus(`Rectangle too small. Redraw Column ${currentLogicalColumnIndex + 1}.`, "error");
            updateButtonStates();
            return;
        }

        if (!uploadedFileObject) { 
            updateStatus("Error: No image file is currently loaded for processing.", "error");
            currentSelectionRect = null; 
            lastAutoProcessedData = null;
            redrawCanvasAndAnnotations();
            updateButtonStates();
            return;
        }

        updateStatus(`Processing drawn Column ${currentLogicalColumnIndex + 1}...`, "info");
        const config = getConfig();
        const rectForBackend = {
            x: currentSelectionRect.x / canvasScaleX,
            y: currentSelectionRect.y / canvasScaleY,
            width: currentSelectionRect.width / canvasScaleX,
            height: currentSelectionRect.height / canvasScaleY
        };

        const formData = new FormData(); 
        formData.append('image', uploadedFileObject); 
        formData.append('rect_x', rectForBackend.x);
        formData.append('rect_y', rectForBackend.y);
        formData.append('rect_width', rectForBackend.width);
        formData.append('rect_height', rectForBackend.height);
        formData.append('num_rows', config.numRowsPerColumn);
        formData.append('confidence_score', config.minConfidenceScore);

        try { 
            const response = await fetch('/process_column', { method: 'POST', body: formData });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: "Server error processing column" }));
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }
            const result = await response.json();
            lastAutoProcessedData = {
                rect: { ...currentSelectionRect },
                data: result.column_data,
                logicalIndex: currentLogicalColumnIndex
            };
            currentSelectionRect = null;
            redrawCanvasAndAnnotations();
            
            const isLast = currentLogicalColumnIndex === config.numColumns - 1;
            const buttonText = isLast ? "Confirm Last Column" : "Confirm & Draw Next";
            updateStatus(`Column ${currentLogicalColumnIndex + 1} analyzed. Click '${buttonText}' or redraw by clicking on canvas.`, "success");
        } catch (error) { 
            console.error('Error auto-processing column:', error);
            updateStatus(`Error analyzing Column ${currentLogicalColumnIndex + 1}: ${error.message}. Please redraw.`, "error");
            currentSelectionRect = null;
            lastAutoProcessedData = null;
            redrawCanvasAndAnnotations();
        }
        updateButtonStates();
    });

    // --- Confirm Column and Proceed ---
    confirmAndNextBtn.addEventListener('click', () => { 
        if (!lastAutoProcessedData) return;
        processedColumnsData[lastAutoProcessedData.logicalIndex] = { ...lastAutoProcessedData };
        currentLogicalColumnIndex++;
        lastAutoProcessedData = null;
        currentSelectionRect = null;
        redrawCanvasAndAnnotations();
        updateColumnCounter();
        const config = getConfig();
        if (currentLogicalColumnIndex < config.numColumns) {
            updateStatus(`Column ${processedColumnsData.length} confirmed. Draw Column ${currentLogicalColumnIndex + 1}.`, "info");
        } else {
            updateStatus(`All ${config.numColumns} columns confirmed! Ready to download.`, "success");
        }
        updateButtonStates();
    });

    // --- Download Results ---
    downloadResultsBtn.addEventListener('click', () => { 
        let txtContent = "";
        let questionNumber = 1;
        const config = getConfig();
        for (let colIdx = 0; colIdx < config.numColumns; colIdx++) {
            const columnEntry = processedColumnsData[colIdx]; // This might be undefined if a column was skipped
            for (let rowIdx = 0; rowIdx < config.numRowsPerColumn; rowIdx++) {
                let detectedValue = "-"; 
                if (columnEntry && columnEntry.data && columnEntry.data[rowIdx]) {
                    const rowDataArray = columnEntry.data[rowIdx];
                    if (rowDataArray.length > 0) {
                        detectedValue = rowDataArray[0].label.toString(); 
                    }
                }
                txtContent += `${questionNumber}\t${detectedValue}\n`;
                questionNumber++;
            }
        }
        const element = document.createElement('a');
        element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(txtContent));
        element.setAttribute('download', originalImageFilename);
        element.style.display = 'none';
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
        updateStatus(`Results downloaded as ${originalImageFilename}.`, "success");
    });

    // --- Handle window resize ---
    window.addEventListener('resize', () => {
        if (originalImage && canvasPanelEl) { // Added canvasPanelEl check
            const panelStyle = getComputedStyle(canvasPanelEl);
            const panelPaddingX = parseFloat(panelStyle.paddingLeft) + parseFloat(panelStyle.paddingRight);
            const panelPaddingY = parseFloat(panelStyle.paddingTop) + parseFloat(panelStyle.paddingBottom);
            const maxCanvasWidth = canvasPanelEl.clientWidth - panelPaddingX;
            const maxCanvasHeight = (window.innerHeight * 0.9) - panelPaddingY;
            let targetWidth = originalImage.width, targetHeight = originalImage.height;
            const aspectRatio = originalImage.width / originalImage.height;
            if (targetHeight > maxCanvasHeight) { targetHeight = maxCanvasHeight; targetWidth = targetHeight * aspectRatio; }
            if (targetWidth > maxCanvasWidth) { targetWidth = maxCanvasWidth; targetHeight = targetWidth / aspectRatio; }
            
            // Only update if dimensions actually change to avoid unnecessary redraws
            if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
                canvas.width = targetWidth; canvas.height = targetHeight;
                canvasScaleX = canvas.width / originalImage.width;
                canvasScaleY = canvas.height / originalImage.height;
                redrawCanvasAndAnnotations();
            }
        }
    });

    // --- Initial Setup ---
    confidenceValueEl.textContent = parseFloat(confidenceConfigEl.value).toFixed(2);
    updateStatus("1. Drag & drop an image or click to select.", "info");
    updateColumnCounter();
    updateButtonStates();
});
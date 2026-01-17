  // ================= CONFIGURATION & STATE =================
  const state = { 
    points: [], 
    scale: 1, 
    x: 0, 
    y: 0, 
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    startX: 0,
    startY: 0,
    isBoxSelecting: false,
    boxStartX: 0,
    boxStartY: 0,
    // Touch support
    lastTouchDistance: 0,
    lastTouchCenter: { x: 0, y: 0 },
    isTouching: false
  };
  let currentMode = 'data'; // data, graph, media
  let graphSubMode = 'full'; // full, select
  let selectedPoints = []; // Stores point objects for comparison
  let chartInstance = null; // Stores the Chart.js instance

  // Professional color palette (similar to your reference image)
  const PALETTE = [
    '#0072B2',  // Blue (MAIN)
    '#D55E00',  // Orange-Red (R102)
    '#009E73',  // Green (R116)
    '#F0E442',  // Yellow (R103)
    '#56B4E9',  // Sky Blue (R202)
    '#CC79A7',  // Pink (R228)
    '#E69F00',  // Orange (R103 alt)
    '#882255',  // Purple (R201)
    '#44AA99',  // Teal (R203)
    '#117733',  // Dark Green (R214)
    '#999933'   // Olive (R128)
  ];

  const els = {
    viewport: document.getElementById('viewport'),
    container: document.getElementById('map-container'),
    img: document.getElementById('floorImage'),
    sheet: document.getElementById('bottomSheet'),
    header: document.getElementById('header'),
    loading: document.getElementById('loadingStatus'),
    // Buttons
    btnData: document.getElementById('btnDataMode'),
    btnGraph: document.getElementById('btnGraphMode'),
    btnMedia: document.getElementById('btnMediaMode'),
    btnComponents: document.getElementById('btnComponentsMode'),
    // Graph Controls
    graphControls: document.getElementById('graphControls'),
    btnFull: document.getElementById('btnFullData'),
    btnSelect: document.getElementById('btnSelectPoints'),
    btnClear: document.getElementById('btnClearSelection'),
    // Range Selector
    rangeSelector: document.getElementById('rangeSelector'),
    rangeFrom: document.getElementById('rangeFrom'),
    rangeTo: document.getElementById('rangeTo'),
    applyRange: document.getElementById('applyRange')
  };

  // ================= INITIALIZATION =================
  async function init() {
    // FIRST THING: Check if user has seen welcome and make decision
    const hasSeenWelcome = localStorage.getItem('paldiblind_welcome_seen');
    
    // Show welcome immediately if not seen before
    const welcomeOverlay = document.getElementById('welcomeOverlay');
    const helpBtn = document.getElementById('helpBtn');
    
    if(hasSeenWelcome !== 'true') {
      // First time users: Show welcome immediately
      welcomeOverlay.classList.remove('hidden');
      welcomeOverlay.style.display = 'flex';
      helpBtn.classList.add('hidden');
    } else {
      // Returning users: Just ensure help button is visible
      helpBtn.classList.remove('hidden');
    }
    
    setupEventListeners();
    
    // Setup welcome dialog navigation - show/hide pages instead of slide
    let welcomePage = 1;
    
    // Show page 1 by default
    document.querySelectorAll('.welcome-page').forEach((page, index) => {
      if(index === 0) page.classList.add('active');
      else page.classList.remove('active');
    });
    
    document.getElementById('nextBtn').onclick = () => {
      welcomePage = 2;
      document.querySelectorAll('.welcome-page').forEach((page, index) => {
        if(index === 1) page.classList.add('active');
        else page.classList.remove('active');
      });
    };
    
    document.getElementById('doneBtn').onclick = () => {
      closeWelcome();
    };
    
    function closeWelcome() {
      welcomeOverlay.classList.add('hidden');
      helpBtn.classList.remove('hidden');
      localStorage.setItem('paldiblind_welcome_seen', 'true');
    }
    
    // Help button reopens welcome
    helpBtn.onclick = () => {
      welcomeOverlay.classList.remove('hidden');
      welcomeOverlay.style.display = 'flex';
      // Reset to page 1
      document.querySelectorAll('.welcome-page').forEach((page, index) => {
        if(index === 0) page.classList.add('active');
        else page.classList.remove('active');
      });
      welcomePage = 1;
    };
    
    try {
      const res = await fetch('floor_full_data.json');
      const data = await res.json();
      state.points = data.points || [];
      
      // Init Viewport - always fit on mobile, use saved state on desktop
      const isMobile = window.innerWidth <= 768;
      
      if (isMobile) {
        // On mobile, always fit the map to screen
        fitMap();
      } else {
        // On desktop, use saved viewport state if available
        if (data.viewportState) {
          state.scale = data.viewportState.scale || 1;
          state.x = data.viewportState.x || 0;
          state.y = data.viewportState.y || 0;
          updateTransform();
        } else {
          fitMap();
        }
      }
      
      // Render points first
      renderPoints();
      
      // Hide loading indicator
      els.loading.style.display = 'none';
      
    } catch(e) { 
      els.loading.innerHTML = "Error loading floor_full_data.json"; 
    }
  }

  // ================= RENDER LOGIC =================
  function renderPoints() {
    document.querySelectorAll('.point').forEach(p => p.remove());
    
    // Filter points based on mode
    const toShow = state.points.filter(p => {
        if(currentMode === 'media') return p.type === 'media';
        return (p.type === 'data' || p.type === 'command');
    });
    
    toShow.forEach(p => {
      const el = document.createElement('div');
      el.className = 'point';
      el.dataset.id = p.id || p.row;
      el.style.left = p.x + 'px';
      el.style.top = p.y + 'px';
      
      if(p.type === 'command') { 
        el.classList.add('command-point'); 
        el.textContent = '💬'; 
      }
      else if(p.type === 'media') { 
        el.classList.add('media-point'); 
        el.textContent = p.mediaType?.includes('video') ? '🎥' : '📷'; 
      }
      else { 
          if(currentMode === 'graph') {
             el.classList.add('graph-point');
             el.textContent = '📈'; 
          } else {
             el.textContent = p.row; 
          }
      }
      
      el.onclick = (e) => { e.stopPropagation(); handlePointClick(p, el); };
      els.container.appendChild(el);
    });
  }

  // ================= INTERACTION HANDLERS =================
  function setMode(mode) {
    // If switching to graph mode, show the modal first
    if(mode === 'graph' && currentMode !== 'graph') {
      showGraphModeModal();
      return;
    }
    
    // Handle components mode - overlay without hiding viewport
    if(mode === 'components') {
      currentMode = mode;
      els.btnData.classList.toggle('active', false);
      els.btnGraph.classList.toggle('active', false);
      els.btnMedia.classList.toggle('active', false);
      els.btnComponents.classList.toggle('active', true);
      els.header.className = `header ${mode}-mode`;
      
      // Show components overlay WITHOUT hiding viewport
      document.getElementById('componentsFullpage').classList.add('visible');
      document.getElementById('sideCommentBox').classList.remove('visible');
      closeSheet();
      return;
    }
    
    // Hide components fullpage for other modes
    document.getElementById('componentsFullpage').classList.remove('visible');
    
    currentMode = mode;
    
    // Update UI Classes
    els.btnData.classList.toggle('active', mode === 'data');
    els.btnGraph.classList.toggle('active', mode === 'graph');
    els.btnMedia.classList.toggle('active', mode === 'media');
    els.btnComponents.classList.toggle('active', mode === 'components');
    
    els.header.className = `header ${mode}-mode`;
    
    // Reset selections when changing modes
    selectedPoints = [];
    document.querySelectorAll('.point').forEach(p => p.classList.remove('active', 'multi-active'));
    closeSheet();
    
    renderPoints();
  }

  function showGraphModeModal() {
    const modal = document.getElementById('graphModeModal');
    modal.classList.add('visible');
  }

  function hideGraphModeModal() {
    const modal = document.getElementById('graphModeModal');
    modal.classList.remove('visible');
  }

  function selectGraphMode(subMode) {
    hideGraphModeModal();
    currentMode = 'graph';
    
    // Update mode buttons
    els.btnData.classList.remove('active');
    els.btnGraph.classList.add('active');
    els.btnMedia.classList.remove('active');
    els.header.className = 'header graph-mode';
    
    // Set the graph sub-mode
    graphSubMode = subMode;
    els.btnFull.classList.toggle('active', subMode === 'full');
    els.btnSelect.classList.toggle('active', subMode === 'select');
    
    if(subMode === 'full') {
      els.rangeSelector.classList.remove('visible');
      els.btnClear.style.display = 'none';
      renderPoints();
      renderFullDataGraph();
    } else {
      els.rangeSelector.classList.add('visible');
      els.btnClear.style.display = 'inline-block';
      renderPoints();
    }
  }

  function setGraphSubMode(subMode) {
    graphSubMode = subMode;
    els.btnFull.classList.toggle('active', subMode === 'full');
    els.btnSelect.classList.toggle('active', subMode === 'select');
    
    if(subMode === 'full') {
        // Full data mode - show all data
        selectedPoints = [];
        document.querySelectorAll('.point').forEach(p => p.classList.remove('multi-active'));
        els.btnClear.style.display = 'none';
        els.rangeSelector.classList.remove('visible');
        document.getElementById('boxSelectHint').style.display = 'none';
        renderFullDataGraph();
    } else {
        // Select mode - user picks points
        closeSheet();
        els.btnClear.style.display = 'inline-block';
        els.rangeSelector.classList.add('visible');
        document.getElementById('boxSelectHint').style.display = 'flex';
    }
  }

  function handlePointClick(data, element) {
    if (currentMode === 'graph') {
        handleGraphClick(data, element);
    } else {
        // Standard Behavior for Data/Media
        document.querySelectorAll('.point.active').forEach(p => p.classList.remove('active'));
        element.classList.add('active');
        openSheet(data);
    }
  }

  function handleGraphClick(data, element) {
    if (graphSubMode === 'full') {
        // In full data mode, clicking can also select for detailed view
        // But we keep the full graph open - just highlight the clicked point
        document.querySelectorAll('.point').forEach(p => p.classList.remove('active'));
        element.classList.add('active');
        
        // Show comment if exists
        handleCommentBox(data);
        
    } else {
        // Select mode - multi-select for comparison
        const index = selectedPoints.findIndex(p => p.row === data.row);
        
        if (index > -1) {
            // Deselect
            selectedPoints.splice(index, 1);
            element.classList.remove('multi-active');
        } else {
            // Select (No limit now - user can select as many as they want)
            selectedPoints.push(data);
            element.classList.add('multi-active');
        }
        
        // Update comment box
        if (selectedPoints.length > 0) {
            handleCommentBox(selectedPoints[selectedPoints.length - 1]);
        } else {
            document.getElementById('sideCommentBox').classList.remove('visible');
        }
        
        // If we have points, show chart. If empty, close.
        if (selectedPoints.length > 0) {
            renderGraphSheet();
        } else {
            closeSheet();
        }
    }
  }

  // ================= SHEET & GRAPH RENDERING =================
  function openSheet(data) {
    // Reset Classes
    els.sheet.classList.remove('media-viewer', 'graph-viewer');
    const container = document.getElementById('sheetContent');
    container.innerHTML = '';
    
    // Handle Comment Box (Side)
    handleCommentBox(data);
    
    // Add class to comment box when sheet is open (for mobile)
    const commentBox = document.getElementById('sideCommentBox');
    if(commentBox.classList.contains('visible')) {
      commentBox.classList.add('with-sheet');
    }

    if (currentMode === 'media' && data.type === 'media') {
      els.sheet.classList.add('media-viewer');
      document.getElementById('sheetId').textContent = '📷';
      document.getElementById('sheetName').textContent = data.label || 'Media';
      const wrap = document.createElement('div');
      wrap.style.cssText = "width:100%; display:flex; justify-content:center; flex-direction:column; align-items:center;";
      if(data.mediaType?.includes('video')) {
        wrap.innerHTML = `<video src="${data.mediaData}" controls style="max-width:100%; max-height:70vh;"></video>`;
      } else {
        wrap.innerHTML = `<img src="${data.mediaData}" style="max-width:100%; max-height:70vh; object-fit:contain;">`;
      }
      container.appendChild(wrap);
    } 
    else {
      // Standard Data View
      document.getElementById('sheetId').textContent = '#' + data.row;
      document.getElementById('sheetName').textContent = data.plate || 'Info';
      
      if(data.signals) {
        Object.entries(data.signals).forEach(([k, v], i) => {
          const color = v > -50 ? 'val-green' : (v > -80 ? 'val-yellow' : 'val-red');
          container.innerHTML += `
            <div class="signal-box ${i===0?'main-signal':''}">
              <div class="signal-name">${k}</div>
              <div class="signal-value ${color}">${v}</div>
            </div>`;
        });
      }
    }
    els.sheet.classList.add('open');
  }

  function renderFullDataGraph() {
    // Show graph with all data points
    els.sheet.classList.add('graph-viewer', 'open');
    const container = document.getElementById('sheetContent');
    container.innerHTML = '';

    // Header Info
    document.getElementById('sheetId').textContent = '📊';
    document.getElementById('sheetName').textContent = 'Full Network Data - All Plates';

    // Create Canvas
    const graphWrap = document.createElement('div');
    graphWrap.className = 'graph-container';
    const canvas = document.createElement('canvas');
    graphWrap.appendChild(canvas);
    container.appendChild(graphWrap);

    // Get all data points (filter only data type)
    const dataPoints = state.points.filter(p => p.type === 'data' && p.signals);
    
    // Sort by plate/row number
    dataPoints.sort((a, b) => {
      const numA = parseInt(a.row) || 0;
      const numB = parseInt(b.row) || 0;
      return numA - numB;
    });

    // Get all unique router names
    let allRouters = new Set();
    dataPoints.forEach(p => {
        if(p.signals) Object.keys(p.signals).forEach(k => allRouters.add(k));
    });
    
    // Sort routers: MAIN first, then alphabetically
    const routerNames = Array.from(allRouters).sort((a, b) => {
        if(a === 'MAIN') return -1;
        if(b === 'MAIN') return 1;
        return a.localeCompare(b);
    });

    // X-axis: Plate numbers
    const labels = dataPoints.map(p => p.row);

    // Build datasets for each router
    const datasets = routerNames.map((routerName, index) => {
        const dataValues = dataPoints.map(p => {
            return p.signals && p.signals[routerName] !== undefined ? p.signals[routerName] : null;
        });

        return {
            label: routerName,
            data: dataValues,
            borderColor: PALETTE[index % PALETTE.length],
            backgroundColor: 'transparent',
            borderWidth: 2.5,
            tension: 0.4, // Smooth curves
            pointRadius: 0, // No points visible by default
            pointHoverRadius: 5,
            pointBackgroundColor: PALETTE[index % PALETTE.length],
            fill: false
        };
    });

    // Render Chart
    if(chartInstance) chartInstance.destroy();
    
    chartInstance = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: { 
                    display: true, 
                    position: 'right',
                    labels: {
                        usePointStyle: true,
                        padding: 15,
                        font: {
                            size: 11,
                            weight: 'bold'
                        }
                    }
                },
                title: {
                    display: true,
                    text: 'Signal Strength Across All Plates (Smoothed)',
                    font: {
                        size: 16,
                        weight: 'bold'
                    },
                    padding: 20
                },
                tooltip: {
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    titleColor: '#1f2937',
                    bodyColor: '#1f2937',
                    borderColor: '#e5e7eb',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: true,
                    callbacks: {
                        label: function(context) {
                            return context.dataset.label + ': ' + context.parsed.y + ' dBm';
                        }
                    }
                }
            },
            scales: {
                y: {
                    title: { 
                        display: true, 
                        text: 'Value',
                        font: {
                            size: 13,
                            weight: 'bold'
                        }
                    },
                    grid: { 
                        color: '#e5e7eb',
                        drawBorder: false
                    },
                    ticks: {
                        font: {
                            size: 11
                        }
                    },
                    min: -102,
                    max: -20
                },
                x: {
                    title: {
                        display: true,
                        text: 'Plate Number',
                        font: {
                            size: 13,
                            weight: 'bold'
                        }
                    },
                    grid: { 
                        display: false 
                    },
                    ticks: {
                        font: {
                            size: 10
                        }
                    }
                }
            }
        }
    });
  }

  function renderGraphSheet() {
    els.sheet.classList.add('graph-viewer', 'open');
    const container = document.getElementById('sheetContent');
    container.innerHTML = '';

    // Header Info
    document.getElementById('sheetId').textContent = selectedPoints.length > 1 ? '📊' : '📈';
    document.getElementById('sheetName').textContent = selectedPoints.length > 1 
      ? `Comparing ${selectedPoints.length} Points` 
      : (selectedPoints[0].plate || 'Signal Analysis');

    // Create Canvas
    const graphWrap = document.createElement('div');
    graphWrap.className = 'graph-container';
    const canvas = document.createElement('canvas');
    graphWrap.appendChild(canvas);
    container.appendChild(graphWrap);

    // Sort selected points by row number
    const sortedPoints = [...selectedPoints].sort((a, b) => {
      const numA = parseInt(a.row) || 0;
      const numB = parseInt(b.row) || 0;
      return numA - numB;
    });

    // X-axis: Plate numbers (row numbers)
    const labels = sortedPoints.map(p => p.row);

    // Get all unique router names from selected points
    let allRouters = new Set();
    sortedPoints.forEach(p => {
        if(p.signals) Object.keys(p.signals).forEach(k => allRouters.add(k));
    });
    
    // Sort routers: MAIN first, then alphabetically
    const routerNames = Array.from(allRouters).sort((a,b) => {
        if(a === 'MAIN') return -1;
        if(b === 'MAIN') return 1;
        return a.localeCompare(b);
    });

    // Build Datasets - one line per router
    const datasets = routerNames.map((routerName, index) => {
        const dataValues = sortedPoints.map(p => {
            return p.signals && p.signals[routerName] !== undefined ? p.signals[routerName] : null;
        });

        return {
            label: routerName,
            data: dataValues,
            borderColor: PALETTE[index % PALETTE.length],
            backgroundColor: 'transparent',
            borderWidth: 3,
            tension: 0.4,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: PALETTE[index % PALETTE.length],
            fill: false
        };
    });

    // 3. Render Chart
    if(chartInstance) chartInstance.destroy();
    
    chartInstance = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            onClick: (event, elements) => {
                // When clicking on graph, add that point to selection if in select mode
                if(graphSubMode === 'select' && elements.length > 0) {
                    const clickedIndex = elements[0].index;
                    const clickedPlateNum = labels[clickedIndex];
                    
                    // Find the point in state.points
                    const point = state.points.find(p => p.row == clickedPlateNum && p.type === 'data');
                    if(point) {
                        // Check if already selected
                        const alreadySelected = selectedPoints.findIndex(p => p.row === point.row);
                        
                        if(alreadySelected === -1) {
                            // Add to selection
                            selectedPoints.push(point);
                            const pointEl = document.querySelector(`.point[data-id="${point.id || point.row}"]`);
                            if(pointEl) pointEl.classList.add('multi-active');
                            renderGraphSheet(); // Refresh graph
                        }
                    }
                }
            },
            plugins: {
                legend: { 
                    display: true, 
                    position: 'top',
                    labels: {
                        usePointStyle: true,
                        padding: 15,
                        font: {
                            size: 12,
                            weight: 'bold'
                        }
                    }
                },
                title: {
                    display: true,
                    text: `Selected Plates (${sortedPoints.length} points)`,
                    font: {
                        size: 14,
                        weight: 'bold'
                    },
                    padding: 15
                },
                tooltip: {
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    titleColor: '#1f2937',
                    bodyColor: '#1f2937',
                    borderColor: '#e5e7eb',
                    borderWidth: 1,
                    padding: 12,
                    callbacks: {
                        title: function(context) {
                            return 'Plate #' + context[0].label;
                        },
                        label: function(context) {
                            return context.dataset.label + ': ' + context.parsed.y + ' dBm';
                        }
                    }
                }
            },
            scales: {
                y: {
                    title: { 
                        display: true, 
                        text: 'Signal Strength (dBm)',
                        font: {
                            size: 13,
                            weight: 'bold'
                        }
                    },
                    grid: { 
                        color: '#e5e7eb' 
                    },
                    ticks: {
                        font: {
                            size: 11
                        }
                    },
                    min: -102,
                    max: -20
                },
                x: {
                    title: {
                        display: true,
                        text: 'Plate Number',
                        font: {
                            size: 13,
                            weight: 'bold'
                        }
                    },
                    grid: { 
                        display: false 
                    },
                    ticks: {
                        font: {
                            size: 11
                        }
                    }
                }
            }
        }
    });
  }

  function handleCommentBox(data) {
    const box = document.getElementById('sideCommentBox');
    const commentPath = document.getElementById('commentShapePath');
    const commentText = document.getElementById('commentTextContent');
    const commentSvg = document.querySelector('.comment-svg-bg');
    
    // Check if mobile device
    const isMobile = window.innerWidth <= 768;
    
    if(data.comment) {
      // Set comment text
      let commentContent;
      if (data.commentImage) {
        commentContent = `
          <div style="display:flex; flex-direction:row; gap:15px; align-items:flex-start;">
            <img src="${data.commentImage}" style="width:200px; height:auto; border-radius:8px; object-fit:contain; flex-shrink:0;">
            <div style="overflow-wrap: break-word; word-wrap: break-word; word-break: break-word; hyphens: auto; flex:1;">
              ${data.comment}
            </div>
          </div>`;
      } else {
        commentContent = `<div style="overflow-wrap: break-word; word-wrap: break-word; word-break: break-word; hyphens: auto;">${data.comment}</div>`;
      }
      
      commentText.innerHTML = commentContent;
      
      // Use commentStyle if available (new format)
      if (data.commentStyle && data.commentStyle.customPath) {
        commentPath.setAttribute('d', data.commentStyle.customPath.path);
        commentSvg.setAttribute('viewBox', data.commentStyle.customPath.viewBox);
        
        // Apply custom colors
        commentPath.style.fill = data.commentStyle.bgColor || '#fff';
        commentPath.style.stroke = data.commentStyle.borderColor || '#7c3aed';
        commentPath.style.strokeWidth = (data.commentStyle.borderWidth || 3) + 'px';
        
        // Apply text color and sizing
        commentText.style.color = data.commentStyle.textColor || '#5b21b6';
        commentText.style.fontSize = (data.commentStyle.fontSize || 14) + 'px';
        commentText.style.padding = (data.commentStyle.padding || 25) + 'px';
        commentText.style.overflow = 'visible';
        commentText.style.whiteSpace = 'normal';
        
        // Only set width on desktop, let CSS handle mobile
        if (!isMobile) {
          // Adjust comment box width based on image size
          const imageSize = data.commentImage ? 200 : 0;
          const boxWidth = data.commentImage ? Math.max(550, imageSize + 350) : 420;
          box.style.width = boxWidth + 'px';
        } else {
          // Remove inline width on mobile to let CSS take control
          box.style.width = '';
        }
      }
      // Use old format (shapePath) for backwards compatibility
      else if(data.shapePath) {
        commentPath.setAttribute('d', data.shapePath);
        const w = data.shapeWidth || 300;
        const h = data.shapeHeight || 200;
        commentSvg.setAttribute('viewBox', `0 0 ${w} ${h}`);
        
        // Only set width on desktop
        if(!isMobile && data.commentImage) {
          box.style.width = '550px';
        } else if(isMobile) {
          box.style.width = '';
        }
      } 
      // Default rectangle
      else {
        commentPath.setAttribute('d', "M10,10 L290,10 L290,190 L10,190 Z");
        commentSvg.setAttribute('viewBox', `0 0 300 200`);
        
        // Only set width on desktop
        if(!isMobile && data.commentImage) {
          box.style.width = '550px';
        } else if(isMobile) {
          box.style.width = '';
        }
      }
      
      box.classList.add('visible');
      box.style.display = 'flex';
    } else {
      box.classList.remove('visible');
      box.style.display = 'none';
    }
  }

  function closeSheet() {
    els.sheet.classList.remove('open');
    const commentBox = document.getElementById('sideCommentBox');
    commentBox.classList.remove('visible', 'with-sheet');
    commentBox.style.display = 'none';
    if(graphSubMode === 'select') {
        document.querySelectorAll('.point.active').forEach(p => p.classList.remove('active'));
    }
  }

  // ================= COMPONENTS MODE =================
  // ================= EVENT LISTENERS =================
  function setupEventListeners() {
    // Window resize handler - refit map on mobile
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        const isMobile = window.innerWidth <= 768;
        if(isMobile) {
          fitMap();
        }
      }, 250);
    });
    
    // Mode Buttons
    els.btnData.onclick = () => setMode('data');
    els.btnGraph.onclick = () => setMode('graph');
    els.btnMedia.onclick = () => setMode('media');
    els.btnComponents.onclick = () => setMode('components');
    
    // Graph Mode Modal
    document.getElementById('optionFullData').onclick = () => selectGraphMode('full');
    document.getElementById('optionSelectPoints').onclick = () => selectGraphMode('select');
    
    // Graph Sub-mode
    els.btnFull.onclick = () => setGraphSubMode('full');
    els.btnSelect.onclick = () => setGraphSubMode('select');
    els.btnClear.onclick = () => {
        selectedPoints = [];
        document.querySelectorAll('.point').forEach(p => p.classList.remove('multi-active'));
        closeSheet();
    };

    // Range Selection
    els.applyRange.onclick = applyRangeSelection;

    // Zoom/Pan/Box Selection
    els.viewport.addEventListener('mousedown', e => {
      // Check if clicking on a point
      if(e.target.closest('.point')) return;
      
      // Check if clicking on bottom sheet or modal
      if(e.target.closest('.bottom-sheet') || e.target.closest('.graph-mode-modal')) return;
      
      // In graph mode with select sub-mode, allow box selection with Shift key
      if(currentMode === 'graph' && graphSubMode === 'select' && e.shiftKey) {
        startBoxSelection(e);
        return;
      }
      
      // Otherwise, pan the map
      state.isDragging = true;
      state.dragStartX = e.clientX;
      state.dragStartY = e.clientY;
      state.startX = state.x;
      state.startY = state.y;
      els.viewport.classList.add('grabbing');
    });
    
    window.addEventListener('mousemove', e => {
      if(state.isBoxSelecting) {
        updateBoxSelection(e);
        return;
      }
      
      if(!state.isDragging) return;
      
      const dx = e.clientX - state.dragStartX;
      const dy = e.clientY - state.dragStartY;
      state.x = state.startX + dx;
      state.y = state.startY + dy;
      updateTransform();
    });
    
    window.addEventListener('mouseup', e => {
      if(state.isBoxSelecting) {
        finishBoxSelection();
        return;
      }
      
      state.isDragging = false;
      els.viewport.classList.remove('grabbing');
    });
    
    els.viewport.addEventListener('wheel', e => {
      // Only handle wheel events when mouse is actually over the viewport
      const rect = els.viewport.getBoundingClientRect();
      const isOverViewport = e.clientX >= rect.left && e.clientX <= rect.right &&
                             e.clientY >= rect.top && e.clientY <= rect.bottom;
      
      if(!isOverViewport) return;
      
      e.preventDefault();
      
      // Get mouse position relative to viewport
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      // Get mouse position in map coordinates (before zoom)
      const mapX = (mouseX - state.x) / state.scale;
      const mapY = (mouseY - state.y) / state.scale;
      
      // Apply zoom
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = state.scale * delta;
      
      // Adjust position to keep mouse point stable
      state.x = mouseX - mapX * newScale;
      state.y = mouseY - mapY * newScale;
      state.scale = newScale;
      
      updateTransform();
    }, {passive:false});

    // ================= TOUCH EVENTS FOR MOBILE =================
    els.viewport.addEventListener('touchstart', e => {
      if(e.target.closest('.point')) return;
      
      if(e.touches.length === 1) {
        // Single touch - pan
        state.isTouching = true;
        state.dragStartX = e.touches[0].clientX;
        state.dragStartY = e.touches[0].clientY;
        state.startX = state.x;
        state.startY = state.y;
      } else if(e.touches.length === 2) {
        // Two touches - prepare for pinch zoom
        e.preventDefault();
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        
        state.lastTouchDistance = Math.hypot(
          touch2.clientX - touch1.clientX,
          touch2.clientY - touch1.clientY
        );
        
        state.lastTouchCenter = {
          x: (touch1.clientX + touch2.clientX) / 2,
          y: (touch1.clientY + touch2.clientY) / 2
        };
      }
    }, {passive: false});
    
    els.viewport.addEventListener('touchmove', e => {
      if(e.touches.length === 1 && state.isTouching) {
        // Single touch - pan
        e.preventDefault();
        const dx = e.touches[0].clientX - state.dragStartX;
        const dy = e.touches[0].clientY - state.dragStartY;
        state.x = state.startX + dx;
        state.y = state.startY + dy;
        updateTransform();
      } else if(e.touches.length === 2) {
        // Two touches - pinch zoom
        e.preventDefault();
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        
        const currentDistance = Math.hypot(
          touch2.clientX - touch1.clientX,
          touch2.clientY - touch1.clientY
        );
        
        const currentCenter = {
          x: (touch1.clientX + touch2.clientX) / 2,
          y: (touch1.clientY + touch2.clientY) / 2
        };
        
        if(state.lastTouchDistance > 0) {
          const rect = els.viewport.getBoundingClientRect();
          const centerX = currentCenter.x - rect.left;
          const centerY = currentCenter.y - rect.top;
          
          // Calculate zoom point in map coordinates
          const mapX = (centerX - state.x) / state.scale;
          const mapY = (centerY - state.y) / state.scale;
          
          // Apply zoom
          const zoomFactor = currentDistance / state.lastTouchDistance;
          const newScale = state.scale * zoomFactor;
          
          // Clamp scale
          const clampedScale = Math.max(0.1, Math.min(10, newScale));
          
          // Adjust position
          state.x = centerX - mapX * clampedScale;
          state.y = centerY - mapY * clampedScale;
          state.scale = clampedScale;
          
          updateTransform();
        }
        
        state.lastTouchDistance = currentDistance;
        state.lastTouchCenter = currentCenter;
      }
    }, {passive: false});
    
    els.viewport.addEventListener('touchend', e => {
      state.isTouching = false;
      if(e.touches.length < 2) {
        state.lastTouchDistance = 0;
      }
    }, {passive: false});
    
    els.viewport.addEventListener('touchcancel', e => {
      state.isTouching = false;
      state.lastTouchDistance = 0;
    }, {passive: false});

    // Controls
    document.getElementById('btnPlus').onclick = () => { 
      // Zoom towards center
      const rect = els.viewport.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      
      const mapX = (centerX - state.x) / state.scale;
      const mapY = (centerY - state.y) / state.scale;
      
      const newScale = state.scale * 1.2;
      state.x = centerX - mapX * newScale;
      state.y = centerY - mapY * newScale;
      state.scale = newScale;
      
      updateTransform(); 
    };
    
    document.getElementById('btnMinus').onclick = () => { 
      // Zoom towards center
      const rect = els.viewport.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      
      const mapX = (centerX - state.x) / state.scale;
      const mapY = (centerY - state.y) / state.scale;
      
      const newScale = state.scale / 1.2;
      state.x = centerX - mapX * newScale;
      state.y = centerY - mapY * newScale;
      state.scale = newScale;
      
      updateTransform(); 
    };
    document.getElementById('btnFit').onclick = fitMap;
    document.getElementById('btnReset').onclick = fitMap;
    document.getElementById('closeSheet').onclick = closeSheet;
  }

  function applyRangeSelection() {
    const from = parseInt(els.rangeFrom.value) || 1;
    const to = parseInt(els.rangeTo.value) || 1;
    
    if(from > to) {
        alert('Start value must be less than or equal to end value');
        return;
    }

    // Clear current selection
    selectedPoints = [];
    document.querySelectorAll('.point').forEach(p => p.classList.remove('multi-active'));

    // Get all data points
    const dataPoints = state.points.filter(p => p.type === 'data' && p.signals);
    
    // Select points in range
    dataPoints.forEach(p => {
        const rowNum = parseInt(p.row) || 0;
        if(rowNum >= from && rowNum <= to) {
            selectedPoints.push(p);
            // Highlight the point on map
            const pointEl = document.querySelector(`.point[data-id="${p.id || p.row}"]`);
            if(pointEl) {
                pointEl.classList.add('multi-active');
            }
        }
    });

    if(selectedPoints.length === 0) {
        alert('No points found in this range');
        return;
    }

    // Show the graph
    renderGraphSheet();
  }

  // ================= BOX SELECTION FUNCTIONS =================
  function startBoxSelection(e) {
    state.isBoxSelecting = true;
    const rect = els.viewport.getBoundingClientRect();
    state.boxStartX = e.clientX - rect.left;
    state.boxStartY = e.clientY - rect.top;
    
    const selRect = document.getElementById('selectionRect');
    selRect.style.left = state.boxStartX + 'px';
    selRect.style.top = state.boxStartY + 'px';
    selRect.style.width = '0px';
    selRect.style.height = '0px';
    selRect.classList.add('active');
    
    els.viewport.style.cursor = 'crosshair';
  }

  function updateBoxSelection(e) {
    if(!state.isBoxSelecting) return;
    
    const rect = els.viewport.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;
    
    const selRect = document.getElementById('selectionRect');
    const left = Math.min(state.boxStartX, currentX);
    const top = Math.min(state.boxStartY, currentY);
    const width = Math.abs(currentX - state.boxStartX);
    const height = Math.abs(currentY - state.boxStartY);
    
    selRect.style.left = left + 'px';
    selRect.style.top = top + 'px';
    selRect.style.width = width + 'px';
    selRect.style.height = height + 'px';
  }

  function finishBoxSelection() {
    if(!state.isBoxSelecting) return;
    
    state.isBoxSelecting = false;
    const selRect = document.getElementById('selectionRect');
    
    // Get selection rectangle bounds
    const rectBounds = {
      left: parseFloat(selRect.style.left),
      top: parseFloat(selRect.style.top),
      right: parseFloat(selRect.style.left) + parseFloat(selRect.style.width),
      bottom: parseFloat(selRect.style.top) + parseFloat(selRect.style.height)
    };
    
    // Find points within the selection box
    const dataPoints = state.points.filter(p => p.type === 'data' && p.signals);
    
    dataPoints.forEach(p => {
      // Transform point coordinates to viewport space
      const pointX = (p.x * state.scale) + state.x;
      const pointY = (p.y * state.scale) + state.y;
      
      // Check if point is within selection rectangle
      if(pointX >= rectBounds.left && pointX <= rectBounds.right &&
         pointY >= rectBounds.top && pointY <= rectBounds.bottom) {
        
        // Check if not already selected
        const alreadySelected = selectedPoints.findIndex(sp => sp.row === p.row);
        if(alreadySelected === -1) {
          selectedPoints.push(p);
          const pointEl = document.querySelector(`.point[data-id="${p.id || p.row}"]`);
          if(pointEl) {
            pointEl.classList.add('multi-active');
          }
        }
      }
    });
    
    // Hide selection rectangle
    selRect.classList.remove('active');
    els.viewport.style.cursor = 'grab';
    
    // Show graph if points were selected
    if(selectedPoints.length > 0) {
      renderGraphSheet();
    }
  }

  function fitMap() {
    const vw = els.viewport.clientWidth;
    const vh = els.viewport.clientHeight;
    const iw = els.img.naturalWidth || 2000;
    const ih = els.img.naturalHeight || 2000;
    state.scale = Math.min(vw/iw, vh/ih) * 0.9;
    state.x = (vw - iw*state.scale)/2;
    state.y = (vh - ih*state.scale)/2;
    updateTransform();
  }

  function updateTransform() {
    els.container.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
  }

  window.onload = init;

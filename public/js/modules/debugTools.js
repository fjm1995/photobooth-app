/**
 * Debug Tools Module - Helper functions for debugging and diagnosis
 */

// Generate a debug report for the camera and image processing
export function generateCameraDebugReport() {
  const report = {
    browserInfo: {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      vendor: navigator.vendor
    },
    screenInfo: {
      width: window.screen.width,
      height: window.screen.height,
      pixelRatio: window.devicePixelRatio
    },
    mediaDevices: navigator.mediaDevices ? 'available' : 'unavailable',
    mediaConstraints: {
      videoRequested: {
        width: { ideal: 3840 },
        height: { ideal: 2160 }
      }
    },
    videoElement: {},
    canvasInfo: {},
    logoStatus: {}
  };

  // Get video element information if available
  const videoElement = document.getElementById('camera-preview');
  if (videoElement) {
    report.videoElement = {
      videoWidth: videoElement.videoWidth,
      videoHeight: videoElement.videoHeight,
      clientWidth: videoElement.clientWidth,
      clientHeight: videoElement.clientHeight,
      readyState: videoElement.readyState,
      srcObject: videoElement.srcObject ? 'present' : 'missing'
    };
  }

  // Create a test canvas to check max dimensions
  try {
    const testCanvas = document.createElement('canvas');
    const maxSize = 16384; // Most browsers support up to 16K canvas
    testCanvas.width = maxSize;
    testCanvas.height = maxSize;
    // Check if the canvas dimensions were honored
    const actualWidth = testCanvas.width;
    const actualHeight = testCanvas.height;
    
    report.canvasInfo = {
      maxTestedWidth: maxSize,
      maxTestedHeight: maxSize,
      actualMaxWidth: actualWidth,
      actualMaxHeight: actualHeight,
      supported: actualWidth === maxSize && actualHeight === maxSize
    };
  } catch (e) {
    report.canvasInfo = {
      error: e.message,
      supported: false
    };
  }

  // Test the logo loading
  const logoTest = async () => {
    const logoURLs = [
      '/public/images/impact-logo.png',
      '/images/impact-logo.png',
      'images/impact-logo.png'
    ];

    for (const url of logoURLs) {
      try {
        const response = await fetch(url);
        report.logoStatus[url] = {
          status: response.status,
          ok: response.ok,
          contentType: response.headers.get('content-type')
        };
      } catch (e) {
        report.logoStatus[url] = {
          error: e.message,
          ok: false
        };
      }
    }
  };

  // Return a promise that will resolve with the report
  return new Promise(async (resolve) => {
    await logoTest();
    console.log('Camera Debug Report:', report);
    resolve(report);
  });
}

// Check if we're running in a development environment
export function isDevelopmentEnvironment() {
  const hostname = window.location.hostname;
  return hostname === 'localhost' || 
         hostname === '127.0.0.1' || 
         hostname.includes('.local');
}

// Log a detailed message with visual styling
export function logDebug(label, data, style = 'color: blue; font-weight: bold') {
  console.log(`%c[DEBUG] ${label}:`, style, data);
}

// Add a visible debug overlay on the page
export function createDebugOverlay() {
  // Remove any existing debug overlay
  const existingOverlay = document.getElementById('debug-overlay');
  if (existingOverlay) {
    existingOverlay.remove();
  }

  // Create new overlay
  const overlay = document.createElement('div');
  overlay.id = 'debug-overlay';
  overlay.style.cssText = `
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background-color: rgba(0,0,0,0.8);
    color: lime;
    font-family: monospace;
    padding: 10px;
    font-size: 12px;
    z-index: 10000;
    max-height: 30vh;
    overflow-y: auto;
  `;

  // Add toggle button
  const toggleButton = document.createElement('button');
  toggleButton.textContent = 'Toggle Debug Info';
  toggleButton.style.cssText = `
    position: fixed;
    top: 5px;
    right: 5px;
    z-index: 10001;
    background: #333;
    color: white;
    border: none;
    padding: 5px 10px;
    border-radius: 5px;
    font-size: 12px;
  `;
  
  // Add content div
  const content = document.createElement('div');
  content.id = 'debug-content';
  overlay.appendChild(content);

  // Toggle visibility when clicked
  toggleButton.addEventListener('click', () => {
    overlay.style.display = overlay.style.display === 'none' ? 'block' : 'none';
  });

  // Add to document
  document.body.appendChild(overlay);
  document.body.appendChild(toggleButton);

  return {
    update: (html) => {
      content.innerHTML = html;
    },
    log: (message) => {
      const line = document.createElement('div');
      line.innerHTML = `${new Date().toLocaleTimeString()}: ${message}`;
      content.appendChild(line);
      
      // Scroll to bottom
      overlay.scrollTop = overlay.scrollHeight;
    },
    clear: () => {
      content.innerHTML = '';
    }
  };
}

/**
 * Initialize debug features and tools
 * This should be called once when the application starts if debug mode is enabled
 * @param {boolean} enabled - Whether debug mode is enabled in the environment
 * @returns {Object} Debug tools API
 */
export function initializeDebugMode(enabled = false) {
  // Store the debug state
  window.photoboothDebug = {
    enabled: enabled,
    overlay: null,
    displayElements: []
  };
  
  // Only create UI elements if debug is enabled
  if (enabled) {
    // Create the overlay for debug messages
    window.photoboothDebug.overlay = createDebugOverlay();
    window.photoboothDebug.overlay.log('Debug mode initialized via env settings');
    
    // Add resolution display and other visual debugging elements
    addVisualDebugging();
    
    // Create keyboard shortcut for debug report
    document.addEventListener('keydown', async (e) => {
      // Ctrl+Shift+D for debug report
      if (e.key === 'D' && e.ctrlKey && e.shiftKey) {
        window.photoboothDebug.overlay.log('Running camera debug report...');
        const report = await generateCameraDebugReport();
        window.photoboothDebug.overlay.update(`
          <h3>Camera Debug Report</h3>
          <pre>${JSON.stringify(report, null, 2)}</pre>
        `);
      }
      
      // Ctrl+Shift+H to toggle debug display visibility
      if (e.key === 'H' && e.ctrlKey && e.shiftKey) {
        toggleDebugVisibility();
      }
    });
  }
  
  // Return an API for debug functions
  return {
    isEnabled: () => window.photoboothDebug?.enabled || false,
    log: (message) => {
      if (window.photoboothDebug?.enabled && window.photoboothDebug?.overlay) {
        window.photoboothDebug.overlay.log(message);
      }
      console.log('[DEBUG]', message);
    },
    toggleVisibility: toggleDebugVisibility
  };
}

/**
 * Toggle visibility of all debug elements
 */
function toggleDebugVisibility() {
  if (!window.photoboothDebug?.enabled) return;
  
  const { overlay, displayElements } = window.photoboothDebug;
  
  // Toggle overlay visibility
  if (overlay && overlay.element) {
    overlay.element.style.display = 
      overlay.element.style.display === 'none' ? 'block' : 'none';
  }
  
  // Toggle all other debug display elements
  displayElements.forEach(el => {
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
  });
  
  console.log('Debug display visibility toggled');
}

// Create elements for visual debugging
export function addVisualDebugging() {
  // Create resolution display
  const resDisplay = document.createElement('div');
  resDisplay.id = 'debug-resolution-display';
  resDisplay.style.cssText = `
    position: fixed;
    top: 5px;
    left: 5px;
    background-color: rgba(0,0,0,0.7);
    color: white;
    padding: 5px;
    font-size: 12px;
    font-family: monospace;
    z-index: 9999;
  `;
  document.body.appendChild(resDisplay);
  
  // Store in global debug state for visibility toggling
  if (window.photoboothDebug) {
    window.photoboothDebug.displayElements.push(resDisplay);
  }

  // Update resolution info from video element
  const updateResInfo = () => {
    const video = document.getElementById('camera-preview');
    if (video) {
      resDisplay.textContent = `Stream: ${video.videoWidth}x${video.videoHeight} | Display: ${video.clientWidth}x${video.clientHeight}`;
    }
  };

  // Update every second
  setInterval(updateResInfo, 1000);
  
  return resDisplay;
}

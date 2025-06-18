// Camera Manager module - handles camera initialization and status

import state from './state.js';
import { elements } from './domElements.js';
import { showError } from './utils.js';
import * as dslrCamera from './dslrCamera.js';
import * as browserCamera from './browserCamera.js';

/**
 * Initialize the camera
 */
export async function initCamera() {
  try {
    // Display a message while connecting
    elements.statusMessageElement.textContent = 'Connecting to camera...';
    
    // Check camera status from the server
    const apiUrl = '/api/camera/status';
    console.log(`Using camera status API URL: ${apiUrl}`);
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.success || !data.cameraAvailable) {
      // Check if there's setup status information from the server
      if (data.setupStatus && data.setupStatus.needsSetup) {
        console.warn('Camera needs setup:', data.setupStatus.message);
        showError(`Camera setup required: ${data.setupStatus.message}. Try running the application as root or check camera connections.`);
      }
      throw new Error('No camera detected');
    }
    
    // Update camera info
    state.cameraType = data.cameraType;
    state.cameraModel = data.cameraModel;
    
    // Update UI with camera info
    updateCameraStatus(true, state.cameraType, state.cameraModel);
    
    // Set up the appropriate stream based on the camera type and URL
    const streamUrl = data.streamUrl;
    
    if (!streamUrl) {
      throw new Error('Camera stream not available');
    }
    
    // For remote access or specific domains, use the server's camera stream
    const isLocalhost = window.location.hostname === 'localhost' || 
                        window.location.hostname === '127.0.0.1';
    const isCanonAccess = window.location.hostname.includes('photobooth.local');
    
    // Check if we need to use remote mode
    // Either remote access or running on photobooth.local domain (common for Raspberry Pi setups)
    const useRemoteMode = !isLocalhost || isCanonAccess;
    
    if (useRemoteMode) {
      console.log(`Using server camera stream (hostname: ${window.location.hostname})`);
      
      // For DSLR cameras, use the preview image approach
      if (state.cameraType === 'dslr') {
        await dslrCamera.startDSLRPreview();
        
        // Enable the take picture button for DSLR
        elements.takePictureBtn.disabled = false;
        console.log('DSLR camera preview initialized successfully');
      } else {
        // For webcams, use the MJPEG stream
        console.log('Setting up MJPEG stream');
        
        try {
          // Hide video element and show image element
          elements.cameraPreview.classList.add('hidden');
          elements.cameraPreviewImg.classList.remove('hidden');
          
          // First, verify the camera was properly restarted
          fetch('/api/camera/status')
            .then(response => response.json())
            .then(statusData => {
              console.log('Camera status before stream connection:', statusData);
              
              if (!statusData.cameraAvailable) {
                console.log('Camera not available, restarting before attempting stream');
                // If camera isn't available, restart it
                return fetch('/api/camera/restart', { method: 'POST' })
                  .then(response => response.json());
              }
              return statusData;
            })
            .then(() => {
              // Add a small delay before connecting to the stream
              setTimeout(() => {
                // Set the image source to the MJPEG stream with a cache-busting parameter
                const timestamp = new Date().getTime();
                elements.cameraPreviewImg.src = `/api/camera/mjpeg-stream?t=${timestamp}`;
                
                // Log that we've started the MJPEG stream request
                console.log('MJPEG stream requested from: ' + elements.cameraPreviewImg.src);
                
                // Track the number of stream errors to implement backoff
                if (!state.streamErrorCount) {
                  state.streamErrorCount = 0;
                }

                // Add error handler for the image with enhanced retry logic and backoff
                elements.cameraPreviewImg.onerror = (e) => {
                  console.error('MJPEG stream error:', e);
                  
                  // Increment error count for exponential backoff
                  state.streamErrorCount++;
                  
                  // If we already have a retry timer, don't set another one
                  if (state.streamRetryTimer) {
                    return;
                  }
                  
                  // Clear the stream immediately on error
                  elements.cameraPreviewImg.src = '';
                  
                  // Set a flag to indicate we're in retry mode - make it available globally
                  state.inStreamRetryMode = true;
                  window.state = window.state || {};
                  window.state.inStreamRetryMode = true;
                  
                  // Calculate backoff time - starts at 3 seconds, doubles with each retry up to 30 seconds
                  const baseDelay = 3000;
                  const maxDelay = 30000;
                  const backoffDelay = Math.min(baseDelay * Math.pow(1.5, state.streamErrorCount - 1), maxDelay);
                  
                  // Show message to the user about the retry
                  elements.statusMessageElement.textContent = `Camera connection issue, will retry in ${Math.round(backoffDelay/1000)} seconds...`;
                  
                  // Log error but don't show it to the user unless it persists
                  console.log(`Camera stream connection error (attempt #${state.streamErrorCount}), attempting recovery in ${Math.round(backoffDelay/1000)}s...`);
                  
                  // If we have too many errors, slow down the restart attempts to prevent resource exhaustion
                  if (state.streamErrorCount > 3) {
                    // For high error counts, just retry the stream without full restart
                    state.streamRetryTimer = setTimeout(() => {
                      console.log(`Retrying MJPEG stream connection directly (attempt #${state.streamErrorCount})...`);
                      
                      // Try again with a new timestamp
                      const newTimestamp = new Date().getTime();
                      elements.cameraPreviewImg.src = `/api/camera/mjpeg-stream?t=${newTimestamp}`;
                      
                      // Clear the retry timer
                      state.streamRetryTimer = null;
                    }, backoffDelay);
                  } else {
                    // For first few errors, try full restart
                    fetch('/api/camera/restart', { 
                      method: 'POST',
                      headers: {
                        'Cache-Control': 'no-cache',
                        'Pragma': 'no-cache'
                      }
                    })
                      .then(response => {
                        // If we get 202 Accepted, that's good - the restart is processing
                        if (!response.ok && response.status !== 202) {
                          throw new Error(`Server responded with ${response.status}`);
                        }
                        
                        // Parse server response
                        return response.json();
                      })
                      .then(data => {
                        console.log('Camera restart initiated:', data);
                        
                        // The server is handling the restart asynchronously
                        // Give it a little more time to complete
                        const restartExtraTime = 5000;
                        const totalDelay = backoffDelay + restartExtraTime;
                        
                        console.log(`Waiting ${Math.round(totalDelay/1000)}s for camera services to restart...`);
                        elements.statusMessageElement.textContent = `Restarting camera services, please wait...`;
                        
                        // Set a retry timer with the calculated backoff delay plus restart time
                        state.streamRetryTimer = setTimeout(() => {
                          console.log(`Retrying MJPEG stream connection after restart (delay: ${Math.round(totalDelay/1000)}s)...`);
                          
                          // Try again with a new timestamp
                          const newTimestamp = new Date().getTime();
                          elements.cameraPreviewImg.src = `/api/camera/mjpeg-stream?t=${newTimestamp}`;
                          
                          // Clear the retry timer
                          state.streamRetryTimer = null;
                        }, totalDelay);
                      })
                      .catch(err => {
                        console.error('Error restarting camera after stream error:', err);
                        
                        // Still try to reconnect even if restart fails, but with a longer delay
                        state.streamRetryTimer = setTimeout(() => {
                          console.log(`Retrying MJPEG stream connection after failed restart (delay: ${Math.round(backoffDelay/1000)}s)...`);
                          
                          // Try again with a new timestamp
                          const newTimestamp = new Date().getTime();
                          elements.cameraPreviewImg.src = `/api/camera/mjpeg-stream?t=${newTimestamp}`;
                          
                          // Clear the retry timer
                          state.streamRetryTimer = null;
                        }, backoffDelay);
                      });
                  }
                };
              }, 500);
            })
            .catch(error => {
              console.error('Error checking camera status before stream connection:', error);
              showError('Error connecting to camera. Please check camera connections.');
            });
          
          // Add load handler for the image
          elements.cameraPreviewImg.onload = () => {
            // Enable the take picture button
            elements.takePictureBtn.disabled = false;
            console.log('Camera stream initialized successfully');
            elements.statusMessageElement.textContent = 'Camera connected successfully';
            
            // Clear any retry timer if it exists
            if (state.streamRetryTimer) {
              clearTimeout(state.streamRetryTimer);
              state.streamRetryTimer = null;
            }
            
            // Reset stream retry mode flags and error count
            state.inStreamRetryMode = false;
            state.streamErrorCount = 0;
            if (window.state) {
              window.state.inStreamRetryMode = false;
            }
          };
        } catch (streamError) {
          console.error('Error initializing stream:', streamError);
          showError(`Stream error: ${streamError.message}. Please check camera connections.`);
        }
      }
    } else {
      // Local access, can use browser camera if needed
      // Check if we're using browser-based camera access
      if (streamUrl === '/api/camera/browser') {
        // Use browser camera directly
        await browserCamera.useBrowserCamera();
      } else {
        // Check if we're dealing with a DSLR camera
        if (state.cameraType === 'dslr') {
          // For DSLR, use the preview image approach
          dslrCamera.startDSLRPreview();
          
          // Enable the take picture button for DSLR
          elements.takePictureBtn.disabled = false;
          console.log('DSLR camera preview initialized successfully');
        } else {
          // For webcams, set up the video element with the stream URL
          elements.cameraPreview.src = streamUrl;
          
          // Add event listeners for error handling
          elements.cameraPreview.onerror = (e) => {
            console.error('Video element error:', e);
            // Don't show error, just try browser camera as fallback
            browserCamera.tryBrowserCamera();
          };
          
          // When the video is loaded and playing
          elements.cameraPreview.oncanplay = () => {
            // Enable the take picture button
            elements.takePictureBtn.disabled = false;
            console.log('Camera stream initialized successfully');
          };
          
          // Start loading the video
          elements.cameraPreview.load();
        }
          
        // Set a timeout to check if the video is playing
        setTimeout(() => {
          if (elements.cameraPreview.readyState === 0) {
            console.error('Video element not loading');
            // Don't show error, just try browser camera as fallback
            browserCamera.tryBrowserCamera();
          }
        }, 5000);
      }
    }
  } catch (error) {
    showError(`Camera access error: ${error.message}. Please ensure the camera is connected and the server is running.`);
    console.error('Error accessing camera:', error);
    
    // Only try browser camera as fallback for local access
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      browserCamera.tryBrowserCamera();
    }
  }
}

/**
 * Check camera status
 */
export async function checkCameraStatus() {
  try {
    // Use relative URL
    const apiUrl = '/api/camera/status';
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      updateCameraStatus(false);
      return;
    }
    
    const data = await response.json();
    
    if (data.success && data.cameraAvailable) {
      updateCameraStatus(true, data.cameraType, data.cameraModel);
      
      // If it's a DSLR camera, load the camera settings
      if (data.cameraType === 'dslr') {
        dslrCamera.loadDSLRSettings();
      }
    } else {
      updateCameraStatus(false);
    }
  } catch (error) {
    console.error('Error checking camera status:', error);
    updateCameraStatus(false);
  }
}

/**
 * Update camera status in the UI
 * @param {boolean} connected - Whether camera is connected
 * @param {string} type - Camera type
 * @param {string} model - Camera model
 */
export function updateCameraStatus(connected, type, model) {
  // Update application state with camera status
  if (connected) {
    // Set camera type and model in state
    state.cameraType = type;
    state.cameraModel = model;
    
    // Handle DSLR specific functionality
    if (type === 'dslr') {
      // If we're in DSLR mode, start the preview refresh
      if (!state.isDSLRPreviewMode) {
        dslrCamera.startDSLRPreview();
      }
    } else {
      // If we're in DSLR preview mode but no longer have a DSLR, stop it
      if (state.isDSLRPreviewMode) {
        dslrCamera.stopDSLRPreview();
      }
    }
  } else {
    // Stop DSLR preview if active
    if (state.isDSLRPreviewMode) {
      dslrCamera.stopDSLRPreview();
    }
    
    // Reset camera state
    state.cameraType = null;
    state.cameraModel = null;
  }
  
  // Log camera status
  console.log(`Camera status updated: ${connected ? 'Connected' : 'Disconnected'}, Type: ${type || 'None'}, Model: ${model || 'None'}`);
}

/**
 * Restart camera services
 */
export async function restartCamera() {
  try {
    // Create a backdrop with loading indicator to cover the entire app
    const backdrop = document.createElement('div');
    backdrop.className = 'fullscreen-backdrop';
    backdrop.innerHTML = `
      <div class="restart-message">
        <i class="fas fa-sync-alt fa-spin"></i>
        <h2>Restarting Camera</h2>
        <p class="restart-status">Initializing camera reset...</p>
        <div class="progress-bar">
          <div class="progress-fill"></div>
        </div>
        <div class="restart-details" style="margin-top: 15px; font-size: 0.9em;"></div>
      </div>
    `;
    document.body.appendChild(backdrop);
    
    // Get elements for updating
    const progressFill = backdrop.querySelector('.progress-fill');
    const statusText = backdrop.querySelector('.restart-status');
    const detailsText = backdrop.querySelector('.restart-details');
    progressFill.style.width = '0%';
    
    // Hide the admin modal
    elements.adminModal.classList.add('hidden');
    
    // Disable the restart button
    elements.restartCameraBtn.disabled = true;
    
    // Function to update status display
    const updateStatus = (status, progress, details = null) => {
      statusText.textContent = status;
      progressFill.style.width = `${progress}%`;
      if (details) {
        detailsText.textContent = details;
      }
    };
    
    // Starting stage
    updateStatus('Sending restart request to server...', 10);
    
    // Make a POST request to restart the camera services
    const response = await fetch('/api/camera/restart', {
      method: 'POST',
      headers: {
        'Cache-Control': 'no-cache'
      }
    });
    
    // Process the response
    if (!response.ok && response.status !== 202) {
      throw new Error(`Server error: ${response.status}`);
    }
    
    // Parse the response data
    const responseData = await response.json();
    console.log('Camera restart initiated:', responseData);
    
    // Get estimated time from server or use default
    const estimatedTime = responseData.estimatedTime || 10; // seconds
    const initialState = responseData.initialState || { connected: false, type: 'unknown', model: 'unknown' };
    
    // Update UI with initial state information
    updateStatus('Restarting camera services...', 20, 
      `Initial camera state: ${initialState.connected ? 'Connected' : 'Disconnected'} - ${initialState.model || 'Unknown'}`);
    
    // Set up progress animation to reach 80% during estimated time
    let progress = 20;
    const progressStep = 60 / (estimatedTime * 2); // 60% range from 20% to 80% over estimated time
    const progressInterval = setInterval(() => {
      progress += progressStep;
      progressFill.style.width = `${Math.min(progress, 80)}%`;
      
      // Update the status message periodically
      if (progress < 40) {
        updateStatus('Stopping camera services...', progress);
      } else if (progress < 60) {
        updateStatus('Resetting camera connections...', progress);
      } else if (progress < 80) {
        updateStatus('Reinitializing camera...', progress);
      }
      
      if (progress >= 80) clearInterval(progressInterval);
    }, 500);
    
    // Wait for estimated time plus a buffer
    const waitTime = (estimatedTime * 1000) + 2000;
    console.log(`Waiting ${waitTime/1000} seconds for camera services to restart...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
    
    // Complete the progress bar to 90%
    clearInterval(progressInterval);
    progressFill.style.width = '90%';
    updateStatus('Verifying camera status...', 90);
    
    // Poll the status endpoint to confirm camera is ready
    let statusData = null;
    let retryCount = 0;
    const maxRetries = 4;
    
    while (retryCount < maxRetries) {
      try {
        updateStatus(`Verifying camera status (attempt ${retryCount+1}/${maxRetries})...`, 90);
        const statusResponse = await fetch('/api/camera/status', {
          headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
        });
        
        if (statusResponse.ok) {
          statusData = await statusResponse.json();
          if (statusData.success && statusData.cameraAvailable) {
            console.log('Camera is available after restart:', statusData);
            updateStatus(`Camera detected: ${statusData.cameraModel}`, 95);
            break;
          } else {
            console.log('Camera not yet available:', statusData);
            // If we have setup status info, display it
            if (statusData.setupStatus && statusData.setupStatus.message) {
              updateStatus(`Verifying: ${statusData.setupStatus.message}`, 90);
            }
          }
        }
      } catch (e) {
        console.log(`Status check retry ${retryCount+1}/${maxRetries} failed:`, e);
      }
      
      retryCount++;
      if (retryCount < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // Clean up any existing camera streams
    if (elements.cameraPreviewImg) {
      elements.cameraPreviewImg.src = '';
    }
    
    // Complete progress to 100%
    progressFill.style.width = '100%';
    updateStatus('Reconnecting to camera...', 100);
    
    // Re-initialize the camera
    await initCamera();
    
    // Get final camera state
    const finalState = {
      connected: state.cameraType !== null,
      type: state.cameraType || 'unknown',
      model: state.cameraModel || 'unknown'
    };
    
    // Update display with results
    let resultMessage = finalState.connected 
      ? `Camera reset successful: ${finalState.model}`
      : 'Camera reset completed, but no camera detected';
    updateStatus(resultMessage, 100);
    
    console.log('Camera restart completed. Final state:', finalState);
    
    // Remove the backdrop with a slight delay to ensure the camera is initialized
    setTimeout(() => {
      document.body.removeChild(backdrop);
    }, 2000);
    
  } catch (error) {
    // Show error and remove backdrop
    showError(`Could not restart camera: ${error.message}. Please try again.`);
    console.error('Error restarting camera:', error);
    
    const backdrop = document.querySelector('.fullscreen-backdrop');
    if (backdrop) document.body.removeChild(backdrop);
  } finally {
    // Re-enable the restart button
    elements.restartCameraBtn.disabled = false;
  }
}

/**
 * Handle camera selection change
 */
export async function handleCameraSelection(event) {
  const selectedValue = event.target.value;
  
  if (!selectedValue) return;
  
  try {
    // Stop any existing camera stream
    if (state.stream) {
      state.stream.getTracks().forEach(track => track.stop());
      state.stream = null;
    }
    
    // Stop DSLR preview if active
    if (state.isDSLRPreviewMode) {
      dslrCamera.stopDSLRPreview();
    }
    
    // Parse the selected value
    const [type, id] = selectedValue.split(':');
    
    if (type === 'browser') {
      // Use browser camera
      await browserCamera.useBrowserCamera(id);
    } else if (type === 'server') {
      // Use server camera
      await initCamera();
    }
  } catch (error) {
    console.error('Error switching camera:', error);
    showError(`Error switching camera: ${error.message}`);
  }
}

/**
 * Reset the countdown and enable the take picture button
 */
export function resetCountdown() {
  clearInterval(state.countdownInterval);
  elements.countdownElement.classList.add('hidden');
  elements.takePictureBtn.disabled = false;
}

// Make resetCountdown globally available for error handling
window.resetCountdown = resetCountdown;

// DSLR Camera module - handles DSLR camera operations

import state from './state.js';
import { elements } from './domElements.js';
import { showError } from './utils.js';

/**
 * Start DSLR preview mode
 */
export function startDSLRPreview() {
  // Hide the video element and show the image element
  elements.cameraPreview.classList.add('hidden');
  elements.cameraPreviewImg.classList.remove('hidden');
  
  // Set the flag
  state.isDSLRPreviewMode = true;
  
  // For Canon cameras, we now use the MJPEG stream directly
  // This provides a continuous real-time preview
  elements.cameraPreviewImg.src = '/api/camera/mjpeg-stream';
  
  // Set up error handling for the MJPEG stream
  elements.cameraPreviewImg.onerror = (e) => {
    console.error('MJPEG stream error:', e);
    // Fall back to refresh mode in case of error
    if (!state.previewInterval) {
      state.previewInterval = setInterval(refreshDSLRPreview, 500);
    }
  };
  
  // Enable the take picture button
  elements.takePictureBtn.disabled = false;
  
  console.log('Canon camera preview started with MJPEG stream');
}

/**
 * Stop DSLR preview mode
 */
export function stopDSLRPreview() {
  // Show the video element and hide the image element
  elements.cameraPreview.classList.remove('hidden');
  elements.cameraPreviewImg.classList.add('hidden');
  
  // Clear the interval if it exists
  if (state.previewInterval) {
    clearInterval(state.previewInterval);
    state.previewInterval = null;
  }
  
  // Reset the image source
  elements.cameraPreviewImg.src = '';
  
  // Reset the flag
  state.isDSLRPreviewMode = false;
}

/**
 * Refresh the DSLR preview image (fallback method)
 */
export async function refreshDSLRPreview() {
  try {
    // Add a timestamp to prevent caching
    const timestamp = new Date().getTime();
    const previewUrl = `/api/camera/preview?t=${timestamp}`;
    elements.cameraPreviewImg.src = previewUrl;
    
    // Enable the take picture button if it's disabled
    if (elements.takePictureBtn.disabled) {
      elements.takePictureBtn.disabled = false;
    }
  } catch (error) {
    console.error('Error refreshing DSLR preview:', error);
  }
}

/**
 * Load DSLR settings from the camera
 */
export async function loadDSLRSettings() {
  try {
    const apiUrl = '/api/camera/settings';
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      console.error('Error loading DSLR settings');
      return;
    }
    
    const data = await response.json();
    
    if (data.success) {
      // Store the settings in state for possible future use
      state.dslrSettings = data.currentSettings;
      console.log('DSLR settings loaded:', data.currentSettings);
    }
  } catch (error) {
    console.error('Error loading DSLR settings:', error);
  }
}

/**
 * Save application settings to the server
 * This simplified version only sends application settings, not DSLR-specific settings
 */
export async function saveDSLRSettings() {
  try {
    // Create settings object with only application settings
    const settings = {
      application: {
        imageQuality: elements.imageQualitySelect.value,
        flashMode: elements.flashModeSelect.value,
        autoFocus: elements.autoFocusToggle.checked,
        mirrorPreview: elements.mirrorPreviewToggle.checked
      }
    };

    const apiUrl = '/api/camera/settings';
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(settings)
    });
    
    if (!response.ok) {
      throw new Error('Failed to save settings');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error saving settings:', error);
    throw error;
  }
}

/**
 * Capture a photo with the DSLR camera
 */
export async function capturePhoto() {
  const apiUrl = '/api/camera/capture';
  console.log(`Using camera capture API URL: ${apiUrl}`);
  const response = await fetch(apiUrl, {
    method: 'POST'
  });
  
  if (!response.ok) {
    throw new Error(`Server error: ${response.status}`);
  }
  
  return await response.json();
}

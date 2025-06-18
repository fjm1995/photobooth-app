// UI Controller module - handles UI interactions and screen transitions

import state from './state.js';
import { elements } from './domElements.js';
import { formatPhoneNumber, updateContinueButton, showError } from './utils.js';
import { initCamera } from './cameraManager.js';
import { resetSettings } from './settings.js';
import { generateQRCode } from './notificationService.js';

/**
 * Show phone number entry screen
 */
export function showPhoneScreen() {
  // Hide other screens
  elements.cameraScreen.classList.remove('active');
  elements.resultScreen.classList.remove('active');
  
  // Show phone screen
  elements.phoneScreen.classList.add('active');
  
  // Focus on phone number input if it exists
  setTimeout(() => {
    if (elements.phoneNumberInput) {
      elements.phoneNumberInput.focus();
    }
  }, 300);
  
  // Clean up any existing camera stream first, then prepare the camera for next use
  setTimeout(() => {
    // Clear any existing MJPEG stream
    if (elements.cameraPreviewImg) {
      elements.cameraPreviewImg.src = '';
    }
    
    // Create a subtle notification to show camera is resetting
    const statusText = document.createElement('div');
    statusText.className = 'status-notification';
    statusText.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> Preparing camera for next photo...';
    document.body.appendChild(statusText);
    
    // Server automatically handles camera stream management
    // We just need to initialize the camera in the client
    console.log('Initializing camera for next use');
    
    // Short delay to ensure UI is ready
    setTimeout(() => {
      initCamera();
      
      // Remove the status notification after a moment
      setTimeout(() => {
        if (document.body.contains(statusText)) {
          document.body.removeChild(statusText);
        }
      }, 1000);
    }, 1000);
  }, 500);
}

/**
 * Show camera preview screen
 */
export function showCameraScreen() {
  // Hide other screens
  elements.phoneScreen.classList.remove('active');
  elements.resultScreen.classList.remove('active');
  
  // Show camera screen
  elements.cameraScreen.classList.add('active');
  
  // Make sure camera is initialized
  if (!state.cameraType) {
    initCamera();
  }
}

/**
 * Show result screen
 */
export function showResultScreen() {
  // Hide other screens
  elements.phoneScreen.classList.remove('active');
  elements.cameraScreen.classList.remove('active');
  
  // Show result screen
  elements.resultScreen.classList.add('active');
}

/**
 * Handle continue button click
 */
export function handleContinueClick() {
  // Go directly to camera screen without phone number validation
  showCameraScreen();
}

/**
 * Start the photo capture process
 */
export function startPhotoProcess() {
  // Disable the take picture button during countdown
  elements.takePictureBtn.disabled = true;
  
  // Show countdown
  elements.countdownElement.classList.remove('hidden');
  
  // Use the selected countdown time
  let count = state.countdownSeconds;
  elements.countdownElement.textContent = count;
  
  // Start countdown
  state.countdownInterval = setInterval(() => {
    count--;
    elements.countdownElement.textContent = count;
    
    if (count <= 0) {
      clearInterval(state.countdownInterval);
      capturePhoto();
    }
  }, 1000);
}

/**
 * Capture the photo
 */
export async function capturePhoto() {
  try {
    // Import debug tools
    const debugTools = await import('./debugTools.js');
    const debug = window.debugOverlay;
    
    // Log capture starting
    console.log('Starting photo capture process');
    if (debug) debug.log('Starting photo capture process');
    
    // Hide countdown
    elements.countdownElement.classList.add('hidden');
    
    // Show flash effect
    elements.flashElement.classList.remove('hidden');
    elements.flashElement.classList.add('active');
    
    // Add loading spinner to the camera screen
    const processingOverlay = document.createElement('div');
    processingOverlay.className = 'processing-overlay';
    processingOverlay.innerHTML = `
      <div class="loading-spinner">
        <i class="fas fa-spinner fa-spin"></i>
        <p>Processing image...</p>
      </div>
    `;
    document.querySelector('.preview-container').appendChild(processingOverlay);
    
    // Log resolution before capture
    const video = elements.cameraPreview;
    console.log(`Video resolution before capture: ${video.videoWidth}x${video.videoHeight}`);
    if (debug) debug.log(`Video resolution before capture: ${video.videoWidth}x${video.videoHeight}`);
    
    // Run camera debug report before capture
    if (debug) {
      const report = await debugTools.generateCameraDebugReport();
      debug.log(`Camera debug report before capture: ${JSON.stringify(report.videoElement)}`);
    }
    
    // Capture the photo - don't wait for any animations
    if (state.cameraType === 'browser') {
      // Capture from browser camera
      if (debug) debug.log('Using browser camera for capture');
      
      // Retrieve browser camera module
      const browserCameraModule = await import('./browserCamera.js');
      
      // Capture photo
      await browserCameraModule.capturePhoto();
    } else {
      // Request the server to take a photo
      if (debug) debug.log('Using server camera for capture');
      await captureServerPhoto();
    }
    
    // Hide flash and processing overlay
    elements.flashElement.classList.remove('active');
    elements.flashElement.classList.add('hidden');
    processingOverlay.remove();
    
    // Now show the result screen with the captured image
    showResultScreen();
    
    if (debug) debug.log('Photo capture completed, showing result screen');
    
    // Generate QR code for the photo URL
    generateQRCode();
  } catch (error) {
    showError(`Error capturing photo: ${error.message}`);
    console.error('Error capturing photo:', error);
    resetCountdown();
  }
}

/**
 * Capture a photo using the server's camera
 */
async function captureServerPhoto() {
  try {
    // Request the server to take a photo
    const apiUrl = '/api/camera/capture';
    console.log(`Using camera capture API URL: ${apiUrl}`);
    const response = await fetch(apiUrl, {
      method: 'POST'
    });
    
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Photo capture response:', data);
    
    if (!data.success) {
      throw new Error(data.message || 'Unknown error');
    }
    
    // Get the image URL with validation - prefer signedUrl if available
    const imageUrl = data.signedUrl || data.imageUrl;
    
    // Check for valid URL and log details
    if (!imageUrl) {
      console.error('No valid image URL in server response:', data);
    }
    
    console.log('Full server response:', JSON.stringify(data));
    console.log('Setting image src directly to:', imageUrl);
    
    // Create a loading indicator in the result screen
    const loadingIndicator = document.createElement('div');
    loadingIndicator.className = 'loading-indicator';
    loadingIndicator.innerHTML = `
      <div class="loading-spinner">
        <i class="fas fa-spinner fa-spin"></i>
        <p>Loading your photo...</p>
      </div>
    `;
    elements.resultScreen.appendChild(loadingIndicator);
    
    // Direct approach with no fallbacks - just load the captured image
    elements.capturedImageElement.onload = function() {
      console.log('Image loaded successfully');
      loadingIndicator.remove();
    };
    
    // Only remove loading indicator on error
    elements.capturedImageElement.onerror = function(e) {
      console.error('Error loading image. URL was:', imageUrl);
      loadingIndicator.remove();
    };
    
    // Try to use a proxy for S3 URLs to avoid CORS issues
    let displayUrl = imageUrl;
    if (imageUrl && imageUrl.includes('s3.') && imageUrl.includes('amazonaws.com')) {
      // Extract the key (filename) from the S3 URL
      const urlParts = imageUrl.split('/');
      const filenameWithParams = urlParts[urlParts.length - 1];
      const filename = filenameWithParams.split('?')[0]; // Remove query params
      displayUrl = `/api/photo/view/${filename}`;
      console.log('Using proxied URL to avoid CORS issues:', displayUrl);
    }
    
    // Set the image source with a timestamp to prevent caching
    const timestamp = new Date().getTime();
    elements.capturedImageElement.src = `${displayUrl}?t=${timestamp}`;
    
    // Store the image URL for notification sending
    state.currentImageUrl = data.signedUrl || imageUrl;
    console.log('Current image URL set to:', state.currentImageUrl);
    
    // Check if we're in fallback mode
    if (data.awsStatus === 'unavailable') {
      console.log('AWS is unavailable, using local storage fallback');
      elements.statusMessageElement.textContent = 'Note: AWS is currently unavailable. Your photo is saved locally and will be uploaded when connectivity is restored.';
    }
    
    // Server automatically restarts the camera stream after capture
    // No need to manually restart from the client side
    console.log('Server is handling camera stream restart automatically');
    
    return true;
  } catch (error) {
    console.error('Error capturing server photo:', error);
    throw error;
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

/**
 * Set up event listeners for UI interactions
 */
export function setupEventListeners() {
  // Welcome screen
  elements.continueBtn.addEventListener('click', handleContinueClick);
  
  // Admin settings buttons on all screens
  elements.adminSettingsBtn.addEventListener('click', () => elements.adminModal.classList.remove('hidden'));
  
  // Add event listeners for the admin settings buttons on all screens
  document.querySelectorAll('.icon-btn').forEach(btn => {
    if (btn.id.startsWith('admin-settings')) {
      btn.addEventListener('click', () => elements.adminModal.classList.remove('hidden'));
    }
  });
  
  // Camera screen
  elements.backToPhoneBtn.addEventListener('click', showPhoneScreen);
  elements.takePictureBtn.addEventListener('click', startPhotoProcess);
  
  // Set up countdown buttons
  elements.countdownButtons.forEach(button => {
    button.addEventListener('click', () => {
      elements.countdownButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      state.countdownSeconds = parseInt(button.getAttribute('data-seconds'));
    });
  });
  
  // Admin modal
  elements.closeAdminX.addEventListener('click', () => elements.adminModal.classList.add('hidden'));
  
  // Error modal
  
  // Error modal
  elements.closeErrorX.addEventListener('click', () => elements.errorModal.classList.add('hidden'));
  elements.closeErrorBtn.addEventListener('click', () => elements.errorModal.classList.add('hidden'));
  
  // Settings controls
  elements.resetSettingsBtn.addEventListener('click', resetSettings);
  
  // Handle errors that might occur during camera operation
  window.addEventListener('error', (event) => {
    showError(`Application error: ${event.message}`);
    console.error('Application error:', event);
  });
}

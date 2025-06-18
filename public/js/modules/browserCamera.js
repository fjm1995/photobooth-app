// Browser Camera module - handles browser-based camera operations

import state from './state.js';
import { elements } from './domElements.js';
import { showError } from './utils.js';
import { updateCameraStatus } from './cameraManager.js';

/**
 * Try to use the browser's built-in camera as a fallback
 */
export async function tryBrowserCamera() {
  try {
    console.log('Trying to use browser camera as fallback...');
    
    // Check if the browser supports getUserMedia
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Browser does not support camera access');
    }
    
    // List available devices to help with debugging
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(device => device.kind === 'videoinput');
    console.log('Available video devices:', videoDevices);
    
    if (videoDevices.length === 0) {
      throw new Error('No video input devices found');
    }
    
    // Use the first available video device
    await useBrowserCamera(videoDevices[0].deviceId);
  } catch (error) {
    showError(`Browser camera access error: ${error.message}. Please ensure your browser has permission to access the camera.`);
    console.error('Error accessing browser camera:', error);
  }
}

/**
 * Use browser camera
 * @param {string} deviceId - Optional device ID for specific camera
 */
export async function useBrowserCamera(deviceId) {
  try {
    // Request camera access with specific device ID with higher resolution
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        width: { ideal: 3840 },     // 4K width
        height: { ideal: 2160 },    // 4K height
        facingMode: 'environment'   // Prefer back camera
      }
    });
    
    // Set up the video element with the stream
    elements.cameraPreview.srcObject = state.stream;
    elements.cameraPreview.onloadedmetadata = () => {
      elements.cameraPreview.play();
      
      // Enable the take picture button
      elements.takePictureBtn.disabled = false;
      console.log('Browser camera initialized successfully');
      
      // Update camera info
      state.cameraType = 'browser';
      state.cameraModel = 'Browser Camera';
      updateCameraStatus(true, state.cameraType, state.cameraModel);
    };
  } catch (error) {
    console.error('Error using browser camera:', error);
    throw error;
  }
}

/**
 * Capture photo using the browser's camera
 * @returns {Promise<boolean>} - Success status
 */
export async function capturePhoto() {
  try {
    // Get video element and dimensions
    const video = elements.cameraPreview;
    console.log(`STARTING CAPTURE: Video dimensions: ${video.videoWidth}x${video.videoHeight}`);
    
    // Force highest possible resolution - ensure at least 3840x2160 if possible
    const targetWidth = Math.max(3840, video.videoWidth);
    const targetHeight = Math.max(2160, video.videoHeight);
    
    // Create high-resolution canvas for the photo
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    
    console.log(`CANVAS CREATED: High-resolution canvas dimensions: ${canvas.width}x${canvas.height}`);
    
    // Use high-quality upscaling algorithm for the drawing
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    // Draw the video frame to fill the entire high-resolution canvas
    ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight, 
                  0, 0, canvas.width, canvas.height);
    
    console.log(`VIDEO FRAME DRAWN: Upscaled to ${canvas.width}x${canvas.height}`);
    
    // Add watermark to the photo with extra debugging
    await addWatermarkWithDebug(canvas);
    
    // Convert the canvas to a blob with maximum quality
    const blob = await new Promise(resolve => {
      // Use highest possible quality for JPEG
      canvas.toBlob(resolve, 'image/jpeg', 1.0);
    });
    
    // Log the final image size
    console.log(`FINAL IMAGE: Dimensions=${canvas.width}x${canvas.height}, Blob size=${Math.round(blob.size / 1024)}KB`);
    
    // Create a debug copy of the image in the DOM to verify
    const debugImgContainer = document.createElement('div');
    debugImgContainer.style.position = 'fixed';
    debugImgContainer.style.top = '10px';
    debugImgContainer.style.right = '10px';
    debugImgContainer.style.zIndex = '9999';
    debugImgContainer.style.maxWidth = '150px';
    debugImgContainer.style.maxHeight = '150px';
    debugImgContainer.style.border = '3px solid red';
    debugImgContainer.style.overflow = 'hidden';
    
    const debugImg = document.createElement('img');
    debugImg.style.width = '100%';
    debugImg.style.height = 'auto';
    
    // Create a data URL from the canvas to verify image has watermark
    debugImg.src = canvas.toDataURL('image/jpeg', 1.0);
    debugImgContainer.appendChild(debugImg);
    document.body.appendChild(debugImgContainer);
    
    // Remove the debug element after 10 seconds
    setTimeout(() => {
      debugImgContainer.remove();
    }, 10000);
    
    // Upload the blob to the server
    await uploadPhoto(blob);
    
    return true;
  } catch (error) {
    console.error('Error capturing browser photo:', error);
    throw error;
  }
}

/**
 * Enhanced watermark function with extra debugging
 * @param {HTMLCanvasElement} canvas - Canvas element with photo
 * @returns {Promise<HTMLCanvasElement>} - Canvas with watermark
 */
async function addWatermarkWithDebug(canvas) {
  return new Promise((resolve, reject) => {
    // Try multiple logo paths to ensure it works
    const possiblePaths = [
      '/public/images/impact-logo.png',
      '/images/impact-logo.png',
      'images/impact-logo.png',
      // Additional fallbacks as absolute URLs
      window.location.origin + '/images/impact-logo.png',
      window.location.origin + '/public/images/impact-logo.png'
    ];
    
    // Create an image element for the logo
    const logo = new Image();
    let currentPathIndex = 0;
    
    // Detailed logging for debug
    console.log(`WATERMARK: Canvas dimensions ${canvas.width}x${canvas.height}, attempting to load logo...`);
    
    // Setup logo load event handler with enhanced debugging
    logo.onload = () => {
      console.log(`WATERMARK SUCCESS: Logo loaded from ${logo.src}`);
      console.log(`WATERMARK DETAILS: Logo dimensions ${logo.width}x${logo.height}`);
      
      // Get the canvas context
      const ctx = canvas.getContext('2d');
      
      // Calculate logo size based on the LOGO_SIZE_PERCENT server variable
      // Fetch it from settings first, with fallback to default 11.2%
      const settings = window.photoboothSettings || {};
      const logoSizePercent = settings.logoSizePercent || 11.2;
      const logoWidth = Math.round(canvas.width * (logoSizePercent / 100));
      const logoHeight = Math.round((logoWidth / logo.width) * logo.height);
      
      // Position in bottom right with 5px padding
      const logoX = canvas.width - logoWidth - 5;
      const logoY = canvas.height - logoHeight - 5;
      
      console.log(`WATERMARK POSITION: X=${logoX}, Y=${logoY}, Width=${logoWidth}, Height=${logoHeight}`);
      
      // Add a bright colored background behind the logo for visibility
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.fillRect(logoX, logoY, logoWidth, logoHeight);
      
      // Draw the logo
      ctx.drawImage(logo, logoX, logoY, logoWidth, logoHeight);
      
      // Draw a bright red border around the logo for debugging
      ctx.strokeStyle = 'red';
      ctx.lineWidth = 5;
      ctx.strokeRect(logoX, logoY, logoWidth, logoHeight);
      
      console.log('WATERMARK COMPLETE: Logo drawn to canvas with visible border');
      resolve(canvas);
    };
    
    // Setup error handler with detailed debugging and fallbacks
    logo.onerror = (e) => {
      console.error(`WATERMARK ERROR: Failed to load from ${logo.src}`, e);
      
      // Try the next path if available
      currentPathIndex++;
      if (currentPathIndex < possiblePaths.length) {
        console.log(`WATERMARK RETRY: Attempting path ${currentPathIndex + 1}/${possiblePaths.length}: ${possiblePaths[currentPathIndex]}`);
        logo.src = possiblePaths[currentPathIndex];
      } else {
        console.error('WATERMARK FAILED: All logo paths failed, creating text watermark instead');
        
        // Create a text watermark as fallback
        const ctx = canvas.getContext('2d');
        
        // Set text properties
        ctx.font = 'bold 72px Arial';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.lineWidth = 3;
        
        // Position text in bottom right corner
        const text = 'IMPACT';
        const metrics = ctx.measureText(text);
        const textX = canvas.width - metrics.width - 20;
        const textY = canvas.height - 20;
        
        // Draw text with stroke for visibility
        ctx.fillText(text, textX, textY);
        ctx.strokeText(text, textX, textY);
        
        console.log('WATERMARK FALLBACK: Text watermark created');
        resolve(canvas);
      }
    };
    
    // Start with the first path
    console.log(`WATERMARK ATTEMPT: Starting with path: ${possiblePaths[0]}`);
    logo.src = possiblePaths[0];
  });
}

/**
 * Standard watermark function (kept for backward compatibility)
 * @param {HTMLCanvasElement} canvas - Canvas element with photo
 * @returns {Promise<HTMLCanvasElement>} - Canvas with watermark
 */
async function addWatermark(canvas) {
  return addWatermarkWithDebug(canvas);
}

/**
 * Upload the photo to the server
 * @param {Blob} photoBlob - Photo blob to upload
 * @returns {Promise<boolean>} - Success status
 */
async function uploadPhoto(photoBlob) {
  try {
    console.log('Uploading photo to server...');
    
    // Create a FormData object to send the file
    const formData = new FormData();
    formData.append('photo', photoBlob, 'photo.jpg');
    
    // Upload the photo using the upload endpoint
    console.log('Trying /api/upload endpoint...');
    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Upload response:', data);
    
    if (!data.success) {
      throw new Error(data.message || 'Unknown error');
    }
    
    // Display the captured photo
    const imageUrl = data.imageUrl || (data.data && data.data.imageUrl);
    
    // Fix for S3 CORS issues - use a local proxy for S3 images
    let displayUrl = imageUrl;
    if (imageUrl && imageUrl.includes('s3.') && imageUrl.includes('amazonaws.com')) {
      // Extract the key from the S3 URL
      const urlParts = imageUrl.split('/');
      const filename = urlParts[urlParts.length - 1].split('?')[0]; // Remove query params
      displayUrl = `/api/photo/view/${filename}`;
      console.log('Using proxied image URL for display:', displayUrl);
    }
    
    // Add a timestamp to prevent browser caching
    const timestamp = new Date().getTime();
    elements.capturedImageElement.src = `${displayUrl}?t=${timestamp}`;
    
    // Store the URL for SMS sending - use the original URL for SMS
    state.currentImageUrl = data.signedUrl || 
                         (data.data && data.data.signedUrl) || 
                         imageUrl;
    
    console.log('Image URL set to:', displayUrl);
    console.log('Current image URL for SMS:', state.currentImageUrl);
    
    // Check if we're in fallback mode
    if ((data.awsStatus === 'unavailable') || 
        (data.data && data.data.awsStatus === 'unavailable')) {
      console.log('AWS is unavailable, using local storage fallback');
      // Show a warning to the user
      elements.statusMessageElement.textContent = 'Note: AWS is currently unavailable. Your photo is saved locally and will be uploaded when connectivity is restored.';
    }
    
    return true;
  } catch (error) {
    showError(`Error uploading photo: ${error.message}`);
    console.error('Error uploading photo:', error);
    return false;
  }
}

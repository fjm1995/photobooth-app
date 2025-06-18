// Notification Service - handles SMS and communication

import state from './state.js';
import { elements } from './domElements.js';
import { formatPhoneNumberForDisplay, showError } from './utils.js';
import { savePhotoHistory } from './settings.js';

/**
 * Add a photo to the history
 * @param {string} imageUrl - URL of the captured image
 * @param {string} phoneNumber - User's phone number
 */
export function addPhotoToHistory(imageUrl, phoneNumber) {
  // Create a new history item
  const historyItem = {
    id: Date.now().toString(),
    imageUrl,
    phoneNumber,
    timestamp: new Date().toISOString()
  };
  
  // Add to the beginning of the array
  state.photoHistory.unshift(historyItem);
  
  // Limit history to 20 items
  if (state.photoHistory.length > 20) {
    state.photoHistory.pop();
  }
  
  // Save and update UI
  savePhotoHistory();
  updatePhotoHistoryUI();
}

/**
 * Update the photo history (now just maintains the state)
 */
export function updatePhotoHistoryUI() {
  // Since we've removed the photo history UI, we'll just maintain the state
  // and not update any UI elements
  console.log(`Photo history updated: ${state.photoHistory.length} photos in history`);
}

/**
 * View a photo from history
 * @param {object} item - History item to view
 */
export function viewHistoryPhoto(item) {
  // Fix for S3 CORS issues - use a local proxy for S3 images
  let displayUrl = item.imageUrl;
  if (item.imageUrl && item.imageUrl.includes('s3.') && item.imageUrl.includes('amazonaws.com')) {
    // Extract the key from the S3 URL
    const urlParts = item.imageUrl.split('/');
    const filename = urlParts[urlParts.length - 1].split('?')[0]; // Remove query params
    displayUrl = `/api/photo/view/${filename}`;
  }
  
  // Set the image and details - add timestamp to prevent caching
  elements.capturedImageElement.src = `${displayUrl}?t=${new Date().getTime()}`;
  state.currentImageUrl = item.imageUrl;
  state.currentPhoneNumber = item.phoneNumber;
  
  // Show the result screen with history info
  elements.statusMessageElement.textContent = `Photo taken on ${formatDate(item.timestamp)}`;
  
  // Hide history modal and show result screen
  elements.historyModal.classList.add('hidden');
  
  // Show result screen
  elements.phoneScreen.classList.remove('active');
  elements.cameraScreen.classList.remove('active');
  elements.resultScreen.classList.add('active');
}

/**
 * Format date for display
 * @param {string} dateString - ISO date string
 * @returns {string} - Formatted date
 */
function formatDate(dateString) {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (error) {
    return 'Unknown date';
  }
}

// Inactivity timeout variables
let inactivityTimer;
const INACTIVITY_TIMEOUT = 120000; // 2 minutes
let isTimeoutWarningVisible = false;
let timeoutWarningElement = null;

/**
 * Generate and display QR code for the photo URL
 */
export async function generateQRCode() {
  try {
    // Update status message
    elements.statusMessageElement.textContent = 'Generating QR code...';
    
    // Clear any existing QR code
    const qrContainer = document.getElementById('qr-code-container');
    qrContainer.innerHTML = '';
    
    // Show loading indicator in QR code container
    const loadingIndicator = document.createElement('div');
    loadingIndicator.className = 'loading-spinner';
    loadingIndicator.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    qrContainer.appendChild(loadingIndicator);
    
    // Get the original image URL from state - we want to prioritize the S3 URL for high quality
    let fullResImageUrl = state.currentImageUrl;
    
    // If we have an S3 URL, use it directly (as it was before)
    // S3 URLs provide the full high-resolution image without proxying
    if (fullResImageUrl && fullResImageUrl.includes('s3.') && fullResImageUrl.includes('amazonaws.com')) {
      console.log('Using direct S3 URL for high-resolution download in QR code:', fullResImageUrl);
      // S3 URL is already absolute and high resolution, no need to modify
    } else {
      // For non-S3 URLs (local storage fallback), we need to make sure they're absolute
      const baseUrl = window.location.origin; // Get the current domain
      
      // If the URL is not absolute, make it absolute
      if (!fullResImageUrl.startsWith('http')) {
        fullResImageUrl = `${baseUrl}${fullResImageUrl.startsWith('/') ? '' : '/'}${fullResImageUrl}`;
      }
      
      console.log('Using fallback URL for QR code:', fullResImageUrl);
    }
    
    // Prepare request body with the high-resolution URL
    const requestBody = {
      imageUrl: fullResImageUrl
    };
    
    console.log('Generating QR code for high-resolution image URL:', fullResImageUrl);
    
    // Call the QR code generation endpoint
    const response = await fetch('/api/photo/generate-qrcode', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.message || 'Unknown error');
    }
    
    // Display the QR code
    qrContainer.innerHTML = '';
    const qrImage = document.createElement('img');
    qrImage.src = data.data.qrCode;
    qrImage.alt = 'QR code for your photo';
    qrContainer.appendChild(qrImage);
    
    // Add to history (use an empty string for phone number since we don't collect it anymore)
    addPhotoToHistory(state.currentImageUrl, '');
    
    // Update status message to clearly indicate the QR code provides high-resolution access
    elements.statusMessageElement.textContent = 'Scan the QR code with your phone to download your full-resolution photo';
    
    // Setup inactivity timeout
    resetInactivityTimer();
    
    // Add event listener to the Start Over button
    setupStartOverButton();
    
  } catch (error) {
    elements.statusMessageElement.textContent = `Error generating QR code: ${error.message}`;
    console.error('Error generating QR code:', error);
  }
}

/**
 * Set up the Start Over button
 */
function setupStartOverButton() {
  const startOverBtn = document.getElementById('start-over-btn');
  
  // Clear any existing event listeners
  startOverBtn.replaceWith(startOverBtn.cloneNode(true));
  
  // Get the fresh reference and add event listener
  const freshStartOverBtn = document.getElementById('start-over-btn');
  freshStartOverBtn.addEventListener('click', () => {
    returnToHomeScreen();
  });
  
  // Make sure the button is visible
  freshStartOverBtn.classList.remove('hidden');
}

/**
 * Return to the home/welcome screen
 */
function returnToHomeScreen() {
  // Clear inactivity timer
  clearInactivityTimer();
  
  // Hide any timeout warning
  hideTimeoutWarning();
  
  // Show welcome screen
  elements.phoneScreen.classList.add('active');
  elements.cameraScreen.classList.remove('active');
  elements.resultScreen.classList.remove('active');
  
  // Clear current image data
  state.currentImageUrl = '';
  
  // Reset UI elements
  const qrContainer = document.getElementById('qr-code-container');
  qrContainer.innerHTML = '';
  elements.statusMessageElement.textContent = '';
  
  // Refresh page to ensure clean state
  setTimeout(() => {
    console.log('Refreshing page to ensure clean state');
    window.location.reload();
  }, 300);
}

/**
 * Reset the inactivity timer
 */
function resetInactivityTimer() {
  // Clear existing timer
  clearInactivityTimer();
  
  // Hide any existing timeout warning
  hideTimeoutWarning();
  
  // Set a new timer
  inactivityTimer = setTimeout(() => {
    showTimeoutWarning(30);
  }, INACTIVITY_TIMEOUT - 30000); // Show warning 30 seconds before timeout
  
  // Add event listeners to reset the timer on user interaction
  document.addEventListener('touchstart', resetInactivityTimer);
  document.addEventListener('mousedown', resetInactivityTimer);
  document.addEventListener('keydown', resetInactivityTimer);
}

/**
 * Clear the inactivity timer and remove event listeners
 */
function clearInactivityTimer() {
  clearTimeout(inactivityTimer);
  document.removeEventListener('touchstart', resetInactivityTimer);
  document.removeEventListener('mousedown', resetInactivityTimer);
  document.removeEventListener('keydown', resetInactivityTimer);
}

/**
 * Show a timeout warning with countdown
 * @param {number} seconds - Seconds until timeout
 */
function showTimeoutWarning(seconds) {
  // Hide any existing warning
  hideTimeoutWarning();
  
  // Create timeout warning element
  timeoutWarningElement = document.createElement('div');
  timeoutWarningElement.className = 'timeout-warning';
  timeoutWarningElement.innerHTML = `
    <i class="fas fa-clock"></i>
    <span>Returning to home screen in ${seconds} seconds due to inactivity</span>
    <div class="timeout-progress"><div class="timeout-progress-bar"></div></div>
  `;
  document.body.appendChild(timeoutWarningElement);
  
  // Animate progress bar
  const progressBar = timeoutWarningElement.querySelector('.timeout-progress-bar');
  progressBar.style.width = '100%';
  setTimeout(() => {
    progressBar.style.width = '0%';
  }, 50);
  
  isTimeoutWarningVisible = true;
  
  // Start countdown
  let remainingSeconds = seconds;
  const countdownInterval = setInterval(() => {
    remainingSeconds--;
    
    if (timeoutWarningElement) {
      timeoutWarningElement.querySelector('span').textContent = `Returning to home screen in ${remainingSeconds} seconds due to inactivity`;
    }
    
    if (remainingSeconds <= 0) {
      clearInterval(countdownInterval);
      hideTimeoutWarning();
      returnToHomeScreen();
    }
  }, 1000);
  
  // Store interval ID in the element for later cleanup
  timeoutWarningElement.countdownInterval = countdownInterval;
}

/**
 * Hide the timeout warning
 */
function hideTimeoutWarning() {
  if (timeoutWarningElement) {
    clearInterval(timeoutWarningElement.countdownInterval);
    timeoutWarningElement.remove();
    timeoutWarningElement = null;
    isTimeoutWarningVisible = false;
  }
}

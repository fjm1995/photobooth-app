// Utilities module - common helper functions

import { elements } from './domElements.js';

/**
 * Format phone number as (123) 456-7890
 * @param {Event} event - Input event
 */
export function formatPhoneNumber(event) {
  const input = event.target;
  let value = input.value.replace(/\D/g, '');
  
  input.value = formatPhoneNumberValue(value);
}

/**
 * Format phone number string value
 * @param {string} value - Raw phone number digits
 * @returns {string} - Formatted phone number
 */
export function formatPhoneNumberValue(value) {
  if (value.length > 0) {
    if (value.length <= 3) {
      return `(${value}`;
    } else if (value.length <= 6) {
      return `(${value.slice(0, 3)}) ${value.slice(3)}`;
    } else {
      return `(${value.slice(0, 3)}) ${value.slice(3, 6)}-${value.slice(6, 10)}`;
    }
  }
  return value;
}

/**
 * Format phone number for display
 * @param {string} phoneNumber - Phone number to format
 * @returns {string} - Formatted phone number
 */
export function formatPhoneNumberForDisplay(phoneNumber) {
  if (!phoneNumber) return 'Unknown';
  
  // Remove non-digits
  const digits = phoneNumber.replace(/\D/g, '');
  
  // Format as (123) 456-7890
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  
  return phoneNumber;
}

/**
 * Format date for display
 * @param {string} dateString - ISO date string
 * @returns {string} - Formatted date and time
 */
export function formatDate(dateString) {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (error) {
    return 'Unknown date';
  }
}

/**
 * Show error message
 * @param {string} message - Error message to display
 */
export function showError(message) {
  // Suppress specific error messages that are handled automatically
  if (message === 'Camera stream connection error. Restarting camera services...' ||
      message === 'Camera stream connection error. Retrying...' ||
      message.includes('Camera stream connection error')) {
    
    // Check if we're in retry mode
    const state = window.state || {};
    if (state.inStreamRetryMode) {
      console.log('Suppressing camera stream error message during auto-recovery');
      return;
    }
  }
  
  elements.errorMessageElement.textContent = message;
  elements.errorModal.classList.remove('hidden');
  
  // Clear any countdown if active
  if (window.resetCountdown) {
    window.resetCountdown();
  }
}

/**
 * Create a loading spinner element
 * @param {string} message - Loading message
 * @returns {HTMLElement} - Loading indicator element
 */
export function createLoadingIndicator(message = 'Loading...') {
  const loadingIndicator = document.createElement('div');
  loadingIndicator.className = 'loading-indicator';
  loadingIndicator.innerHTML = `
    <div class="loading-spinner">
      <i class="fas fa-spinner fa-spin"></i>
      <p>${message}</p>
    </div>
  `;
  return loadingIndicator;
}

/**
 * Update button state - ensuring the continue button is always enabled
 * @returns {boolean} - Always returns true
 */
export function updateContinueButton() {
  // Always enable the continue button since we're not validating phone numbers anymore
  elements.continueBtn.disabled = false;
  elements.continueBtn.classList.remove('disabled');
  
  return true;
}

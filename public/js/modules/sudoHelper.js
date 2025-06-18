/**
 * Sudo Helper Module
 * Provides utilities for handling sudo-related operations for camera reset
 */

import { elements } from './domElements.js';
import { showError } from './utils.js';

// Keep track of whether we've shown the instructions
let sudoInstructionsShown = false;

/**
 * Show sudo setup instructions modal
 * @param {string} errorMessage - Optional error message to display
 */
export function showSudoInstructions(errorMessage = null) {
  // If we already showed the instructions once in this session, just show a brief error
  if (sudoInstructionsShown) {
    showError('Camera reset requires sudo privileges. Run the setup script to enable passwordless sudo for camera operations.');
    return;
  }
  
  // Create modal element if it doesn't exist
  let sudoModal = document.getElementById('sudo-modal');
  
  if (!sudoModal) {
    sudoModal = document.createElement('div');
    sudoModal.id = 'sudo-modal';
    sudoModal.className = 'modal';
    
    const modalContent = `
      <div class="modal-content">
        <div class="modal-header">
          <h2>Camera Reset Permission Required</h2>
          <button id="close-sudo-x" class="close-modal">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body">
          <div class="sudo-instructions">
            <p class="error-message">${errorMessage || 'Full camera reset functionality requires sudo access for kernel module operations.'}</p>
            
            <div class="instruction-section">
              <h3>Why is sudo needed?</h3>
              <p>The camera reset function needs to reload the v4l2loopback kernel module to fully reset the camera device. This requires sudo privileges.</p>
            </div>
            
            <div class="instruction-section">
              <h3>How to set up passwordless sudo:</h3>
              <ol>
                <li>Open a terminal window</li>
                <li>Run the following command:
                  <pre><code>sudo bash /Users/fjm/Documents/augment-projects/photobooth/scripts/setup-camera-sudo.sh</code></pre>
                </li>
                <li>Enter your password when prompted</li>
                <li>The script will set up passwordless sudo for the specific camera reset commands only</li>
              </ol>
            </div>
            
            <div class="sudo-notes">
              <p><strong>Note:</strong> This only grants sudo access to specific commands needed for camera operations, not unlimited sudo access.</p>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button id="close-sudo-modal" class="btn primary">I understand</button>
        </div>
      </div>
    `;
    
    sudoModal.innerHTML = modalContent;
    document.body.appendChild(sudoModal);
    
    // Add event listeners for closing the modal
    const closeButton = document.getElementById('close-sudo-modal');
    const closeX = document.getElementById('close-sudo-x');
    
    closeButton.addEventListener('click', () => {
      sudoModal.classList.add('hidden');
    });
    
    closeX.addEventListener('click', () => {
      sudoModal.classList.add('hidden');
    });
  } else {
    // Update error message if modal already exists
    const errorElement = sudoModal.querySelector('.error-message');
    if (errorElement && errorMessage) {
      errorElement.textContent = errorMessage;
    }
    
    // Make sure the modal is not hidden
    sudoModal.classList.remove('hidden');
  }
  
  // Mark that we've shown the instructions
  sudoInstructionsShown = true;
}

/**
 * Check if sudo is available for camera operations
 * @returns {Promise<boolean>} - Whether sudo is available
 */
export async function checkSudoAvailable() {
  try {
    // Make a request to check sudo status
    const response = await fetch('/api/camera/check-sudo');
    const data = await response.json();
    
    return data.success && data.sudoAvailable;
  } catch (error) {
    console.error('Error checking sudo availability:', error);
    return false;
  }
}

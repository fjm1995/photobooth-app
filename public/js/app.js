// Main Application Entry Point

// Import modules
import { elements } from './modules/domElements.js';
import state from './modules/state.js';
import * as utils from './modules/utils.js';
import * as settings from './modules/settings.js';
import * as cameraManager from './modules/cameraManager.js';
import * as dslrCamera from './modules/dslrCamera.js';
import * as browserCamera from './modules/browserCamera.js';
import * as notificationService from './modules/notificationService.js';
import * as uiController from './modules/uiController.js';
import * as debugTools from './modules/debugTools.js';

// Debug mode variables
let isDebugMode = false;
let debugOverlay = null;

// Fetch configuration from server
async function fetchConfig() {
  try {
    const response = await fetch('/api/config');
    
    if (response.ok) {
      const config = await response.json();
      console.log('Server config loaded:', config);
      
      // Set debug mode based on server configuration
      isDebugMode = config.debug;
      
      if (isDebugMode) {
        console.log('Debug mode enabled via server configuration');
      }
      
      // Make settings available globally for other modules
      window.photoboothSettings = window.photoboothSettings || {};
      window.photoboothSettings.logoSizePercent = config.logoSizePercent || 11.2;
      console.log('Logo size percent set from server:', window.photoboothSettings.logoSizePercent);
    } else {
      console.warn('Failed to load server configuration, using defaults');
    }
  } catch (error) {
    console.error('Error fetching configuration:', error);
  }
}

/**
 * Initialize the application
 */
async function initApp() {
  try {
    console.log('Initializing photobooth application...');
    
    // Initialize debugging based on environment config
    const debug = debugTools.initializeDebugMode(isDebugMode);
    
    // Log initialization if debug is enabled
    debug.log('Application starting');
    
    // Load app settings from localStorage
    settings.loadAppSettings();
    
    // Set up event listeners for UI interactions
    uiController.setupEventListeners();
    
    // Set up camera event listeners
    elements.mirrorPreviewToggle.addEventListener('change', settings.updateMirrorPreview);
    elements.saveSettingsBtn.addEventListener('click', saveSettings);
    elements.restartCameraBtn.addEventListener('click', cameraManager.restartCamera);
    
    // Initialize camera
    debug.log('Initializing camera...');
    await cameraManager.initCamera();
    
    // Load photo history from localStorage
    settings.loadPhotoHistory();
    notificationService.updatePhotoHistoryUI();
    
    // Check camera status periodically, but less frequently to reduce log spam
    const statusCheckInterval = isDebugMode ? 10000 : 5000; // 10 seconds in debug mode, 5 seconds otherwise
    console.log(`Setting camera status check interval to ${statusCheckInterval}ms`);
    
    // Store reference to interval in state for potential cleanup
    state.cameraStatusInterval = setInterval(() => {
      // Only perform status check if we're not currently in an active capture
      if (!state.isCapturing) {
        cameraManager.checkCameraStatus();
      }
    }, statusCheckInterval);
    
    // Disable continue button initially
    utils.updateContinueButton();
    
    // Show phone screen initially
    uiController.showPhoneScreen();
    
    console.log('Application initialized successfully');
    debug.log('Application initialized successfully');
  } catch (error) {
    utils.showError(`Error initializing app: ${error.message}`);
    console.error('Error initializing app:', error);
  }
}

/**
 * Save settings to localStorage
 */
async function saveSettings() {
  try {
    // Save settings to localStorage
    settings.saveAppSettings();
    
    // Apply mirror preview setting
    settings.updateMirrorPreview();
    
    // Hide admin modal
    elements.adminModal.classList.add('hidden');
    
    // Show success message - use the showError function (which is really a generic notification)
    utils.showError('Settings saved successfully');
  } catch (error) {
    utils.showError(`Error saving settings: ${error.message}`);
    console.error('Error saving settings:', error);
  }
}

// Initialize the app when the DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  // First fetch configuration from server
  await fetchConfig();
  
  // Then initialize the application
  await initApp();
});

// Settings module - manages application settings

import state from './state.js';
import { elements } from './domElements.js';

/**
 * Load application settings from localStorage
 */
export function loadAppSettings() {
  try {
    const savedSettings = localStorage.getItem('appSettings');
    if (savedSettings) {
      state.appSettings = JSON.parse(savedSettings);
      
      // Apply saved settings to UI
      elements.imageQualitySelect.value = state.appSettings.imageQuality || 'medium';
      elements.flashModeSelect.value = state.appSettings.flashMode || 'auto';
      elements.autoFocusToggle.checked = state.appSettings.autoFocus !== false; // Default to true
      elements.mirrorPreviewToggle.checked = state.appSettings.mirrorPreview === true; // Default to false
      
      // Apply mirror preview setting
      updateMirrorPreview();
      
      console.log('Loaded app settings from localStorage:', state.appSettings);
    }
  } catch (error) {
    console.error('Error loading app settings:', error);
  }
}

/**
 * Save application settings to localStorage
 */
export function saveAppSettings() {
  try {
    // Update app settings object from UI
    state.appSettings = {
      imageQuality: elements.imageQualitySelect.value,
      flashMode: elements.flashModeSelect.value,
      autoFocus: elements.autoFocusToggle.checked,
      mirrorPreview: elements.mirrorPreviewToggle.checked
    };
    
    // Save to localStorage
    localStorage.setItem('appSettings', JSON.stringify(state.appSettings));
    console.log('Saved app settings to localStorage:', state.appSettings);
  } catch (error) {
    console.error('Error saving app settings:', error);
  }
}

/**
 * Update mirror preview setting for camera elements
 */
export function updateMirrorPreview() {
  if (elements.mirrorPreviewToggle.checked) {
    elements.cameraPreview.style.transform = 'scaleX(-1)';
    elements.cameraPreviewImg.style.transform = 'scaleX(-1)';
  } else {
    elements.cameraPreview.style.transform = 'none';
    elements.cameraPreviewImg.style.transform = 'none';
  }
}

/**
 * Load photo history from localStorage
 */
export function loadPhotoHistory() {
  try {
    const savedHistory = localStorage.getItem('photoHistory');
    if (savedHistory) {
      state.photoHistory = JSON.parse(savedHistory);
    }
  } catch (error) {
    console.error('Error loading photo history:', error);
  }
}

/**
 * Save photo history to localStorage
 */
export function savePhotoHistory() {
  try {
    localStorage.setItem('photoHistory', JSON.stringify(state.photoHistory));
  } catch (error) {
    console.error('Error saving photo history:', error);
  }
}

/**
 * Reset settings to defaults
 */
export function resetSettings() {
  // Reset application settings
  elements.imageQualitySelect.value = 'medium';
  elements.flashModeSelect.value = 'auto';
  elements.autoFocusToggle.checked = true;
  elements.mirrorPreviewToggle.checked = false;
  
  // Reset DSLR settings if available
  if (state.cameraType === 'dslr') {
    elements.apertureSelect.value = '';
    elements.shutterSpeedSelect.value = '';
    elements.isoSelect.value = '';
    elements.whiteBalanceSelect.value = '';
  }
  
  // Apply mirror preview setting
  updateMirrorPreview();
  
  // Save the reset settings to localStorage
  saveAppSettings();
}

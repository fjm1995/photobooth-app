// DOM Elements module - centralized access to DOM elements

/**
 * Cache DOM elements to avoid repeated querySelector calls
 */
export const elements = {
  // Main screens
  phoneScreen: document.getElementById('phone-screen'),
  cameraScreen: document.getElementById('camera-screen'),
  resultScreen: document.getElementById('result-screen'),
  
  // Phone screen elements
  continueBtn: document.getElementById('continue-btn'),
  // phoneNumberInput element removed as it does not exist in the HTML anymore
  
  // Camera screen elements
  cameraPreview: document.getElementById('camera-preview'),
  cameraPreviewImg: document.getElementById('camera-preview-img'),
  takePictureBtn: document.getElementById('take-picture'),
  backToPhoneBtn: document.getElementById('back-to-phone'),
  countdownElement: document.getElementById('countdown'),
  flashElement: document.getElementById('flash'),
  countdownButtons: document.querySelectorAll('.countdown-btn'),
  
  // Result screen elements
  capturedImageElement: document.getElementById('captured-image'),
  statusMessageElement: document.getElementById('status-message'),
  startOverBtn: document.getElementById('start-over-btn'),
  qrCodeContainer: document.getElementById('qr-code-container'),
  resultActions: document.querySelector('.result-actions'),
  
  // Admin modal elements
  adminModal: document.getElementById('admin-modal'),
  closeAdminX: document.getElementById('close-admin-x'),
  saveSettingsBtn: document.getElementById('save-settings'),
  resetSettingsBtn: document.getElementById('reset-settings'),
  restartCameraBtn: document.getElementById('restart-camera'),
  adminSettingsBtn: document.getElementById('admin-settings'),
  
  // Camera settings
  imageQualitySelect: document.getElementById('image-quality'),
  flashModeSelect: document.getElementById('flash-mode'),
  autoFocusToggle: document.getElementById('auto-focus'),
  mirrorPreviewToggle: document.getElementById('mirror-preview'),
  
  // History modal elements
  historyModal: document.getElementById('history-modal'),
  closeHistoryX: document.getElementById('close-history-x'),
  closeHistoryBtn: document.getElementById('close-history'),
  photoHistoryContainer: document.getElementById('photo-history'),
  
  // Error modal elements
  errorModal: document.getElementById('error-modal'),
  closeErrorX: document.getElementById('close-error-x'),
  closeErrorBtn: document.getElementById('close-error'),
  errorMessageElement: document.getElementById('error-message')
};

// State module - manages application state

/**
 * Application state object
 */
const state = {
  // Camera state
  cameraType: null, // 'dslr', 'webcam', 'browser'
  cameraModel: null,
  stream: null, // MediaStream for browser camera
  previewInterval: null, // Interval for DSLR preview
  countdownInterval: null, // Interval for countdown
  isDSLRPreviewMode: false,
  streamRetryTimer: null, // Timer for retrying stream connections
  inStreamRetryMode: false, // Flag to indicate we're in stream retry mode
  
  // Photo state
  currentImageUrl: null,
  currentPhoneNumber: null,
  
  // Settings
  countdownSeconds: 5, // Default countdown time
  appSettings: {
    imageQuality: 'medium',
    flashMode: 'auto',
    autoFocus: true,
    mirrorPreview: false
  },
  
  // DSLR specific settings
  dslrSettings: {
    aperture: '',
    shutterSpeed: '',
    iso: '',
    whiteBalance: ''
  },
  
  // Photo history
  photoHistory: []
};

export default state;

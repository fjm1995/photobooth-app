/**
 * Camera Controller Index
 * Exports all camera controller functionality as a unified API
 */
const streamController = require('./stream-controller');
const captureController = require('./capture-controller');
const statusController = require('./status-controller');

// Export all controller functions
module.exports = {
  // Stream-related endpoints
  streamCamera: streamController.streamCamera,
  getDSLRPreview: streamController.getDSLRPreview,
  getMjpegStream: streamController.getMjpegStream,
  getBrowserCamera: streamController.getBrowserCamera,
  
  // Capture-related endpoints
  capturePhoto: captureController.capturePhoto,
  
  // Status and setup-related endpoints
  checkCameraStatus: statusController.checkCameraStatus,
  getCameraSetupInstructions: statusController.getCameraSetupInstructions,
  restartCameraServices: statusController.restartCameraServices
};

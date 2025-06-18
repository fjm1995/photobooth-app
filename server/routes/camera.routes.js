/**
 * Camera Routes for Linux / Canon Cameras
 * Focused on v4l2 approach for Linux
 */
const express = require('express');
const router = express.Router();

// Import controller
const cameraController = require('../controllers/camera.controller');

// Fallback handler for any undefined controller methods
const fallbackHandler = (req, res) => {
  console.warn(`Warning: Route handler not properly defined for ${req.path}`);
  res.status(503).json({
    success: false,
    message: 'This feature is temporarily unavailable'
  });
};

// Camera routes with safeguards for undefined methods
router.get('/stream', cameraController.streamCamera || fallbackHandler);
router.get('/preview', cameraController.getDSLRPreview || fallbackHandler);
router.post('/capture', cameraController.capturePhoto || fallbackHandler);
router.get('/status', cameraController.checkCameraStatus || fallbackHandler);
router.get('/setup-instructions', cameraController.getCameraSetupInstructions || fallbackHandler);
router.post('/restart', cameraController.restartCameraServices || fallbackHandler);
router.get('/browser', cameraController.getBrowserCamera || fallbackHandler);
router.get('/mjpeg-stream', cameraController.getMjpegStream || fallbackHandler);

module.exports = router;

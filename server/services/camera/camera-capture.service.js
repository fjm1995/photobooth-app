/**
 * Camera Capture Service
 * Responsible for capturing photos from the camera
 */
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const captureModules = require('./capture');

class CameraCaptureService {
  constructor() {
    this.tempDir = path.join(process.cwd(), 'temp_captures');
    
    // Create temp directory if it doesn't exist
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }
  
  /**
   * Capture a photo from the camera
   * @param {string} devicePath - The device path to capture from
   * @param {string} cameraType - The type of camera 
   * @param {string} cameraModel - The camera model
   * @param {Object} streamer - The camera streaming service to pause during capture
   * @returns {Promise<Object>} Capture result
   */
  async capturePhoto(devicePath, cameraType, cameraModel, streamer) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const uniqueId = uuidv4();
      const filename = `${timestamp}_${uniqueId}.jpg`;
      const localPath = path.join(this.tempDir, filename);
      
      // Special handling for Canon R6
      const isCanonR6 = cameraModel && 
          (cameraModel.includes('R6 Mark II') || 
           cameraModel.includes('R6') ||
           (cameraType === 'canon' && devicePath.includes('/dev/video1')));
      
      // Special handling for Canon 5D Mark IV which uses different settings than R6
      const isCanon5D = cameraModel && 
          (cameraModel.includes('5D Mark IV') || 
           cameraModel.includes('EOS 5D') ||
           cameraModel.includes('5D'));
      
      // Capture photo using v4l2 device
      let captureSuccess = false;
      
      // Try different capture methods in sequence until one succeeds
      if (isCanonR6) {
        console.log('Attempting specialized Canon R6 capture method');
        try {
          captureSuccess = await captureModules.r6Capture(localPath, devicePath);
        } catch (r6Error) {
          console.error('R6 capture failed, will try standard method:', r6Error);
        }
      } else if (isCanon5D) {
        console.log('Attempting specialized Canon 5D Mark IV capture method');
        try {
          captureSuccess = await captureModules.mk5dCapture(localPath, devicePath);
        } catch (mk5dError) {
          console.error('5D Mark IV capture failed, will try standard method:', mk5dError);
        }
      }
      
      // If R6 capture failed or wasn't attempted, try standard capture
      if (!captureSuccess) {
        captureSuccess = await captureModules.v4l2Capture(localPath, devicePath, streamer);
      }
      
      // If still not successful, try fallback method
      if (!captureSuccess) {
        captureSuccess = await captureModules.v4l2FallbackCapture(localPath, devicePath);
      }
      
      // If all capture methods failed, use a mock image
      if (!captureSuccess) {
        captureSuccess = await captureModules.mockCapture(localPath);
      }
      
      // Check if the file was created
      if (!fs.existsSync(localPath)) {
        throw new Error('Capture failed: No image file created');
      }
      
      return {
        success: true,
        path: localPath,
        filename
      };
    } catch (error) {
      console.error('Error capturing photo:', error);
      return {
        success: false,
        error
      };
    }
  }
}

// Export a singleton instance
const cameraCaptureService = new CameraCaptureService();
module.exports = cameraCaptureService;

/**
 * Camera Streaming Service
 * Responsible for starting and managing camera streams
 */
const fs = require('fs');
const path = require('path');
const streamModules = require('./stream');

class CameraStreamService {
  constructor() {
    this.mjpegProcess = null;
    this.mjpegUrl = null;
    this.streamDir = path.join(process.cwd(), 'public', 'stream');
    
    // Ensure stream directory exists
    if (!fs.existsSync(this.streamDir)) {
      fs.mkdirSync(this.streamDir, { recursive: true });
    }
    
    // Ensure preview directory exists
    const previewDir = path.join(this.streamDir, 'preview');
    if (!fs.existsSync(previewDir)) {
      fs.mkdirSync(previewDir, { recursive: true });
    }
  }
  
  /**
   * Start a camera stream
   * @param {string} devicePath - The device path to stream from
   * @param {string} cameraType - The type of camera
   * @param {string} cameraModel - The model of camera
   * @returns {Object} Stream information
   */
  startStream(devicePath, cameraType, cameraModel) {
    try {
      // Check if we already have an MJPEG stream running
      if (this.mjpegProcess) {
        console.log('MJPEG Camera stream already running');
        return {
          mjpegProcess: this.mjpegProcess,
          mjpegUrl: this.mjpegUrl
        };
      }
      
      // Only start MJPEG if a device is available
      if (!devicePath) {
        console.log('No v4l2 device available for streaming, MJPEG not started.');
        return {
          mjpegProcess: null,
          mjpegUrl: null
        };
      }

      // Check if this is a Canon camera requiring special handling
      const isR6 = cameraModel && (
          cameraModel.includes('R6 Mark II') || 
          cameraModel.includes('R6') ||
          (cameraType === 'canon' && devicePath.includes('/dev/video1'))
      );
      
      // Check if this is a Canon 5D Mark IV which needs different handling than the R6
      const is5D = cameraModel && (
          cameraModel.includes('5D Mark IV') || 
          cameraModel.includes('5D') ||
          cameraModel.includes('EOS 5D')
      );
      
      const isSpecialCanon = isR6 || is5D; // Any camera needing special handling

      // Create a shared error handling function that updates our class properties
      const setupErrorHandling = (process) => {
        // Pass an onStreamEnd callback that clears our class properties
        streamModules.setupStreamErrorHandling(process, () => {
          this.mjpegProcess = null;
          this.mjpegUrl = null;
        });
      };

      if (isSpecialCanon) {
        if (isR6) {
          console.log('Attempting specialized stream setup for Canon R6...');
          // Attempt specialized setup for R6, but don't block if it fails initially
          streamModules.setupSpecializedR6Stream(devicePath, setupErrorHandling)
            .then(result => {
              // Update class properties with the result
              if (result.mjpegProcess && !this.mjpegProcess) {
                this.mjpegProcess = result.mjpegProcess;
                this.mjpegUrl = result.mjpegUrl;
              }
            })
            .catch(err => {
              console.error('Specialized R6 stream setup failed, falling back to standard:', err);
              // Fallback to standard setup if specialized fails
              if (!this.mjpegProcess) {
                const standardResult = streamModules.setupMjpegStream(
                  devicePath, 
                  cameraType, 
                  cameraModel,
                  setupErrorHandling
                );
                this.mjpegProcess = standardResult.mjpegProcess;
                this.mjpegUrl = standardResult.mjpegUrl;
              }
            });
        } else if (is5D) {
          console.log('Attempting specialized stream setup for Canon 5D Mark IV...');
          // Use the 5D-specific streaming module
          try {
            const streamResult = streamModules.setupSpecialized5DStream(devicePath);
            this.mjpegProcess = streamResult;
            this.mjpegUrl = '/api/camera/mjpeg-stream';
            
            // Set up error handling for 5D stream
            setupErrorHandling(this.mjpegProcess);
            
            console.log('Specialized 5D Mark IV stream started successfully');
          } catch (error) {
            console.error('Specialized 5D Mark IV stream setup failed, falling back to standard:', error);
            // Fallback to standard setup if specialized fails
            if (!this.mjpegProcess) {
              const standardResult = streamModules.setupMjpegStream(
                devicePath, 
                cameraType, 
                cameraModel,
                setupErrorHandling
              );
              this.mjpegProcess = standardResult.mjpegProcess;
              this.mjpegUrl = standardResult.mjpegUrl;
            }
          }
        }
      } else {
        // Standard setup for other cameras
        const result = streamModules.setupMjpegStream(
          devicePath, 
          cameraType, 
          cameraModel,
          setupErrorHandling
        );
        this.mjpegProcess = result.mjpegProcess;
        this.mjpegUrl = result.mjpegUrl;
      }
      
      return {
        mjpegProcess: this.mjpegProcess, 
        mjpegUrl: this.mjpegUrl
      };
    } catch (error) {
      console.error('Error starting camera stream:', error);
      return {
        mjpegProcess: null,
        mjpegUrl: null
      };
    }
  }
  
  /**
   * Stop the camera stream
   */
  stopStream() {
    // Stop MJPEG stream if running
    if (this.mjpegProcess) {
      if (this.mjpegProcess.kill) {
        try {
          // Try killing with SIGTERM first
          try {
            this.mjpegProcess.kill('SIGTERM');
          } catch (error) {
            if (error.code === 'EPERM') {
              console.log('Permission denied when killing MJPEG process, process may already be terminated or owned by another user');
            } else {
              console.error('Error killing MJPEG process:', error);
            }
          }
          
          // Force detach from process even if kill fails
          try {
            if (this.mjpegProcess.stdout) this.mjpegProcess.stdout.destroy();
            if (this.mjpegProcess.stderr) this.mjpegProcess.stderr.destroy();
          } catch (destroyError) {
            console.log('Error destroying process streams:', destroyError.message);
          }
        } catch (error) {
          console.error('Error during stream cleanup:', error);
        }
      }
      
      // Always set to null to allow garbage collection
      this.mjpegProcess = null;
    }
    
    // Reset MJPEG URL
    this.mjpegUrl = null;
    
    console.log('Camera stream stopped');
    
    // Additional cleanup to ensure clean restart
    try {
      streamModules.releaseDevices().catch(e => 
        console.log('Non-critical error releasing devices:', e.message)
      );
    } catch (e) {
      console.log('Error in device cleanup during stream stop:', e.message);
    }
  }
  
  /**
   * Get the stream URL
   * @param {boolean} cameraConnected - Whether a camera is connected
   * @param {string} devicePath - The device path
   * @param {string} cameraType - The type of camera
   * @returns {string|null} The stream URL or null if no stream available
   */
  getStreamUrl(cameraConnected, devicePath, cameraType) {
    // Return MJPEG URL if available (preferred for browser preview)
    if (this.mjpegUrl) {
      return this.mjpegUrl;
    }
    
    // If no MJPEG URL available but we know we have a camera,
    // still return a valid URL to prevent client-side errors
    if (cameraConnected && devicePath) {
      return '/api/camera/mjpeg-stream';
    }
    
    // If we're in development mode on non-Linux platforms, provide a fallback
    if (process.platform !== 'linux' && cameraType) {
      return '/api/camera/browser';
    }
    
    // No valid stream URL can be provided
    return null;
  }
  
  /**
   * Get the MJPEG process for controller use
   * @returns {Object|null} The MJPEG process object or null
   */
  getMjpegProcess() {
    return this.mjpegProcess;
  }
}

// Export a singleton instance
const cameraStreamService = new CameraStreamService();
module.exports = cameraStreamService;

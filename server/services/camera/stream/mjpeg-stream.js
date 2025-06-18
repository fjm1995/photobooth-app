/**
 * MJPEG Stream Setup Module
 * Handles the setup of standard MJPEG video streams
 */
const { spawn } = require('child_process');

/**
 * Set up MJPEG stream for browser-compatible real-time preview
 * @param {string} devicePath - The device path to stream from
 * @param {string} cameraType - The type of camera
 * @param {string} cameraModel - The model of camera
 * @param {Function} setupErrorHandling - Function to setup stream error handling
 * @returns {Object} The MJPEG process and URL
 */
function setupMjpegStream(devicePath, cameraType, cameraModel, setupErrorHandling) {
  try {
    if (!devicePath) {
      console.log('No v4l2 device available for MJPEG streaming');
      return { mjpegProcess: null, mjpegUrl: null };
    }
    
    console.log(`Starting MJPEG stream from ${devicePath}`);
    
    // Check if this is a Canon EOS R6 Mark II (can be determined from cameraModel)
    const isSpecialCanon = cameraModel && 
        (cameraModel.includes('R6 Mark II') || 
         (cameraType === 'canon' && devicePath.includes('/dev/video1')));
    
    // MJPEG-specific ffmpeg args for low-latency browser streaming
    const mjpegArgs = [
      '-f', 'v4l2',                       // Input format is v4l2
      '-framerate', '15',                 // Request 15fps
      '-video_size', '640x480',           // Use a common resolution that most cameras support
    ];
    
    // Add special handling for Canon cameras with separate output/capture devices
    if (isSpecialCanon) {
      mjpegArgs.push('-input_format', 'mjpeg'); // Force MJPEG input for better compatibility
    }

    // Add the actual device to use
    mjpegArgs.push('-i', devicePath);

    // Add output parameters
    mjpegArgs.push(
      '-c:v', 'mjpeg',                    // MJPEG codec for output
      '-q:v', '5',                        // Quality (1-31, lower is better)
      '-f', 'mpjpeg',                     // MJPEG format
      '-r', '15',                         // Output frame rate
      '-'                                 // Output to stdout
    );
    
    // Start the MJPEG process with appropriate configuration
    const mjpegProcess = spawn('ffmpeg', mjpegArgs);
    const mjpegUrl = '/api/camera/mjpeg-stream';
    
    // Set up error handling for the MJPEG process
    if (setupErrorHandling) {
      setupErrorHandling(mjpegProcess);
    }
    
    console.log('MJPEG stream started successfully');
    
    return { mjpegProcess, mjpegUrl };
  } catch (error) {
    console.error('Error setting up MJPEG stream:', error);
    return { mjpegProcess: null, mjpegUrl: null };
  }
}

module.exports = setupMjpegStream;

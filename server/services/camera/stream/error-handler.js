/**
 * Stream Error Handler Module
 * Provides error handling functionality for camera stream processes
 */

/**
 * Setup error handling for stream processes
 * @param {Object} streamProcess - The stream process to monitor
 * @param {Function} onStreamEnd - Optional callback to be called when stream ends
 * @returns {void}
 */
function setupStreamErrorHandling(streamProcess, onStreamEnd) {
  if (!streamProcess) return;
  
  // Capture stderr to check for device errors
  let errorOutput = '';
  streamProcess.stderr.on('data', (data) => {
    const output = data.toString();
    errorOutput += output;
    
    // Check for specific device errors that indicate the device is no longer available
    if (output.includes('No such device') || output.includes('Device or resource busy')) {
      console.error(`Stream device error: ${output.trim()}`);
      
      // Kill the process early since we know it's going to fail
      try {
        streamProcess.kill('SIGTERM');
      } catch (e) {
        // Ignore kill errors
      }
      
      // Call onStreamEnd callback if provided
      if (onStreamEnd) {
        onStreamEnd();
      }
    }
    // If we get "Not a video capture device" error, log for troubleshooting
    else if (output.includes('Not a video capture device')) {
      console.log('Device is not a video capture device, might be a video output device.');
      
      // Kill the current process - it's going to fail
      try {
        streamProcess.kill('SIGTERM');
      } catch (e) {
        // Ignore kill errors
      }
      
      // Call onStreamEnd callback if provided
      if (onStreamEnd) {
        onStreamEnd();
      }
    }
  });
  
  streamProcess.on('error', (error) => {
    console.error('Error with stream process:', error);
    
    // Call onStreamEnd callback if provided
    if (onStreamEnd) {
      onStreamEnd();
    }
  });
  
  streamProcess.on('close', (code) => {
    console.log(`Stream process exited with code ${code}`);
    
    // Call onStreamEnd callback if provided
    if (onStreamEnd) {
      onStreamEnd();
    }
  });
}

module.exports = setupStreamErrorHandling;

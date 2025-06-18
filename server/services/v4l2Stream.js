/**
 * Simplified v4l2 streaming service
 * Focused exclusively on Linux and Canon cameras
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

/**
 * Find available v4l2 devices
 * @returns {Promise<string[]>} Array of available v4l2 device paths
 */
async function findAvailableV4L2Devices() {
  return new Promise((resolve) => {
    try {
      if (process.platform !== 'linux') {
        // On non-Linux platforms, return a mock device for development
        resolve(['/dev/video0']);
        return;
      }
      
      // Check if /dev/video* devices exist
      const { exec } = require('child_process');
      exec('ls -la /dev/video*', (error, stdout, stderr) => {
        if (error) {
          console.warn('Error checking video devices:', error.message);
          resolve([]);
          return;
        }
        
        // Parse the output to extract device paths
        const lines = stdout.split('\n');
        const devices = [];
        
        for (const line of lines) {
          const match = line.match(/\/dev\/video\d+/);
          if (match) {
            devices.push(match[0]);
          }
        }
        
        console.log(`Found ${devices.length} v4l2 devices:`, devices);
        resolve(devices);
      });
    } catch (error) {
      console.error('Error finding v4l2 devices:', error);
      resolve([]);
    }
  });
}

/**
 * Check if verbose logging is enabled
 * @returns {boolean} True if verbose logging is enabled
 */
function isVerboseLogging() {
  return process.env.VERBOSE_LOGGING === 'true';
}

/**
 * Log message if verbose logging is enabled
 * @param {string} message - The message to log
 * @param {*} data - Optional data to log
 */
function verboseLog(message, data = null) {
  if (isVerboseLogging()) {
    if (data) {
      console.log(message, data);
    } else {
      console.log(message);
    }
  }
}

/**
 * Check if a device is either a video capture or video output device that can be used
 * @param {string} devicePath - Path to the v4l2 device
 * @returns {Promise<boolean>} True if it's a usable video device
 */
async function isVideoCaptureDevice(devicePath) {
  return new Promise((resolve) => {
    try {
      if (process.platform !== 'linux') {
        // In development mode, assume it's a usable video device
        resolve(true);
        return;
      }
      
      // Check if the device file exists
      if (!fs.existsSync(devicePath)) {
        resolve(false);
        return;
      }
      
      // Try to check device capabilities with ffmpeg
      const { exec } = require('child_process');
      const testCmd = `ffmpeg -f v4l2 -list_formats all -i ${devicePath}`;
      
      exec(testCmd, (error, stdout, stderr) => {
        // FFmpeg outputs to stderr for device information
        const output = stderr.toString();
        
        // If we see video formats or input/output format information, it's probably a usable device
        // Accept both Video Capture and Video Output capabilities
        if (output.includes('[video4linux2,v4l2') && 
            (
              // Check for capture device indicators
              (output.includes('Capture') || output.includes('Raw') || output.includes('Compressed')) ||
              // Check for output device indicators but not error messages
              (output.includes('Output') && !output.includes('Not a video capture device'))
            )) {
          verboseLog(`Device ${devicePath} is a usable video device`);
          resolve(true);
        } else {
          verboseLog(`Device ${devicePath} is not a usable video device`);
          resolve(false);
        }
      });
    } catch (error) {
      console.error(`Error checking if ${devicePath} is a video capture device:`, error);
      resolve(false);
    }
  });
}

/**
 * Check if a v4l2 device is available for streaming
 * @param {string} devicePath - Path to the v4l2 device
 * @returns {Promise<boolean>} True if the device is valid and usable
 */
async function isDeviceAvailable(devicePath) {
  return new Promise((resolve) => {
    try {
      if (process.platform !== 'linux') {
        // In development mode, assume device is available
        resolve(true);
        return;
      }
      
      // Check if the device file exists
      if (!fs.existsSync(devicePath)) {
        resolve(false);
        return;
      }
      
      // Try to check device capabilities with v4l2-ctl
      const { exec } = require('child_process');
      exec(`v4l2-ctl --device=${devicePath} --all`, (error, stdout, stderr) => {
        if (error) {
          console.warn(`Device ${devicePath} check failed:`, error.message);
          resolve(false);
          return;
        }
        
        // Check if the device supports streaming
        if (stdout.includes('Video Capture') || stdout.includes('Streaming')) {
          resolve(true);
        } else {
          console.warn(`Device ${devicePath} doesn't support streaming`);
          resolve(false);
        }
      });
    } catch (error) {
      console.error(`Error checking device ${devicePath}:`, error);
      resolve(false);
    }
  });
}

/**
 * Start a camera stream using v4l2 device
 * @param {string} v4l2Device - The path to the v4l2 device (e.g., /dev/video0)
 * @param {string} streamDir - Directory to store the stream files
 * @returns {object} Stream process and URL information
 */
async function startV4L2Stream(v4l2Device, streamDir) {
  // Ensure preview directory exists
  const previewDir = path.join(streamDir, 'preview');
  if (!fs.existsSync(previewDir)) {
    fs.mkdirSync(previewDir, { recursive: true });
  }
  
      // Verify the device is available
      const isAvailable = await isDeviceAvailable(v4l2Device);
      if (!isAvailable) {
        console.warn(`Device ${v4l2Device} is not available, looking for alternatives...`);
        const availableDevices = await findAvailableV4L2Devices();
        
        // If there are no video devices at all, use placeholder
        if (availableDevices.length === 0) {
          console.error('No v4l2 devices found, using placeholder stream');
          return startPlaceholderStream(streamDir);
        }
        
        // Check each device to see if it's actually a video capture device
        for (const device of availableDevices) {
          const isVideoCapture = await isVideoCaptureDevice(device);
          if (isVideoCapture) {
            console.log(`Found working video capture device: ${device}`);
            v4l2Device = device;
            break;
          } else {
            console.log(`Device ${device} is not a video capture device, skipping`);
          }
        }
        
        // If we couldn't find a good device, use the first one as a last resort
        if (v4l2Device === null || !await isDeviceAvailable(v4l2Device)) {
          if (availableDevices.length > 0) {
            console.log(`Using first available device as last resort: ${availableDevices[0]}`);
            v4l2Device = availableDevices[0];
          } else {
            console.error('No usable v4l2 devices found, using placeholder stream');
            return startPlaceholderStream(streamDir);
          }
        }
      }
  
  console.log(`Starting stream using v4l2 device: ${v4l2Device}`);
  
  // Optimized ffmpeg command for both HLS and MJPEG streaming
  // Don't specify input_format to let ffmpeg auto-detect the format
  const ffmpegArgs = [
    '-f', 'v4l2',                       // Input format is v4l2
    '-use_wallclock_as_timestamps', '1', // Use system clock for timestamps
    '-video_size', '640x480',           // Common resolution that most cameras support
    '-i', v4l2Device,                   // Input device
    '-thread_queue_size', '512',        // Increase queue size for stability
    
    // Output: Single JPEG for snapshot functionality (fallback)
    // HLS output removed for simplification
    '-vframes', '1',                    // Take only one frame
    '-c:v', 'mjpeg',                    // JPEG codec for preview
    '-q:v', '2',                        // High quality (1-31, lower is better)
    '-update', '1',                     // Update the output file
    path.join(previewDir, 'preview.jpg')
  ];
  
  // Start ffmpeg process with improved error handling
  const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
  
  ffmpegProcess.stderr.on('data', (data) => {
    const output = data.toString();
    
    // Filter out framerate logs to reduce console noise
    if (!output.includes('frame=') && !output.includes('fps=')) {
      // Log important ffmpeg messages for debugging
      if (output.includes('Error') || output.includes('Failed') || output.includes('Could not')) {
        console.error(`ffmpeg error: ${output.trim()}`);
      } else if (output.includes('Warning')) {
        console.warn(`ffmpeg warning: ${output.trim()}`);
      } else {
        console.log(`ffmpeg: ${output.trim()}`);
      }
    }
  });
  
  ffmpegProcess.on('close', (code) => {
    console.log(`ffmpeg process exited with code ${code}`);
  });
  
  ffmpegProcess.on('error', (error) => {
    console.error('Error starting ffmpeg process:', error);
  });
  
  // Return the process, but the streamUrl is now effectively just the preview
  return { 
    streamProcess: ffmpegProcess, 
    streamUrl: '/api/camera/preview' // Point to the JPEG preview endpoint
  };
}

/**
 * Start a placeholder stream with a static image
 * Used when no camera is available
 * @param {string} streamDir - Directory to store the stream files
 * @returns {object} Stream process and URL information
 */
function startPlaceholderStream(streamDir) {
  // Create a preview directory
  const previewDir = path.join(streamDir, 'preview');
  if (!fs.existsSync(previewDir)) {
    fs.mkdirSync(previewDir, { recursive: true });
  }
  
  // Copy a placeholder image
  const placeholderImage = path.join(process.cwd(), 'public', 'mock_images', 'sample1.jpg');
  const previewPath = path.join(previewDir, 'preview.jpg');
  
  try {
    fs.copyFileSync(placeholderImage, previewPath);
    console.log('Using placeholder image for preview since v4l2 device is not available');
  } catch (error) {
    console.error('Error creating placeholder preview:', error);
    // Create a simple text-based image if copying fails
    createTextImage(previewPath, 'Camera Not Available in v4l2 Mode');
  }
  
  return { 
    streamProcess: { active: true }, // Just a marker object 
    streamUrl: '/api/camera/preview' 
  };
}

/**
 * Create a simple text image when no placeholder is available
 * @param {string} outputPath - Path to save the image
 * @param {string} text - Text to display on the image
 */
function createTextImage(outputPath, text) {
  try {
    // Create a canvas
    const canvas = createCanvas(800, 600);
    const ctx = canvas.getContext('2d');
    
    // Fill background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 800, 600);
    
    // Add text
    ctx.fillStyle = '#ffffff';
    ctx.font = '24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(text, 400, 280);
    ctx.font = '18px Arial';
    ctx.fillText('Check camera connection and v4l2 setup', 400, 320);
    
    // Save the image
    const out = fs.createWriteStream(outputPath);
    const stream = canvas.createJPEGStream();
    stream.pipe(out);
  } catch (error) {
    console.error('Error creating text image:', error);
  }
}

module.exports = { 
  startV4L2Stream, 
  startPlaceholderStream, 
  createTextImage,
  findAvailableV4L2Devices,
  isDeviceAvailable,
  isVideoCaptureDevice
};

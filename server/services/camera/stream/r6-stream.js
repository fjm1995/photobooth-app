/**
 * Canon R6 Specialized Stream Module
 * Optimized streaming for Canon EOS R6 Mark II camera
 */
const fs = require('fs');
const { spawn } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(require('child_process').exec);

/**
 * Specialized setup for Canon R6 Mark II camera streaming
 * @param {string} devicePath - The device path to stream from
 * @param {Function} setupErrorHandling - Function to setup stream error handling
 * @returns {Promise<Object>} Stream information with mjpegProcess and mjpegUrl
 */
async function setupSpecializedR6Stream(devicePath, setupErrorHandling) {
  try {
    console.log('Using specialized approach for Canon R6 Mark II');
    console.log('Initial device path for R6 stream:', devicePath);
    
    // Use pure Node.js approach to find and terminate processes
    await releaseDevices();
    
    // Find all available video capture devices with detailed information
    const captureDevices = [];
    const deviceInfoMap = {};
    
    // Scan all video devices
    const videoDevices = fs.readdirSync('/dev').filter(d => d.startsWith('video'));
    console.log(`Found ${videoDevices.length} video devices to check: ${JSON.stringify(videoDevices)}`);
    
    // Check each device for capture capability and detailed info
    for (const device of videoDevices) {
      try {
        const devicePath = `/dev/${device}`;
        const { stdout } = await execPromise(`v4l2-ctl --device=${devicePath} --info`);
        
        // Store detailed info for debugging
        deviceInfoMap[devicePath] = stdout;
        
        if (stdout && stdout.includes('Video Capture')) {
          console.log(`Found capture device: ${devicePath}`);
          captureDevices.push(devicePath);
          
          // Check for specific Canon identifiers
          if (stdout.includes('Canon') || stdout.includes('EOS')) {
            console.log(`Device ${devicePath} appears to be a Canon camera`);
          }
        } else if (stdout && stdout.includes('Video Output')) {
          console.log(`Device ${devicePath} is a video output device`);
        }
      } catch (error) {
        console.log(`Error checking device ${device}:`, error.message);
      }
    }
    
    console.log(`Found ${captureDevices.length} working video capture devices: ${JSON.stringify(captureDevices)}`);
    
    // If no capture devices found, return false to fall back to standard method
    if (captureDevices.length === 0) {
      console.warn('No capture devices found for R6, returning to standard method');
      return { mjpegProcess: null, mjpegUrl: null };
    }
    
    // Find the best device for R6 streaming
    // Prioritize specific devices that are likely to work well
    let deviceToUse;
    
    // R6 Mark II typically works best with device2 in webcam mode
    if (captureDevices.includes('/dev/video2')) {
      deviceToUse = '/dev/video2';
      console.log('Using R6 preferred device: /dev/video2');
    } 
    // Try video1 as second option
    else if (captureDevices.includes('/dev/video1')) {
      deviceToUse = '/dev/video1';
      console.log('Using R6 preferred device: /dev/video1');
    }
    // Otherwise choose the highest numbered device as R6 often has better
    // quality on higher device numbers
    else {
      // Sort by device number in descending order to get highest numbers first
      captureDevices.sort((a, b) => {
        const aNum = parseInt(a.replace('/dev/video', ''));
        const bNum = parseInt(b.replace('/dev/video', ''));
        return bNum - aNum; // Descending order
      });
      
      deviceToUse = captureDevices[0];
      console.log(`Using best available device for R6: ${deviceToUse}`);
    }
    
    // Get supported formats for the chosen device
    let supportedFormats = 'unknown';
    try {
      const { stdout: formatsOutput } = await execPromise(`v4l2-ctl --device=${deviceToUse} --list-formats`);
      supportedFormats = formatsOutput;
      console.log(`Supported formats for ${deviceToUse}:\n${formatsOutput}`);
    } catch (e) {
      console.warn(`Could not get formats for ${deviceToUse}:`, e.message);
    }
    
    // Check if device supports MJPEG
    const usesMJPEG = supportedFormats.includes('MJPG') || supportedFormats.includes('MJPEG');
    
    // Specialized R6 FFMPEG arguments
    const r6Args = [
      '-f', 'v4l2'          // Force v4l2 input format
    ];
    
    // Add input format if we know it supports MJPEG
    if (usesMJPEG) {
      r6Args.push('-input_format', 'mjpeg');  // Force MJPEG input format
      console.log('Using MJPEG input format for R6');
    }
    
    // Continue with the rest of the arguments
    r6Args.push(
      '-video_size', '1280x720',     // Increased resolution for better quality
      '-framerate', '15',            // Conservative framerate
      '-i', deviceToUse,             // Use selected device
      '-c:v', 'mjpeg',               // Use MJPEG codec for output
      '-q:v', '5',                   // Better quality (5 is better than 10)
      '-f', 'mpjpeg',                // MJPEG format for output
      '-r', '15',                    // Match output framerate to input
      '-'                            // Output to stdout
    );
    
    // Start the MJPEG process with the new robust configuration
    const mjpegProcess = spawn('ffmpeg', r6Args);
    const mjpegUrl = '/api/camera/mjpeg-stream';
    
    // Set up error handling
    if (setupErrorHandling) {
      setupErrorHandling(mjpegProcess);
    }
    
    console.log(`Started specialized MJPEG stream for Canon R6 Mark II using ${deviceToUse}`);
    
    return { mjpegProcess, mjpegUrl };
  } catch (e) {
    console.error('Error starting specialized Canon R6 stream:', e);
    return { mjpegProcess: null, mjpegUrl: null };
  }
}

/**
 * Release busy devices
 */
async function releaseDevices() {
  try {
    const { promisify } = require('util');
    const execPromise = promisify(require('child_process').exec);
    
    try {
      // Use Node.js to find and terminate processes
      console.log('Finding and terminating ffmpeg processes...');
      
      // Find all ffmpeg processes
      const { stdout: processList } = await execPromise('ps -eo pid,command');
      
      // Extract PIDs using JavaScript
      const ffmpegPids = processList
        .split('\n')
        .filter(line => line.includes('ffmpeg'))
        .map(line => {
          const match = line.trim().match(/^(\d+)/);
          return match ? parseInt(match[1]) : null;
        })
        .filter(pid => pid !== null);
      
      console.log(`Found ${ffmpegPids.length} ffmpeg processes to terminate`);
      
      // Kill each process individually
      if (ffmpegPids.length > 0) {
        for (const pid of ffmpegPids) {
          try {
            process.kill(pid, 'SIGTERM');
            console.log(`Terminated process ${pid}`);
          } catch (killError) {
            console.log(`Could not terminate process ${pid} (might be gone): ${killError.message}`);
          }
        }
        
        // Give processes time to exit
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Free up any busy devices using Node.js file operations
      console.log('Checking for busy video devices...');
      const videoDevices = fs.readdirSync('/dev')
        .filter(file => file.startsWith('video'))
        .map(file => `/dev/${file}`);
      
      // Try to open and close each device to check if it's busy
      for (const device of videoDevices) {
        if (fs.existsSync(device)) {
          try {
            const fd = fs.openSync(device, 'r');
            fs.closeSync(fd);
            console.log(`Device ${device} is available`);
          } catch (err) {
            if (err.code === 'EBUSY') {
              console.log(`Device ${device} is busy, will try again later`);
            }
          }
        }
      }
    } catch (e) {
      console.warn('Process and device cleanup error (non-critical):', e);
    }
    
    // Give the system a moment to release the devices
    await new Promise(resolve => setTimeout(resolve, 2000));
  } catch (error) {
    console.error('Error releasing devices:', error);
  }
}

/**
 * Find all working video capture devices
 * @returns {Promise<string[]>} Array of working capture device paths
 */
async function findWorkingCaptureDevices() {
  try {
    const captureDevices = [];
    
    // Skip if not on Linux
    if (process.platform !== 'linux') {
      return ['/dev/video0']; // Mock device for development
    }
    
    const videoDevices = fs.readdirSync('/dev').filter(d => d.startsWith('video'));
    
    for (const device of videoDevices) {
      try {
        const devicePath = `/dev/${device}`;
        const result = await new Promise((resolve) => {
          execPromise(`v4l2-ctl --device=${devicePath} --info`)
            .then(({stdout}) => {
              resolve(stdout && stdout.includes('Video Capture'));
            })
            .catch(() => resolve(false));
        });
        
        if (result) {
          captureDevices.push(devicePath);
        }
      } catch (error) {
        console.warn(`Could not verify device /dev/${device}, assuming invalid`);
      }
    }
    
    return captureDevices;
  } catch (error) {
    console.error('Error finding capture devices:', error);
    return [];
  }
}

module.exports = {
  setupSpecializedR6Stream,
  releaseDevices,
  findWorkingCaptureDevices
};

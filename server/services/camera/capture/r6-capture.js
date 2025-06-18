/**
 * Canon R6 Specialized Camera Capture Method
 * Optimized for Canon EOS R6 Mark II camera
 */
const { spawn } = require('child_process');
const fs = require('fs');
const { promisify } = require('util');
const execPromise = promisify(require('child_process').exec);

/**
 * Special capture method optimized for R6 Mark II camera
 * @param {string} localPath - Path to save the captured photo
 * @param {string} devicePath - The v4l2 device path
 * @returns {Promise<boolean>} Success status
 */
async function captureWithR6(localPath, devicePath) {
  try {
    console.log('Using specialized Canon R6 Mark II capture approach');
    console.log('Initial device path for R6 capture:', devicePath);
    
    // For R6 Mark II, we need to find the best Video Capture device
    
    // Find all available video capture devices and get detailed information
    const captureDevices = [];
    const deviceDetails = {};
    
    try {
      // Scan all video devices for detailed information
      const videoDevices = fs.readdirSync('/dev').filter(d => d.startsWith('video'));
      console.log(`Found ${videoDevices.length} video devices: ${JSON.stringify(videoDevices)}`);
      
      // Check each device's capabilities
      for (const device of videoDevices) {
        try {
          const devicePath = `/dev/${device}`;
          const { stdout } = await execPromise(`v4l2-ctl --device=${devicePath} --info`);
          
          // Store full info for debugging
          deviceDetails[devicePath] = stdout;
          
          // Check if it's a capture device
          if (stdout && stdout.includes('Video Capture')) {
            console.log(`Found capture device: ${devicePath}`);
            captureDevices.push(devicePath);
            
            // Check for specific R6 identifiers in the device info
            if (stdout.includes('Canon') || 
                stdout.includes('EOS') || 
                stdout.includes('MJPG')) {
              console.log(`Device ${devicePath} appears to be a Canon camera`);
            }
          }
        } catch (error) {
          console.log(`Error checking device ${device}:`, error.message);
        }
      }
      
      console.log(`Found ${captureDevices.length} capture devices for R6: ${JSON.stringify(captureDevices)}`);
      
      if (captureDevices.length === 0) {
        throw new Error('No capture devices found for Canon R6');
      }
      
      // Check for the primary R6 devices
      // R6 Mark II often presents as video2 for high-quality capture
      const preferredDevices = captureDevices.filter(dev => 
        dev.includes('/dev/video2') || 
        dev.includes('/dev/video1')
      );
      
      let captureDevice;
      if (preferredDevices.length > 0) {
        // Prefer video2 over video1
        if (preferredDevices.includes('/dev/video2')) {
          captureDevice = '/dev/video2';
        } else {
          captureDevice = preferredDevices[0];
        }
        console.log(`Using preferred device for R6: ${captureDevice}`);
      } else {
        // Sort devices to find the best one
        // For R6, higher video device numbers often have better quality
        captureDevices.sort((a, b) => {
          const aNum = parseInt(a.replace('/dev/video', ''));
          const bNum = parseInt(b.replace('/dev/video', ''));
          return bNum - aNum; // Sort in descending order to get highest device number first
        });
        
        captureDevice = captureDevices[0];
        console.log(`Using alternative device for R6: ${captureDevice}`);
      }
      
      // Try to get the supported formats for this device
      let supportedFormats = 'unknown';
      try {
        const { stdout: formatsOutput } = await execPromise(`v4l2-ctl --device=${captureDevice} --list-formats`);
        supportedFormats = formatsOutput;
        console.log(`Supported formats for ${captureDevice}:\n${formatsOutput}`);
      } catch (e) {
        console.log(`Could not get formats for ${captureDevice}:`, e.message);
      }
      
      // Adjust parameters based on format support
      const useMjpeg = supportedFormats.includes('MJPG') || supportedFormats.includes('MJPEG');
      const useYuyv = supportedFormats.includes('YUYV');
      
      // Special R6 optimized capture parameters with format detection
      const ffmpegArgs = [
        '-f', 'v4l2'                 // Input format is v4l2
      ];
      
      // Add input format if we know what the device supports
      if (useMjpeg) {
        ffmpegArgs.push('-input_format', 'mjpeg');  // Force MJPEG for R6
        console.log('Using MJPEG input format for R6');
      } else if (useYuyv) {
        ffmpegArgs.push('-input_format', 'yuv');  // Use YUV for R6
        console.log('Using YUV input format for R6');
      } else {
        console.log('Using default input format for R6');
      }
      
      // Complete the ffmpeg command with high-quality settings
      ffmpegArgs.push(
        '-video_size', '6000x4000',  // Use maximum resolution for Canon R6 (24MP)
        '-i', captureDevice,         // Use the best device
        '-frames:v', '1',            // Capture one frame
        '-q:v', '1',                 // Best quality
        '-compression_level', '0',   // No compression for maximum quality
        localPath                    // Output file
      );
      
      // Execute the capture
      return new Promise((resolve) => {
        const ffmpeg = spawn('ffmpeg', ffmpegArgs);
        
        let errorOutput = '';
        ffmpeg.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });
        
        ffmpeg.on('close', (code) => {
          if (code !== 0) {
            console.error(`R6 capture failed with code ${code}: ${errorOutput}`);
            resolve(false);
          } else {
            resolve(true);
          }
        });
        
        ffmpeg.on('error', (error) => {
          console.error('Error executing R6 capture:', error);
          resolve(false);
        });
      });
    } catch (error) {
      console.error('Error in specialized R6 capture setup:', error);
      return false;
    }
  } catch (error) {
    console.error('Error in specialized R6 capture:', error);
    return false;
  }
}

module.exports = captureWithR6;

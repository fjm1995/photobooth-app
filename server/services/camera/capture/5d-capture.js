/**
 * Canon 5D Mark IV Specialized Camera Capture Method
 * Optimized for Canon EOS 5D Mark IV camera which has different behavior than the R6
 */
const { spawn } = require('child_process');
const fs = require('fs');
const { promisify } = require('util');
const execPromise = promisify(require('child_process').exec);

/**
 * Special capture method optimized for 5D Mark IV camera
 * @param {string} localPath - Path to save the captured photo
 * @param {string} devicePath - The v4l2 device path
 * @returns {Promise<boolean>} Success status
 */
async function captureWith5D(localPath, devicePath) {
  try {
    console.log('Using specialized Canon 5D Mark IV capture approach');
    console.log('Initial device path for 5D capture:', devicePath);
    
    // The 5D Mark IV typically uses a lower device number than the R6
    let captureDevice = devicePath;
    
    try {
      // For 5D Mark IV, the first video device is often the right one to use
      // But let's check available devices to be sure
      const videoDevices = fs.readdirSync('/dev').filter(d => d.startsWith('video'));
      console.log(`Found ${videoDevices.length} video devices: ${JSON.stringify(videoDevices)}`);
      
      // Get all capture devices
      const captureDevices = [];
      for (const device of videoDevices) {
        try {
          const devicePath = `/dev/${device}`;
          const { stdout } = await execPromise(`v4l2-ctl --device=${devicePath} --info`);
          
          if (stdout && stdout.includes('Video Capture')) {
            console.log(`Found capture device: ${devicePath}`);
            captureDevices.push(devicePath);
            
            // Look specifically for 5D markers
            if (stdout.includes('Canon') && 
                (stdout.includes('EOS 5D') || stdout.includes('5D Mark IV'))) {
              console.log(`Device ${devicePath} appears to be a Canon 5D Mark IV`);
              captureDevice = devicePath;
              break; // We found the exact 5D device
            }
          }
        } catch (error) {
          console.log(`Error checking device /dev/${device}:`, error.message);
        }
      }
      
      // If we didn't find a specific 5D device, but have other options
      if (captureDevice === devicePath && captureDevices.length > 0) {
        // Use known working devices based on logs we've seen
        const workingDevices = ['/dev/video14', '/dev/video15', '/dev/video21', '/dev/video22'];
        
        // Add a lot more logging to help debug device selection
        console.log('Known working devices:', JSON.stringify(workingDevices));
        console.log('Available capture devices:', JSON.stringify(captureDevices));
        
        // Find any device that matches our known working devices
        const workingDevice = captureDevices.find(device => workingDevices.includes(device));
        
        if (workingDevice) {
          captureDevice = workingDevice;
          console.log(`Using known working device for 5D Mark IV capture: ${captureDevice}`);
        } else {
          // If no known working device found, try the middle-numbered device
          // (lowest doesn't work based on error logs)
          captureDevices.sort((a, b) => {
            const aNum = parseInt(a.replace('/dev/video', ''));
            const bNum = parseInt(b.replace('/dev/video', ''));
            return aNum - bNum; // Sort in ascending order
          });
          
          // Choose a device from the middle of the range, not the lowest
          const middleIndex = Math.floor(captureDevices.length / 2);
          captureDevice = captureDevices[middleIndex];
          console.log(`Using middle-range device for 5D Mark IV capture: ${captureDevice}`);
        }
      }
      
      // Get supported formats for selected device
      let supportedFormats = 'unknown';
      try {
        const { stdout: formatsOutput } = await execPromise(`v4l2-ctl --device=${captureDevice} --list-formats`);
        supportedFormats = formatsOutput;
        console.log(`Supported formats for ${captureDevice}:\n${formatsOutput}`);
      } catch (e) {
        console.log(`Could not get formats for ${captureDevice}:`, e.message);
      }
      
      // 5D Mark IV typically uses YUYV format rather than MJPEG
      const usesYuyv = supportedFormats.includes('YUYV');
      const usesMjpeg = supportedFormats.includes('MJPG') || supportedFormats.includes('MJPEG');
      
      // Create ffmpeg command - specific to 5D Mark IV
      const ffmpegArgs = [
        '-f', 'v4l2'                 // Input format is v4l2
      ];
      
      // Add input format if we know what the device supports - 5D typically prefers YUYV
      if (usesYuyv) {
        ffmpegArgs.push('-input_format', 'yuv'); // Use YUYV for 5D Mark IV
        console.log('Using YUYV input format for 5D Mark IV');
      } else if (usesMjpeg) {
        ffmpegArgs.push('-input_format', 'mjpeg');
        console.log('Using MJPEG input format for 5D Mark IV');
      }
      
      // Complete ffmpeg command - 5D should be capable of higher resolutions
      ffmpegArgs.push(
        '-video_size', '6720x4480',  // Use maximum resolution for 5D Mark IV (30.4MP)
        '-i', captureDevice,         // Use selected device
        '-frames:v', '1',            // Capture a single frame
        '-q:v', '1',                 // Best quality
        '-compression_level', '0',   // No compression for maximum quality
        localPath                    // Output file
      );
      
      // Execute the capture
      console.log(`Executing 5D Mark IV capture with args: ${ffmpegArgs.join(' ')}`);
      return new Promise((resolve) => {
        const ffmpeg = spawn('ffmpeg', ffmpegArgs);
        
        let errorOutput = '';
        ffmpeg.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });
        
        ffmpeg.on('close', (code) => {
          if (code !== 0) {
            console.error(`5D Mark IV capture failed with code ${code}: ${errorOutput}`);
            resolve(false);
          } else {
            console.log(`5D Mark IV capture succeeded to ${localPath}`);
            resolve(true);
          }
        });
        
        ffmpeg.on('error', (error) => {
          console.error('Error executing 5D Mark IV capture:', error);
          resolve(false);
        });
      });
    } catch (error) {
      console.error('Error setting up 5D Mark IV capture:', error);
      return false;
    }
  } catch (error) {
    console.error('Error in 5D Mark IV capture:', error);
    return false;
  }
}

module.exports = captureWith5D;

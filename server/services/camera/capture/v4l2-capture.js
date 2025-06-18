/**
 * Standard V4L2 Camera Capture Method
 * Handles basic v4l2 device capture using ffmpeg
 */
const { spawn } = require('child_process');
const fs = require('fs');

/**
 * Capture photo using v4l2 device (standard method)
 * @param {string} localPath - Path to save the captured photo
 * @param {string} devicePath - The v4l2 device path
 * @param {Object} streamer - The camera streaming service to pause during capture
 * @returns {Promise<boolean>} Success status
 */
async function captureV4L2Photo(localPath, devicePath, streamer) {
  return new Promise(async (resolve, reject) => {
    if (!devicePath) {
      reject(new Error('No v4l2 device available for capture'));
      return;
    }
    
    // Find best device for capture
    let captureDevice = devicePath;
    
    try {
      // Check if the current device is a Video Output device
      const { exec } = require('child_process');
      const deviceInfoResult = await new Promise((resolveCheck) => {
        exec(`v4l2-ctl --device=${devicePath} --info`, (error, stdout, stderr) => {
          resolveCheck({ stdout, stderr, error });
        });
      });
      
      const isOutput = deviceInfoResult.stdout && deviceInfoResult.stdout.includes('Video Output');
      
      if (isOutput) {
        console.log(`Device ${devicePath} is a Video Output device, not suitable for capture`);
        
        // Try to find a capture device - look for sequential numbering first
        const deviceNum = parseInt(devicePath.replace('/dev/video', ''));
        const nextDevice = `/dev/video${deviceNum + 1}`;
        
        if (fs.existsSync(nextDevice)) {
          const nextDeviceResult = await new Promise((resolveCheck) => {
            exec(`v4l2-ctl --device=${nextDevice} --info`, (error, stdout, stderr) => {
              if (!error && stdout && stdout.includes('Video Capture')) {
                console.log(`Found ${nextDevice} as a Video Capture device, using for photo capture`);
                resolveCheck(true);
              } else {
                resolveCheck(false);
              }
            });
          });
          
          if (nextDeviceResult) {
            captureDevice = nextDevice;
          }
        }
        
        // If we couldn't find a suitable capture device, try to search all video devices
        if (captureDevice === devicePath) {
          const videoDevices = fs.readdirSync('/dev').filter(d => d.startsWith('video'));
          for (const device of videoDevices) {
            const devicePath = `/dev/${device}`;
            if (devicePath === captureDevice) continue;
            
            const deviceInfoResult = await new Promise((resolveCheck) => {
              exec(`v4l2-ctl --device=${devicePath} --info`, (error, stdout, stderr) => {
                if (!error && stdout && stdout.includes('Video Capture')) {
                  resolveCheck(true);
                } else {
                  resolveCheck(false);
                }
              });
            });
            
            if (deviceInfoResult) {
              console.log(`Found alternative capture device: ${devicePath}`);
              captureDevice = devicePath;
              break;
            }
          }
        }
      }
    } catch (e) {
      console.warn('Error checking device type for capture, using original device:', e);
    }
    
    console.log(`Capturing photo from ${captureDevice} to ${localPath}`);
    
    try {
      // Temporarily stop stream to avoid "Device busy" errors
      console.log('Temporarily stopping MJPEG stream for photo capture...');
      if (streamer) {
        streamer.stopStream();
      }
      
      // Small delay to ensure device is released
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Improved ffmpeg command for high-quality capture
      const ffmpegArgs = [
        '-f', 'v4l2',                 // Input format is v4l2
        '-s', '4032x3024',            // Request 4K Ultra HD resolution (12MP)
        '-i', captureDevice,          // Input device
        '-frames:v', '1',             // Capture a single frame
        '-q:v', '1',                  // Highest quality
        '-compression_level', '0',    // No compression
        localPath                     // Output file
      ];
      
      const ffmpeg = spawn('ffmpeg', ffmpegArgs);
      
      let errorOutput = '';
      
      ffmpeg.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      ffmpeg.on('close', async (code) => {
        try {
          // Restart stream after photo capture regardless of success/failure
          console.log('Restarting MJPEG stream after capture attempt...');
          if (streamer) {
            streamer.startStream(captureDevice, 'canon', 'Canon Camera');
          }
          
          if (code !== 0) {
            console.error(`ffmpeg capture failed with code ${code}: ${errorOutput}`);
            resolve(false);
          } else {
            resolve(true);
          }
        } catch (error) {
          reject(error);
        }
      });
      
      ffmpeg.on('error', async (error) => {
        // Restart stream after error
        console.log('Restarting MJPEG stream after capture error...');
        if (streamer) {
          streamer.startStream(captureDevice, 'canon', 'Canon Camera');
        }
        
        console.error('Error executing ffmpeg for capture:', error);
        resolve(false);
      });
    } catch (error) {
      // Restart stream in case of any errors during the setup phase
      console.log('Restarting MJPEG stream after error during capture setup...');
      if (streamer) {
        streamer.startStream(captureDevice, 'canon', 'Canon Camera');
      }
      
      console.error('Error during capture process:', error);
      reject(error);
    }
  });
}

module.exports = captureV4L2Photo;

/**
 * V4L2 Fallback Camera Capture Method
 * Alternative method for capturing photos from v4l2 devices when standard capture fails
 */
const { spawn } = require('child_process');
const fs = require('fs');

/**
 * Fallback method for capturing photo using v4l2 with different parameters
 * @param {string} localPath - Path to save the captured photo
 * @param {string} devicePath - The v4l2 device path
 * @returns {Promise<boolean>} Success status
 */
async function captureV4L2PhotoFallback(localPath, devicePath) {
  return new Promise(async (resolve, reject) => {
    console.log('Trying alternative v4l2 capture method...');
    
    // Try to find a better capture device
    let captureDevice = devicePath;
    
    try {
      // Check if device1 (sequential to device0) is a better option
      if (devicePath && devicePath.includes('/dev/video')) {
        const deviceNum = parseInt(devicePath.replace('/dev/video', ''));
        const alternativeDevice = `/dev/video${deviceNum + 1}`;
        
        if (fs.existsSync(alternativeDevice)) {
          // Check if it's a Video Capture device
          const { exec } = require('child_process');
          const deviceResult = await new Promise((resolveCheck) => {
            exec(`v4l2-ctl --device=${alternativeDevice} --info`, (error, stdout) => {
              resolveCheck({ success: !error && stdout && stdout.includes('Video Capture'), stdout });
            });
          });
          
          if (deviceResult.success) {
            console.log(`Found Video Capture device ${alternativeDevice}, using it for fallback capture`);
            captureDevice = alternativeDevice;
          }
        }
      }
      
      // Scan for any valid capture device as a last resort
      if (captureDevice === devicePath) {
        const videoDevices = fs.readdirSync('/dev')
          .filter(d => d.startsWith('video'))
          .map(d => `/dev/${d}`)
          .filter(d => d !== devicePath);
        
        for (const device of videoDevices) {
          console.log(`Checking if ${device} is a valid video capture device...`);
          
          try {
            const { exec } = require('child_process');
            const isValid = await new Promise((resolveCheck) => {
              exec(`v4l2-ctl --device=${device} --info`, (error, stdout) => {
                resolveCheck(!error && stdout && stdout.includes('Video Capture'));
              });
            });
            
            if (isValid) {
              console.log(`Device ${device} is a valid video capture device`);
              captureDevice = device;
              break;
            } else {
              console.log(`Device ${device} is not a video capture device, skipping`);
            }
          } catch (e) {
            console.warn(`Error checking device ${device}:`, e);
          }
        }
      }
    } catch (e) {
      console.warn('Error finding alternative capture device:', e);
    }
    
    // Alternative ffmpeg command with high-resolution parameters
    const ffmpegArgs = [
      '-f', 'v4l2',                 // Input format is v4l2
      '-s', '4032x3024',            // Try high resolution (12MP)
      '-i', captureDevice,          // Use the detected capture device
      '-frames:v', '1',             // Capture a single frame
      '-q:v', '1',                  // Best quality
      '-compression_level', '0',    // No compression for maximum quality
      localPath                     // Output file
    ];
    
    const ffmpeg = spawn('ffmpeg', ffmpegArgs);
    
    let errorOutput = '';
    
    ffmpeg.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        console.error(`Alternative ffmpeg capture failed: ${errorOutput}`);
        resolve(false);
      } else {
        resolve(true);
      }
    });
    
    ffmpeg.on('error', (error) => {
      console.error('Error executing alternative ffmpeg capture:', error);
      resolve(false);
    });
  });
}

module.exports = captureV4L2PhotoFallback;

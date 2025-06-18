/**
 * Canon 5D Mark IV Streaming Module
 * Specialized streaming for Canon EOS 5D Mark IV which has different requirements than R6
 */
const { spawn } = require('child_process');
const fs = require('fs');
const { promisify } = require('util');
const execPromise = promisify(require('child_process').exec);

/**
 * Create an MJPEG stream from Canon 5D Mark IV camera
 * @param {string} devicePath - Path to the v4l2 device
 * @returns {childProcess} - The ffmpeg process streaming MJPEG
 */
async function createMjpegStream(devicePath) {
  try {
    console.log('Starting Canon 5D Mark IV specialized stream service');
    console.log('Initial device path for 5D stream:', devicePath);
    
    // The 5D Mark IV typically uses a lower device number than the R6
    let streamDevice = devicePath;
    
    try {
      // Check for all available devices
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
              streamDevice = devicePath;
              break; // We found the exact 5D device
            }
          }
        } catch (error) {
          console.log(`Error checking device /dev/${device}:`, error.message);
        }
      }
      
      // If we didn't find a specific 5D device, but have other options
      if (streamDevice === devicePath && captureDevices.length > 0) {
      // Use known working devices based on logs we've seen
      const workingDevices = ['/dev/video14', '/dev/video15', '/dev/video21', '/dev/video22'];
      
      // Try all video devices as a last resort
      const allDevices = videoDevices.map(d => `/dev/${d}`);
      console.log('All available video devices:', JSON.stringify(allDevices));
        
        // Find the first known working device that's in our captureDevices list
        const workingDevice = captureDevices.find(device => workingDevices.includes(device));
        
        if (workingDevice) {
          streamDevice = workingDevice;
          console.log(`Using known working device for 5D Mark IV stream: ${streamDevice}`);
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
          streamDevice = captureDevices[middleIndex];
          console.log(`Using middle-range device for 5D Mark IV stream: ${streamDevice}`);
        }
      }
      
      // Get supported formats for selected device
      let supportedFormats = 'unknown';
      try {
        const { stdout: formatsOutput } = await execPromise(`v4l2-ctl --device=${streamDevice} --list-formats`);
        supportedFormats = formatsOutput;
        console.log(`Supported formats for ${streamDevice}:\n${formatsOutput}`);
      } catch (e) {
        console.log(`Could not get formats for ${streamDevice}:`, e.message);
      }
      
      // 5D Mark IV typically uses YUYV format rather than MJPEG
      const usesYuyv = supportedFormats.includes('YUYV');
      const usesMjpeg = supportedFormats.includes('MJPG') || supportedFormats.includes('MJPEG');
      
      // Create ffmpeg command - specific to 5D Mark IV
      const ffmpegArgs = [
        '-loglevel', 'warning',      // Show fewer messages but still show important warnings
        '-f', 'v4l2',                // Input format is v4l2
      ];
      
      // Add input format if we know what the device supports - 5D typically prefers YUYV
      if (usesYuyv) {
        ffmpegArgs.push('-input_format', 'yuv'); // Use YUYV for 5D Mark IV
        console.log('Using YUYV input format for 5D Mark IV stream');
      } else if (usesMjpeg) {
        ffmpegArgs.push('-input_format', 'mjpeg');
        console.log('Using MJPEG input format for 5D Mark IV stream');
      }
      
      // Complete ffmpeg command - 5D often works better with lower resolutions
      ffmpegArgs.push(
        '-video_size', '800x600',    // Camera resolution
        '-i', streamDevice,          // Input device
        '-c:v', 'mjpeg',             // Output codec
        '-q:v', '5',                 // Quality (5 is good balance)
        '-r', '12',                  // Frames per second (lower for 5D stability)
        '-f', 'mpjpeg',              // Format MJPEG
        'pipe:1'                     // Output to stdout
      );
      
      console.log(`Starting 5D Mark IV stream with command: ffmpeg ${ffmpegArgs.join(' ')}`);
      
      // Start the ffmpeg process for streaming
      const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
      
      // Send image preview to public/stream/preview/preview.jpg every 2 seconds
      // This is particularly useful for the 5D which sometimes needs more time to initialize
      const previewPath = process.cwd() + '/public/stream/preview';
      
      // Create the preview directory if it doesn't exist
      if (!fs.existsSync(previewPath)) {
        fs.mkdirSync(previewPath, { recursive: true });
      }
      
      // Function to generate preview image
      const generatePreview = () => {
        try {
          const previewArgs = [
            '-f', 'v4l2',
            '-video_size', '800x600'
          ];
          
          // Use same input format as the main stream
          if (usesYuyv) {
            previewArgs.push('-input_format', 'yuv');
          } else if (usesMjpeg) {
            previewArgs.push('-input_format', 'mjpeg');
          }
          
          previewArgs.push(
            '-i', streamDevice,
            '-frames:v', '1',
            '-update', '1',
            `${previewPath}/preview.jpg`
          );
          
          spawn('ffmpeg', previewArgs, { detached: true }).unref();
        } catch (error) {
          console.error('Error generating preview:', error);
        }
      };
      
      // Generate first preview immediately
      generatePreview();
      
      // Set up interval for preview updates
      const previewInterval = setInterval(generatePreview, 5000);
      
      // Attach the interval to the process for cleanup
      ffmpegProcess.previewInterval = previewInterval;
      
      // Add error handler
      ffmpegProcess.stderr.on('data', (data) => {
        const output = data.toString();
        // Only log errors that are not frame information
        if (!output.includes('frame=') && !output.includes('fps=')) {
          console.error(`5D Mark IV stream stderr: ${output}`);
        }
      });
      
      // Add exit handler
      ffmpegProcess.on('exit', (code) => {
        console.log(`5D Mark IV stream exited with code ${code}`);
        
        // Clear the preview interval
        if (ffmpegProcess.previewInterval) {
          clearInterval(ffmpegProcess.previewInterval);
        }
      });
      
      return ffmpegProcess;
    } catch (error) {
      console.error('Error setting up 5D Mark IV stream:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error in 5D Mark IV stream service:', error);
    throw error;
  }
}

module.exports = {
  createMjpegStream
};

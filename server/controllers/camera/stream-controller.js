/**
 * Camera Stream Controller
 * Handles streaming-related endpoints
 */
const cameraService = require('../../services/camera');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

/**
 * Stream camera feed
 */
exports.streamCamera = async (req, res) => {
  try {
    const streamUrl = cameraService.getStreamUrl();
    
    if (!streamUrl) {
      return res.status(503).json({
        success: false,
        message: 'Camera stream not available'
      });
    }
    
    // Redirect to the stream URL
    res.redirect(streamUrl);
  } catch (error) {
    console.error('Error streaming camera:', error);
    return res.status(500).json({
      success: false,
      message: 'Error streaming camera',
      error: error.message
    });
  }
};

/**
 * Serve DSLR preview image
 */
exports.getDSLRPreview = async (req, res) => {
  try {
    // Serve the latest preview image
    const previewPath = path.join(process.cwd(), 'public', 'stream', 'preview', 'preview.jpg');
    
    if (!fs.existsSync(previewPath)) {
      return res.status(404).json({
        success: false,
        message: 'Preview image not available'
      });
    }
    
    // Set cache control headers to prevent caching
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Send the preview image
    res.sendFile(previewPath);
  } catch (error) {
    console.error('Error serving camera preview:', error);
    return res.status(500).json({
      success: false,
      message: 'Error serving camera preview',
      error: error.message
    });
  }
};

/**
 * Stream MJPEG for browser compatibility
 * Uses the pre-initialized MJPEG stream from the camera service
 * Falls back to simpler ffmpeg streaming if the service stream fails
 */
// Track active connections and connection attempts
let activeStreamConnections = 0;
let lastStreamAttempt = 0;
const MAX_STREAM_CONNECTIONS = 5; // Increased from 2 to 5
const CONNECTION_COOLDOWN_MS = 1000; // Reduced from 3000 to 1000 (1 second cooldown)

exports.getMjpegStream = async (req, res) => {
  try {
    const now = Date.now();
    
    // Check if we're getting too many requests too quickly, but only if we have many active connections
    if (now - lastStreamAttempt < CONNECTION_COOLDOWN_MS && activeStreamConnections >= 3) {
      console.log(`Rate limiting MJPEG stream (last attempt: ${now - lastStreamAttempt}ms ago, active: ${activeStreamConnections})`);
      return res.status(429).json({
        success: false,
        message: 'Too many stream requests, please wait'
      });
    }
    
    // Check if we've reached maximum connections
    if (activeStreamConnections >= MAX_STREAM_CONNECTIONS) {
      console.log(`Too many active MJPEG connections (${activeStreamConnections}/${MAX_STREAM_CONNECTIONS})`);
      return res.status(503).json({
        success: false,
        message: 'Maximum stream connections reached'
      });
    }
    
    // Update trackers
    lastStreamAttempt = now;
    activeStreamConnections++;
    
    console.log(`MJPEG stream request received from client (active: ${activeStreamConnections})`);
    
    // Set up a cleanup function to run when the connection ends
    const cleanupConnection = () => {
      activeStreamConnections = Math.max(0, activeStreamConnections - 1);
      console.log(`MJPEG stream closed (remaining connections: ${activeStreamConnections})`);
    };
    
    // Clean up connection count when client disconnects
    req.on('close', cleanupConnection);
    req.on('end', cleanupConnection);
    
    // Get the MJPEG process from the camera service
    const mjpegProcess = cameraService.getMjpegProcess();
    
    // Check if v4l2 device is available
    if (!cameraService.v4l2Device) {
      console.error('No camera device available for MJPEG stream');
      return res.status(503).json({
        success: false,
        message: 'No camera device available'
      });
    }
    
    // Find alternative device for specialized cameras if needed
    let streamDevice = cameraService.v4l2Device;
    
    // Based on system logs, these are the confirmed working devices
    const knownWorkingDevices = ['/dev/video14', '/dev/video15', '/dev/video21', '/dev/video22'];
    console.log('Known working devices from logs:', knownWorkingDevices);
    
    // Find the best device for Canon cameras
    if (cameraService.cameraType === 'canon') {
      let cameraModel = 'Generic Canon';
      let preferredDevices = [...knownWorkingDevices]; // Start with known working devices
      
      // Add camera-specific preferred devices
      if (cameraService.cameraModel.includes('R6')) {
        console.log('Checking for optimal Canon R6 capture devices for MJPEG stream');
        cameraModel = 'R6';
        // R6 prefers high-numbered devices, especially video21 and video22
        preferredDevices = [...knownWorkingDevices, '/dev/video2']; // Known working + video2
      } else if (cameraService.cameraModel.includes('5D') || cameraService.cameraModel.includes('Mark IV')) {
        console.log('Checking for optimal Canon 5D Mark IV capture devices for MJPEG stream');
        cameraModel = '5D Mark IV';
        // 5D works best with specific devices based on system logs
        preferredDevices = [...knownWorkingDevices]; // Known working devices are best for 5D
      }
      
      // Get all video devices
      const videoDevices = fs.readdirSync('/dev')
        .filter(d => d.startsWith('video'))
        .map(d => `/dev/${d}`);
      
      console.log(`Available video devices for ${cameraModel}:`, videoDevices);
      
      // Check for preferred devices first
      let foundPreferred = false;
      for (const device of preferredDevices) {
        if (videoDevices.includes(device) && fs.existsSync(device)) {
          console.log(`Found preferred ${cameraModel} streaming device: ${device}`);
          streamDevice = device;
          foundPreferred = true;
          break;
        }
      }
      
      // If no preferred device found, try any video capture device
      if (!foundPreferred) {
        console.log(`No preferred devices found for ${cameraModel}, using default: ${streamDevice}`);
      }
      
      console.log(`Using device ${streamDevice} for MJPEG stream`);
    }
    
    // Check if we should use the pre-initialized stream or create a new one
    if (mjpegProcess && mjpegProcess.stdout) {
      console.log('Using shared MJPEG stream process');
      
      // Set headers for MJPEG stream
      res.writeHead(200, {
        'Content-Type': 'multipart/x-mixed-replace; boundary=ffmpeg',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Pragma': 'no-cache',
        'Access-Control-Allow-Origin': '*'
      });
      
      // Handle client disconnect for pre-initialized stream
      req.on('close', () => {
        console.log('Client disconnected from shared MJPEG stream');
        try {
          mjpegProcess.stdout.unpipe(res);
        } catch (error) {
          // Ignore unpiping errors
        }
      });
      
      // Pipe the ffmpeg output directly to the response
      mjpegProcess.stdout.pipe(res);
      
      // Error handling for the shared mjpeg process
      mjpegProcess.stderr.on('data', (data) => {
        // Only log errors that are not frame information
        const output = data.toString();
        if (!output.includes('frame=') && !output.includes('fps=')) {
          console.error(`Shared MJPEG stderr: ${output}`);
        }
      });
    } else {
      // Fallback: Create a dedicated stream for this request
      console.log('Using on-demand MJPEG stream as fallback');
      
      // Set headers for MJPEG stream
      res.writeHead(200, {
        'Content-Type': 'multipart/x-mixed-replace; boundary=mjpegstream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Pragma': 'no-cache',
        'Access-Control-Allow-Origin': '*'
      });
      
      console.log(`Starting dedicated MJPEG stream process from device: ${streamDevice}`);
      
      // Check if the device supports MJPEG input format
      let supportsJpeg = false;
      try {
        const { exec } = require('child_process');
        exec(`v4l2-ctl --device=${streamDevice} --list-formats`, (error, stdout) => {
          if (!error && stdout && (stdout.includes('MJPG') || stdout.includes('MJPEG'))) {
            supportsJpeg = true;
            console.log(`Device ${streamDevice} supports MJPEG format`);
          }
        });
      } catch (e) {
        console.log('Could not check for MJPEG support:', e.message);
      }
      
      // Wait a moment to check format support
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Create ffmpeg arguments with improved compatibility
      const ffmpegArgs = [
        '-loglevel', 'warning',  // Show fewer messages but still show important warnings
        '-f', 'v4l2',            // Input format is v4l2
      ];
      
      // Check if the device also supports YUYV for 5D Mark IV
      let supportsYUYV = false;
      try {
        const { exec } = require('child_process');
        exec(`v4l2-ctl --device=${streamDevice} --list-formats`, (error, stdout) => {
          if (!error && stdout && stdout.includes('YUYV')) {
            supportsYUYV = true;
            console.log(`Device ${streamDevice} supports YUYV format`);
          }
        });
      } catch (e) {
        console.log('Could not check for YUYV support:', e.message);
      }
      
      // Wait a moment to check format support
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Choose the best input format based on camera model and supported formats
      if (cameraService.cameraModel && cameraService.cameraModel.includes('5D') && supportsYUYV) {
        // 5D Mark IV typically works better with YUYV
        ffmpegArgs.push('-input_format', 'yuv');
        console.log('Using YUYV input format for 5D Mark IV stream');
      } else if (supportsJpeg) {
        // R6 and other cameras work better with MJPEG
        ffmpegArgs.push('-input_format', 'mjpeg');
        console.log('Using MJPEG input format for stream');
      }
      
      // Set appropriate resolution and frame rate based on camera model
      let resolution = '800x600';
      let frameRate = '15';
      
      if (cameraService.cameraModel && cameraService.cameraModel.includes('5D')) {
        // 5D Mark IV often works better with lower resolution and frame rate
        resolution = '800x600';
        frameRate = '12';
      }
      
      // Complete the ffmpeg command
      ffmpegArgs.push(
        // Resolution based on camera model
        '-video_size', resolution,
        // Use the selected device
        '-i', streamDevice,
        '-c:v', 'mjpeg',         // MJPEG codec for output
        '-q:v', '5',             // Better quality (5 instead of 8)
        '-r', frameRate,         // Frame rate based on camera model
        '-f', 'mpjpeg',          // MJPEG format for output
        'pipe:1'                 // Output to stdout
      );
      
      console.log('Starting ffmpeg process with args:', ffmpegArgs.join(' '));
      
      // Start a dedicated ffmpeg process for this request
      const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
      
      // Handle client disconnect
      req.on('close', () => {
        console.log('Client disconnected from dedicated MJPEG stream');
        if (ffmpegProcess) {
          try {
            ffmpegProcess.kill('SIGTERM');
          } catch (error) {
            console.error('Error killing dedicated ffmpeg process:', error);
          }
        }
      });
      
      // Handle ffmpeg errors
      ffmpegProcess.stderr.on('data', (data) => {
        const output = data.toString();
        // Only log errors that are not frame information
        if (!output.includes('frame=') && !output.includes('fps=')) {
          console.error(`Dedicated MJPEG stderr: ${output}`);
        }
      });
      
      // Handle ffmpeg exit
      ffmpegProcess.on('exit', (code) => {
        console.log(`Dedicated MJPEG process exited with code ${code}`);
      });
      
      // Pipe the ffmpeg output to the response
      ffmpegProcess.stdout.pipe(res);
    }
  } catch (error) {
    console.error('Error setting up MJPEG stream:', error);
    
    // Use a simpler error handling approach that doesn't depend on canvas
    try {
      // Try to send a text-based error
      res.status(503).send('Camera stream error: ' + error.message);
    } catch (responseError) {
      // If we can't even send a normal response, try one last approach
      try {
        // Send a simple error response that won't break the client
        res.writeHead(200, {
          'Content-Type': 'text/plain',
          'Cache-Control': 'no-cache'
        });
        res.end('Camera stream error: ' + error.message);
      } catch (finalError) {
        // Nothing more we can do if this fails
        console.error('Failed to send error response:', finalError);
      }
    }
  }
};

/**
 * Basic browser-based camera access endpoint
 * This is a fallback method when v4l2 is not available
 */
exports.getBrowserCamera = async (req, res) => {
  try {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Photobooth Camera View</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <style>
          body { margin: 0; padding: 0; overflow: hidden; background: #000; font-family: Arial, sans-serif; }
          .container { display: flex; flex-direction: column; height: 100vh; }
          .video-container { flex: 1; position: relative; display: flex; align-items: center; justify-content: center; }
          img { max-width: 100%; max-height: 100%; object-fit: contain; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="video-container">
            <img src="/api/camera/mjpeg-stream" alt="Camera Feed">
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error serving browser camera page:', error);
    return res.status(500).json({
      success: false,
      message: 'Error serving browser camera page',
      error: error.message
    });
  }
};

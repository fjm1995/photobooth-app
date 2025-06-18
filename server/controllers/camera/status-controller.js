/**
 * Camera Status Controller
 * Handles camera status and setup endpoints
 */
const cameraService = require('../../services/camera');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

/**
 * Check camera status
 */
exports.checkCameraStatus = async (req, res) => {
  try {
    const cameraAvailable = await cameraService.checkCameraAvailability();
    
    // Include setup status if it's available
    const setupStatus = cameraService.setupStatus || {
      success: cameraAvailable,
      message: cameraAvailable ? 'Camera detected' : 'No camera detected',
      needsSetup: !cameraAvailable
    };
    
    return res.status(200).json({
      success: true,
      cameraAvailable,
      cameraType: cameraService.cameraType,
      cameraModel: cameraService.cameraModel,
      streamUrl: cameraService.getStreamUrl(),
      setupStatus
    });
  } catch (error) {
    console.error('Error checking camera status:', error);
    return res.status(500).json({
      success: false,
      message: 'Error checking camera status',
      error: error.message
    });
  }
};

/**
 * Get camera setup instructions
 */
exports.getCameraSetupInstructions = async (req, res) => {
  try {
    // Import the setup service
    const setupService = require('../../services/setup');
    
    // Generate setup instructions
    const instructions = setupService.getSetupInstructions();
    
    // Add current status information
    const status = {
      cameraConnected: cameraService.cameraConnected,
      cameraType: cameraService.cameraType,
      cameraModel: cameraService.cameraModel,
      moduleLoaded: await setupService.checkV4L2Loopback(),
      setupStatus: cameraService.setupStatus || {
        success: cameraService.cameraConnected,
        message: cameraService.cameraConnected ? 'Camera is working' : 'Camera setup required',
        needsSetup: !cameraService.cameraConnected
      }
    };
    
    return res.status(200).json({
      success: true,
      instructions,
      status
    });
  } catch (error) {
    console.error('Error getting camera setup instructions:', error);
    return res.status(500).json({
      success: false,
      message: 'Error getting camera setup instructions',
      error: error.message
    });
  }
};

/**
 * Check if the current user has sudo access without password
 * This is used to determine if we can perform kernel module operations
 */
async function checkSudoAccess() {
  return new Promise((resolve) => {
    const { exec } = require('child_process');
    
    // Try a simple sudo command with a short timeout
    // The -n flag makes sudo fail rather than prompt for password
    exec('sudo -n true', { timeout: 2000 }, (error, stdout, stderr) => {
      if (error) {
        // Error means no sudo access without password
        console.log('Sudo check failed, no sudo access without password');
        resolve(false);
      } else {
        // No error means sudo works without password
        console.log('Sudo check passed, sudo access without password available');
        resolve(true);
      }
    });
  });
}

// Track if restart is already in progress to prevent concurrent attempts
let restartInProgress = false;
// Track timestamps of recent restarts to prevent rapid restart loops
let recentRestarts = [];
const RESTART_COOLDOWN_PERIOD = 10000; // 10 seconds
const MAX_RECENT_RESTARTS = 3; // Only allow 3 restarts in the cooldown period


/**
 * Terminate running ffmpeg processes
 */
async function terminateProcesses() {
  try {
    console.log('Stopping any running ffmpeg processes...');
    
    // Node.js native way to find and kill processes
    const { promisify } = require('util');
    const exec = promisify(require('child_process').exec);
    
    // Use ps only once to get the process list
    const { stdout: processList } = await exec('ps -eo pid,command');
    
    // Extract PIDs of ffmpeg processes using JavaScript
    const ffmpegPids = processList
      .split('\n')
      .filter(line => line.includes('ffmpeg'))
      .map(line => {
        const match = line.trim().match(/^(\d+)/);
        return match ? parseInt(match[1]) : null;
      })
      .filter(pid => pid !== null);
    
    if (ffmpegPids.length === 0) {
      console.log('No ffmpeg processes found to terminate');
      return;
    }
    
    console.log(`Found ${ffmpegPids.length} ffmpeg processes to terminate`);
    
    // First try using pkill as it's more reliable for ffmpeg
    try {
      await exec('pkill -9 -f ffmpeg || true');
      console.log('Sent pkill to terminate ffmpeg processes');
      // Wait a moment to let pkill work
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (pkillError) {
      console.log('pkill may have failed, falling back to individual process termination');
    }
    
    // Backup approach: try to kill each process individually
    let terminated = 0;
    for (const pid of ffmpegPids) {
      try {
        process.kill(pid, 'SIGKILL'); // More forceful than SIGTERM
        terminated++;
      } catch (killError) {
        // Ignore errors - process might already be gone
        if (killError.code !== 'ESRCH') {
          console.log(`Non-standard error terminating process ${pid}: ${killError.message}`);
        }
      }
    }
    
    if (terminated > 0) {
      console.log(`Successfully terminated ${terminated} ffmpeg processes`);
    }
  } catch (e) {
    console.warn('Error handling processes:', e);
  }
}

/**
 * Check and release busy video devices
 */
async function checkAndReleaseBusyDevices() {
  try {
    console.log('Checking for busy video devices...');
    const videoDevices = fs.readdirSync('/dev')
      .filter(file => file.startsWith('video'))
      .map(file => `/dev/${file}`);
    
    let busyDevices = 0;
    for (const device of videoDevices) {
      if (fs.existsSync(device)) {
        try {
          // Just check if we can open the device to see if it's in use
          const fd = fs.openSync(device, 'r');
          fs.closeSync(fd);
          console.log(`Device ${device} is available`);
        } catch (err) {
          if (err.code === 'EBUSY') {
            busyDevices++;
            console.log(`Device ${device} appears to be busy`);
          }
        }
      }
    }
    
    if (busyDevices > 0) {
      console.log(`Found ${busyDevices} busy devices, attempting to free them...`);
      
      // Try to use fuser to kill processes using video devices
      try {
        const { exec } = require('child_process');
        await new Promise((resolve) => {
          exec('fuser -k /dev/video* 2>/dev/null || true', {timeout: 2000}, () => resolve());
        });
      } catch (fuserError) {
        console.log('Error using fuser:', fuserError.message);
      }
    } else {
      console.log('No busy video devices found');
    }
  } catch (e) {
    console.warn('Error checking video devices:', e);
  }
}
    
/**
 * Process the restart operations after we've already sent a response to the client
 * This runs in the background and shouldn't block the response
 */
async function processRestartInBackground() {
  try {
    console.log('Beginning comprehensive camera restart process...');
    
    // First, terminate all running camera-related processes
    console.log('Step 1: Terminating active camera processes...');
    await terminateProcesses();
    
    // Release any busy devices
    console.log('Step 2: Releasing busy video devices...');
    await checkAndReleaseBusyDevices();
    
    // Check if we can use sudo (needed for module operations)
    const canUseSudo = await checkSudoAccess();
    
    // Unload and reload v4l2loopback module if possible
    console.log('Step 3: Handling kernel module operations...');
    await handleKernelModule(canUseSudo);
    
    // Wait for devices to settle after module operations
    console.log('Step 4: Waiting for devices to settle...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Force a complete device detection cycle
    console.log('Step 5: Performing new device scan...');
    const setupService = require('../../services/setup');
    await setupService.scanVideoDevices();
    
    // Stop any existing camera services before reinitializing
    console.log('Step 6: Stopping existing camera services...');
    if (cameraService.cameraConnected) {
      cameraService.stopCameraStream();
    }
    
    // Reset camera service state
    console.log('Step 7: Resetting camera service state...');
    cameraService.cameraConnected = false;
    cameraService.cameraType = null;
    cameraService.cameraModel = null;
    cameraService.v4l2Device = null;
    
    // Force device manager to run a fresh detection cycle
    console.log('Step 8: Reinitializing device manager...');
    const deviceManager = require('../../services/camera/device-manager.service');
    await deviceManager.init();
    
    // Now reinitialize the camera with a fresh state
    console.log('Step 9: Reinitializing camera service...');
    await cameraService.init();
    
    // If camera is still not connected, try alternative devices
    if (!cameraService.cameraConnected) {
      console.log('Step 10: Camera not connected after init, trying alternative devices...');
      await tryAlternativeDevices();
    }
    
    // Log the final status
    if (cameraService.cameraConnected) {
      console.log(`Camera reset successful: ${cameraService.cameraModel} (${cameraService.cameraType}) connected on ${cameraService.v4l2Device}`);
    } else {
      console.log('Camera reset completed but no camera detected');
    }
  } catch (error) {
    console.error('Error during background restart operations:', error);
  } finally {
    // Reset flag regardless of success or failure
    restartInProgress = false;
    console.log('Camera restart process completed');
  }
}

/**
 * Handle kernel module operations
 */
async function handleKernelModule(canUseSudo) {
  const setupService = require('../../services/setup');
  const moduleLoaded = await setupService.checkV4L2Loopback();
  
  if (!moduleLoaded) {
    console.log('v4l2loopback module not detected, skipping module operations');
    return;
  }
  
  console.log('v4l2loopback module detected...');
  
  if (!canUseSudo) {
    console.warn('Cannot reload kernel module: sudo access required but not available');
    console.warn('Try running the application as root or add sudoers rule:');
    console.warn('Example: %sudo ALL=(ALL) NOPASSWD: /sbin/modprobe, /usr/bin/fuser');
    return;
  }
  
  const { promisify } = require('util');
  const exec = promisify(require('child_process').exec);
  
  console.log('Unloading v4l2loopback module with sudo...');
  
  try {
    // First, release any devices that might be in use
    await exec('sudo fuser -k /dev/video* 2>/dev/null || true', {timeout: 3000});
    
    // Unload module
    await exec('sudo modprobe -r v4l2loopback', {timeout: 3000});
    console.log('v4l2loopback module unloaded');
    
    // Wait for module to unload
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Reload module with parameters
    await exec(
      'sudo modprobe v4l2loopback exclusive_caps=0 max_buffers=2 card_label="Canon Camera"',
      {timeout: 3000}
    );
    console.log('v4l2loopback module reloaded with exclusive_caps=0');
    
    // Wait for module to initialize
    await new Promise(resolve => setTimeout(resolve, 1000));
  } catch (error) {
    console.warn('Error during kernel module operations:', error.message);
  }
}

/**
 * Try to find and use alternative camera devices
 */
async function tryAlternativeDevices() {
  console.log('No camera detected after restart. Trying to detect camera on alternate devices...');
  
  // Get all video devices
  const videoDevices = fs.readdirSync('/dev')
    .filter(d => d.startsWith('video'))
    .map(d => `/dev/${d}`);
  
  console.log(`Found ${videoDevices.length} potential video devices to try`);
  
  // Try each device
  for (const device of videoDevices) {
    console.log(`Trying device ${device}...`);
    cameraService.v4l2Device = device;
    const deviceExists = await cameraService.verifyDeviceExists(device);
    if (deviceExists) {
      console.log(`Found working device: ${device}`);
      cameraService.cameraType = 'canon';
      cameraService.cameraModel = 'Canon Camera (manual restart)';
      cameraService.cameraConnected = true;
      cameraService.startCameraStream();
      break;
    }
  }
}

// Call the background process after sending response
exports.restartCameraServices = async (req, res) => {
  try {
    // Check if restart is already in progress
    if (restartInProgress) {
      console.log('Restart already in progress, skipping duplicate request');
      return res.status(429).json({
        success: false,
        message: 'Camera restart already in progress'
      });
    }
    
    // Check if we've restarted too many times recently
    const now = Date.now();
    // Remove restarts older than the cooldown period
    recentRestarts = recentRestarts.filter(time => now - time < RESTART_COOLDOWN_PERIOD);
    
    if (recentRestarts.length >= MAX_RECENT_RESTARTS) {
      console.log(`Too many restart attempts (${recentRestarts.length} in the last ${RESTART_COOLDOWN_PERIOD/1000} seconds)`);
      return res.status(429).json({
        success: false,
        message: 'Too many restart attempts, please wait a moment',
        retryAfter: Math.ceil(RESTART_COOLDOWN_PERIOD/1000)
      });
    }
    
    // Add current restart to the list
    recentRestarts.push(now);
    restartInProgress = true;
    
    // Capture initial camera state for logging/comparison
    const initialState = {
      connected: cameraService.cameraConnected,
      type: cameraService.cameraType,
      model: cameraService.cameraModel,
      device: cameraService.v4l2Device
    };
    
    console.log(`Camera restart initiated. Initial state: ${JSON.stringify(initialState)}`);
    
    // Send immediate response to prevent browser timeouts
    res.status(202).json({
      success: true,
      message: 'Camera restart initiated',
      initialState: initialState,
      estimatedTime: 10 // seconds
    });
    
    // Start background process
    processRestartInBackground()
      .then(() => {
        // Log completion with state comparison
        const finalState = {
          connected: cameraService.cameraConnected,
          type: cameraService.cameraType,
          model: cameraService.cameraModel,
          device: cameraService.v4l2Device
        };
        
        console.log(`Camera restart completed. Final state: ${JSON.stringify(finalState)}`);
        console.log(`State change: ${JSON.stringify({
          connected: `${initialState.connected} → ${finalState.connected}`,
          type: `${initialState.type} → ${finalState.type}`,
          model: `${initialState.model} → ${finalState.model}`,
          device: `${initialState.device} → ${finalState.device}`
        })}`);
      })
      .catch(error => {
        console.error('Error in background restart process:', error);
        restartInProgress = false;
      });
    
  } catch (error) {
    console.error('Error starting camera restart:', error);
    restartInProgress = false;
    return res.status(500).json({
      success: false,
      message: 'Error restarting camera services',
      error: error.message
    });
  }
};

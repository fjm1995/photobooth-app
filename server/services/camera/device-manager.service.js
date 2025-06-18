/**
 * Device Manager Service
 * Responsible for device management, verification, and reconnection
 */
const fs = require('fs');
const { spawn } = require('child_process');
const setupService = require('../setup');

class DeviceManagerService {
  constructor() {
    this.reconnectionTimer = null;
    this.reconnectionInterval = 2000; // Check every 2 seconds
    this.isCanonR6 = false;
    this.isCanon5D = false;
    this.setupStatus = null;
    this.onDeviceChange = null; // Callback for device changes
    
    // Known working devices based on system logs
    this.knownWorkingDevices = ['/dev/video14', '/dev/video15', '/dev/video21', '/dev/video22'];
  }
  
  /**
   * Initialize the device manager
   */
  async init() {
    try {
      console.log('Initializing device manager...');
      
      // Check dependencies
      console.log('Checking camera dependencies...');
      const dependencyCheck = await setupService.checkDependencies();
      if (!dependencyCheck.success) {
        console.warn('Missing dependencies:', dependencyCheck.message);
        this.setupStatus = {
          success: false,
          message: dependencyCheck.message,
          needsSetup: true,
          setupType: 'dependencies',
          instructions: setupService.getSetupInstructions()
        };
      }
      
      // Check and try to load v4l2loopback module if needed
      console.log('Checking v4l2loopback module...');
      const moduleLoaded = await setupService.checkV4L2Loopback();
      if (!moduleLoaded) {
        console.log('v4l2loopback module not loaded, attempting to load...');
        const loadResult = await setupService.tryLoadV4L2Loopback();
        
        if (!loadResult.success) {
          console.warn('Could not load v4l2loopback module:', loadResult.message);
          this.setupStatus = {
            success: false,
            message: loadResult.message,
            needsSetup: true,
            setupType: 'module',
            needsRoot: loadResult.needsRoot || false,
            instructions: setupService.getSetupInstructions()
          };
        }
      }
      
      // Subscribe to device changes
      setupService.onDeviceChange = (changes) => {
        // Only log detailed changes in debug mode
        const debugMode = process.env.DEBUG_MODE === 'true';
        if (debugMode) {
          console.log('Device changes detected by device manager:', changes);
        } else {
          console.log('Device changes detected');
        }
        
        if (this.onDeviceChange) {
          this.onDeviceChange(changes);
        }
      };
      
      return true;
    } catch (error) {
      console.error('Error initializing device manager:', error);
      this.setupStatus = {
        success: false,
        message: `Error during initialization: ${error.message}`,
        needsSetup: true,
        setupType: 'error',
        error: error
      };
      return false;
    }
  }
  
  /**
   * Get setup status information
   * @param {string} type - The type of setup status to get
   * @returns {Object} Setup status information
   */
  getSetupStatus(type = 'camera') {
    if (this.setupStatus) {
      return this.setupStatus;
    }
    
    // Default setup status if none is set
    return {
      success: false,
      message: `No ${type} detected`,
      needsSetup: true,
      setupType: type,
      instructions: setupService.getSetupInstructions()
    };
  }
  
  /**
   * Start the reconnection timer
   * @param {Function} reconnectionCallback - Callback to run when checking reconnection
   */
  startReconnectionTimer(reconnectionCallback) {
    // Clear any existing timer
    if (this.reconnectionTimer) {
      clearInterval(this.reconnectionTimer);
    }
    
    // Set up a new timer
    this.reconnectionTimer = setInterval(async () => {
      // For Canon R6, we have a special reconnection check that's less aggressive
      if (this.isCanonR6) {
        // Only check reconnection if the callback indicates we should
        const shouldCheck = await reconnectionCallback();
        if (!shouldCheck) {
          console.log('Canon R6: Stream appears to be working, skipping reconnection check');
        }
      } else {
        // Standard reconnection check for other cameras
        await reconnectionCallback();
      }
    }, this.reconnectionInterval);
    
    console.log(`Camera reconnection monitoring started (checking every ${this.reconnectionInterval / 1000} seconds)`);
  }
  
  /**
   * Stop the reconnection timer
   */
  stopReconnectionTimer() {
    if (this.reconnectionTimer) {
      clearInterval(this.reconnectionTimer);
      this.reconnectionTimer = null;
      console.log('Camera reconnection monitoring stopped');
    }
  }
  
  /**
   * Set camera-specific handling mode
   * @param {string} cameraType - Type of camera (r6, 5d, or standard)
   * @param {string} devicePath - The device path
   */
  setCameraMode(cameraType, devicePath) {
    this.isCanonR6 = cameraType === 'r6';
    this.isCanon5D = cameraType === '5d';
    
    // For specialized Canon cameras, use a longer interval to avoid constant reconnection
    if (this.isCanonR6 || this.isCanon5D) {
      this.reconnectionInterval = 10000; // 10 seconds
      console.log(`Canon ${cameraType.toUpperCase()} detected - using specialized handling with 10s reconnection interval`);
    } else {
      this.reconnectionInterval = 2000; // Standard 2 seconds
      console.log('Standard camera handling with 2s reconnection interval');
    }
    
    // If the timer is already running, restart it with the new interval
    if (this.reconnectionTimer) {
      this.stopReconnectionTimer();
      this.startReconnectionTimer();
    }
  }
  
  /**
   * Verify if a device actually exists and is usable
   * @param {string} devicePath - The device path to check
   * @returns {Promise<boolean>} - True if the device exists and is usable
   */
  async verifyDevice(devicePath) {
    // If not on Linux, assume device exists for development
    if (process.platform !== 'linux') {
      return true;
    }

    // Only log when in debug mode or first verification
    const debugMode = process.env.DEBUG_MODE === 'true';
    const verboseLogging = process.env.VERBOSE_LOGGING === 'true';
    const shouldLog = debugMode || verboseLogging;
    
    // Track already verified devices to avoid logging repeatedly
    this.verifiedDevices = this.verifiedDevices || new Set();
    const alreadyVerified = this.verifiedDevices.has(devicePath);

    try {
      // First check if the file exists
      if (!fs.existsSync(devicePath)) {
        if (shouldLog && !alreadyVerified) {
          console.log(`Device ${devicePath} does not exist`);
          this.verifiedDevices.add(devicePath);
        }
        return false;
      }

      // Use stat to check if it's a character device (what video devices are)
      const stats = fs.statSync(devicePath);
      if (!stats.isCharacterDevice()) {
        if (shouldLog && !alreadyVerified) {
          console.log(`${devicePath} is not a character device`);
          this.verifiedDevices.add(devicePath);
        }
        return false;
      }

      // Try to check device capabilities with v4l2-ctl
      return new Promise((resolve) => {
        try {
          const proc = spawn('v4l2-ctl', ['--device', devicePath, '--info']);
          let output = '';
          let error = '';
          
          proc.stdout.on('data', (data) => {
            output += data.toString();
          });
          
          proc.stderr.on('data', (data) => {
            error += data.toString();
          });
          
          proc.on('close', (code) => {
            if (code === 0 && !error.includes('failed') && !error.includes('error')) {
              // Check if the output contains Video Capture or Video Output capability
              const isCapture = output.includes('Video Capture');
              const isOutput = output.includes('Video Output');
              
              if (isCapture || isOutput) {
                if (shouldLog && !alreadyVerified) {
                  console.log(`Device ${devicePath} verified as working (${isCapture ? 'Capture' : 'Output'} capability)`);
                  this.verifiedDevices.add(devicePath);
                }
                
                // Check if this is a Canon R6 Mark II (less verbose)
                this.detectCanonR6(devicePath, isOutput, isCapture);
                
                resolve(true);
              } else {
                if (shouldLog && !alreadyVerified) {
                  console.log(`Device ${devicePath} does not have video capabilities`);
                  this.verifiedDevices.add(devicePath);
                }
                resolve(false);
              }
            } else {
              if (shouldLog && !alreadyVerified) {
                console.log(`Device ${devicePath} not usable: ${error}`);
                this.verifiedDevices.add(devicePath);
              }
              resolve(false);
            }
          });
          
          proc.on('error', () => {
            resolve(false);
          });
        } catch (error) {
          console.error(`Error verifying device ${devicePath}:`, error);
          resolve(false);
        }
      });
    } catch (error) {
      console.error(`Error checking device ${devicePath}:`, error);
      return false;
    }
  }
  
  /**
   * Detect if a device is a Canon R6 Mark II
   * @param {string} devicePath - The device path to check
   * @param {boolean} isOutput - Whether this is a video output device
   * @param {boolean} isCapture - Whether this is a video capture device
   */
  async detectCanonR6(devicePath, isOutput, isCapture) {
    try {
      // Only log in debug mode
      const debugMode = process.env.DEBUG_MODE === 'true';
      
      // Track devices we've already checked
      this.checkedCanonDevices = this.checkedCanonDevices || new Set();
      const alreadyChecked = this.checkedCanonDevices.has(devicePath);
      
      if (debugMode && !alreadyChecked) {
        console.log(`Checking if ${devicePath} is a Canon R6 camera (Output: ${isOutput}, Capture: ${isCapture})`);
      }
      
      // Mark as checked to avoid repeated logging
      this.checkedCanonDevices.add(devicePath);
      
      // Canon R6 detection is challenging because it presents multiple devices
      // The Mark II typically shows up in different ways depending on camera settings:
      // 1. Video Output on video0 + Video Capture on video1/video2 (webcam mode)
      // 2. Video Capture on video2 or other higher-numbered devices
      
      // Get all video devices for cross-checking
      const videoDevices = fs.readdirSync('/dev')
        .filter(d => d.startsWith('video'))
        .map(d => `/dev/${d}`);
      
      if (debugMode) {
        console.log(`All video devices: ${JSON.stringify(videoDevices)}`);
      }
      
      // Check if device is one of the known working devices from logs
      if (this.knownWorkingDevices.includes(devicePath)) {
        if (debugMode) {
          console.log(`Device ${devicePath} is a known working device - using specialized handling`);
        }
        
        // Default to R6 mode for these devices for now
        this.setCameraMode('r6', devicePath);
        return;
      }
      
      // Approach 1: If this is video0 as output device, check for video1/video2
      if (isOutput && devicePath.includes('video0')) {
        if (debugMode) {
          console.log('R6 pattern 1: Output device on video0');
        }
        
        // Check for the capture devices that typically appear with R6
        const hasVideo1 = videoDevices.includes('/dev/video1');
        const hasVideo2 = videoDevices.includes('/dev/video2');
        
        if (hasVideo1 || hasVideo2) {
          if (debugMode) {
            console.log('R6 pattern 1 confirmed: Found related capture devices');
          }
          this.setCameraMode('r6', devicePath);
          return;
        }
      }
      
      // Approach 2: If this is a high-numbered Video Capture device
      if (isCapture) {
        const deviceNum = parseInt(devicePath.replace('/dev/video', ''));
        
        // R6 often uses video2 or higher for direct capture
        if (deviceNum >= 2) {
          if (debugMode) {
            console.log(`R6 pattern 2: High-numbered capture device (${devicePath})`);
          }
          
          // Check if the device name contains Canon camera identifiers
          try {
            const { promisify } = require('util');
            const exec = promisify(require('child_process').exec);
            const { stdout } = await exec(`v4l2-ctl --device=${devicePath} --all`);
            
            // Check for Canon R6 indicators
            if (stdout.includes('Canon') && (stdout.includes('R6') || stdout.includes('Mark II'))) {
              if (debugMode) {
                console.log('R6 pattern confirmed: Device info contains Canon R6 identifiers');
              }
              this.setCameraMode('r6', devicePath);
              return;
            }
            
            // Check for Canon 5D indicators
            if (stdout.includes('Canon') && 
                (stdout.includes('5D') || stdout.includes('Mark IV') || stdout.includes('EOS 5'))) {
              if (debugMode) {
                console.log('5D pattern confirmed: Device info contains Canon 5D identifiers');
              }
              this.setCameraMode('5d', devicePath);
              return;
            }
            
            // Generic Canon detection
            if (stdout.includes('Canon') || stdout.includes('EOS') || stdout.includes('MJPG')) {
              if (debugMode) {
                console.log('Generic Canon pattern detected: Device info contains Canon identifiers');
              }
              // Default to R6 mode for now
              this.setCameraMode('r6', devicePath);
              return;
            }
          } catch (e) {
            if (debugMode) {
              console.warn(`Could not check device info for ${devicePath}:`, e.message);
            }
          }
        }
        
        // Default to standard capture device handling if no R6 indicators found
        if (debugMode) {
          console.log('No R6 patterns detected, using standard capture device handling');
        }
        this.setCameraMode('standard', devicePath);
      }
    } catch (e) {
      // If we can't check, assume it's not an R6
      console.warn('Error checking camera model, using standard reconnection handling:', e);
      this.setCameraMode('standard', devicePath);
    }
  }
}

// Export a singleton instance
const deviceManagerService = new DeviceManagerService();
module.exports = deviceManagerService;

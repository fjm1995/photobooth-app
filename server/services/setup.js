/**
 * Camera Setup Service
 * Handles initial camera setup and configuration for Linux systems
 */
const { spawn, exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

class SetupService {
  /**
   * Initialize the setup service
   */
  constructor() {
    this.isRoot = process.getuid && process.getuid() === 0;
    this.isLinux = process.platform === 'linux';
    this.moduleLoaded = false;
    this.knownVideoDevices = [];
    this.lastScanTime = 0;
    this.monitoringInterval = null;
    
    // Start device monitoring if on Linux
    if (this.isLinux) {
      this.startDeviceMonitoring();
    }
  }
  
  /**
   * Start monitoring for device changes
   */
  startDeviceMonitoring() {
    // Check devices once right away
    this.scanVideoDevices();
    
    // Set up periodic monitoring (every 5 seconds)
    if (!this.monitoringInterval) {
      this.monitoringInterval = setInterval(() => {
        this.scanVideoDevices();
      }, 5000);
      
      console.log('Device monitoring started - scanning for camera changes every 5 seconds');
    }
  }
  
  /**
   * Stop device monitoring
   */
  stopDeviceMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      console.log('Device monitoring stopped');
    }
  }
  
  /**
   * Verify a device is a working video capture device
   * @param {string} devicePath - Path to the device
   * @returns {Promise<boolean>} - True if the device is usable for video capture
   */
  async verifyDevice(devicePath) {
    return new Promise((resolve) => {
      try {
        // Only log in debug or verbose mode
        const shouldLog = process.env.DEBUG_MODE === 'true' || process.env.VERBOSE_LOGGING === 'true';
        
        // Check if device exists
        if (!fs.existsSync(devicePath)) {
          resolve(false);
          return;
        }
        
        // Track already verified devices to avoid repeated logging
        this.verifiedDevices = this.verifiedDevices || new Set();
        const alreadyVerified = this.verifiedDevices.has(devicePath);
        
        // Use ffmpeg to test the device
        const testCmd = spawn('ffmpeg', [
          '-f', 'v4l2',         // Input format
          '-list_formats', 'all', // List all formats
          '-i', devicePath      // Input device
        ]);
        
        let stderr = '';
        
        testCmd.stderr.on('data', (data) => {
          stderr += data.toString();
        });
        
        testCmd.on('close', (code) => {
          // Check for specific error patterns that indicate it's not a capture device
          if (stderr.includes('Not a video capture device')) {
            if (shouldLog && !alreadyVerified) {
              console.log(`Device ${devicePath} is not a video capture device`);
              this.verifiedDevices.add(devicePath);
            }
            resolve(false);
            return;
          }
          
          // If it lists formats, it's likely a valid capture device
          if (stderr.includes('Raw') || 
              stderr.includes('Compressed') || 
              stderr.includes('video4linux2,v4l2') && !stderr.includes('No such device')) {
            if (shouldLog && !alreadyVerified) {
              console.log(`Device ${devicePath} is a valid video capture device`);
              this.verifiedDevices.add(devicePath);
            }
            resolve(true);
            return;
          }
          
          // Default to false if we can't determine
          if (shouldLog && !alreadyVerified) {
            console.log(`Could not verify device ${devicePath}, assuming invalid`);
            this.verifiedDevices.add(devicePath);
          }
          resolve(false);
        });
        
        testCmd.on('error', () => {
          resolve(false);
        });
      } catch (error) {
        console.error(`Error verifying device ${devicePath}:`, error);
        resolve(false);
      }
    });
  }

  /**
   * Check if verbose logging is enabled
   * @returns {boolean} True if verbose logging is enabled
   */
  isVerboseLogging() {
    return process.env.VERBOSE_LOGGING === 'true';
  }

  /**
   * Log message if verbose logging is enabled
   * @param {string} message - The message to log
   * @param {*} data - Optional data to log
   */
  verboseLog(message, data = null) {
    if (this.isVerboseLogging()) {
      if (data) {
        console.log(message, data);
      } else {
        console.log(message);
      }
    }
  }

  /**
   * Find and verify working video capture devices
   * @returns {Promise<string[]>} Array of valid video capture device paths
   */
  async findWorkingVideoDevices() {
    try {
      if (!this.isLinux) {
        return ['/dev/video0']; // Mock device for non-Linux
      }
      
      // Get all video devices
      let devices = [];
      try {
        const output = execSync('ls -la /dev/video*', { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
        const lines = output.split('\n');
        
        for (const line of lines) {
          const match = line.match(/\/dev\/video\d+/);
          if (match) {
            devices.push(match[0]);
          }
        }
      } catch (error) {
        console.warn('Error listing video devices:', error.message);
        return [];
      }
      
      if (devices.length === 0) {
        return [];
      }
      
      // Verify each device
      const workingDevices = [];
      for (const device of devices) {
        const isWorking = await this.verifyDevice(device);
        if (isWorking) {
          workingDevices.push(device);
        }
      }
      
      // Only log detailed device info in verbose mode
      if (workingDevices.length > 0) {
        this.verboseLog(`Found ${workingDevices.length} working video devices:`, workingDevices);
      } else {
        console.log('No working video devices found');
      }
      
      return workingDevices;
    } catch (error) {
      console.error('Error finding working video devices:', error);
      return [];
    }
  }

  /**
   * Scan for video devices and detect changes
   */
  async scanVideoDevices() {
    try {
      if (!this.isLinux) return;
      
      // Only do extensive logging in debug mode
      const debugMode = process.env.DEBUG_MODE === 'true';
      const verboseLogging = process.env.VERBOSE_LOGGING === 'true';
      
      // Scan for current devices
      let currentDevices = [];
      try {
        // Use ls to check for video devices
        const output = execSync('ls -la /dev/video*', { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
        const lines = output.split('\n');
        
        for (const line of lines) {
          const match = line.match(/\/dev\/video\d+/);
          if (match) {
            currentDevices.push(match[0]);
          }
        }
      } catch (error) {
        // If the command fails, there might be no devices
        currentDevices = [];
      }
      
      // Sort devices to ensure consistent comparison
      currentDevices.sort();
      const previousDevices = [...this.knownVideoDevices].sort();
      
      // Check for changes
      const added = currentDevices.filter(d => !previousDevices.includes(d));
      const removed = previousDevices.filter(d => !currentDevices.includes(d));
      
      // Emit signals about device changes if needed
      if (added.length > 0 || removed.length > 0) {
        // Only log once when changes are first detected or in debug mode
        if (debugMode || !this.hasLoggedChanges) {
          console.log('Device changes detected:');
          
          if (added.length > 0) {
            console.log('- Added devices:', added);
          }
          
          if (removed.length > 0) {
            console.log('- Removed devices:', removed);
          }
          
          this.hasLoggedChanges = true;
        }
        
        // Try to load v4l2loopback if not loaded and devices appeared
        if (added.length > 0 && !this.moduleLoaded) {
          this.checkV4L2Loopback();
        }
        
        // Only verify working devices if needed and limit logging
        let workingDevices = [];
        if (debugMode || !this.hasCheckedWorkingDevices) {
          workingDevices = await this.findWorkingVideoDevices();
          
          if (workingDevices.length > 0 && (debugMode || verboseLogging)) {
            console.log('- Found working video capture devices:', workingDevices);
          } else if ((debugMode || verboseLogging) && workingDevices.length === 0) {
            console.log('- No working video capture devices found among added devices');
          }
          
          this.hasCheckedWorkingDevices = true;
        }
        
        // Trigger any listeners
        if (this.onDeviceChange) {
          this.onDeviceChange({
            added,
            removed,
            current: currentDevices,
            workingDevices: await this.findWorkingVideoDevices()
          });
        }
      }
      
      // Update known devices
      this.knownVideoDevices = currentDevices;
      this.lastScanTime = Date.now();
    } catch (error) {
      console.error('Error scanning video devices:', error);
    }
  }
  
  /**
   * Check if system has necessary tools and dependencies
   */
  async checkDependencies() {
    try {
      // Only check dependencies on Linux
      if (!this.isLinux) {
        console.log('Not running on Linux, skipping dependency check');
        return {
          success: true,
          missingDependencies: [],
          message: 'Not running on Linux'
        };
      }
      
      const dependencies = [
        'ffmpeg',
        'v4l2-ctl',
        'modprobe',
        'gphoto2'
      ];
      
      const missingDependencies = [];
      
      for (const dependency of dependencies) {
        try {
          // Check if the command exists
          execSync(`which ${dependency}`, { stdio: 'ignore' });
        } catch (error) {
          missingDependencies.push(dependency);
        }
      }
      
      // Check if v4l2loopback module is available
      let v4l2loopbackAvailable = false;
      try {
        const output = execSync('modinfo v4l2loopback', { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
        v4l2loopbackAvailable = output.includes('v4l2loopback');
      } catch (error) {
        missingDependencies.push('v4l2loopback-dkms');
      }
      
      if (missingDependencies.length > 0) {
        return {
          success: false,
          missingDependencies,
          message: `Missing dependencies: ${missingDependencies.join(', ')}`
        };
      }
      
      return {
        success: true,
        missingDependencies: [],
        message: 'All dependencies installed'
      };
    } catch (error) {
      console.error('Error checking dependencies:', error);
      return {
        success: false,
        missingDependencies: [],
        message: `Error checking dependencies: ${error.message}`
      };
    }
  }
  
  /**
   * Check if v4l2loopback module is loaded
   */
  async checkV4L2Loopback() {
    try {
      if (!this.isLinux) {
        console.log('Not running on Linux, assuming v4l2loopback is loaded');
        this.moduleLoaded = true;
        return true;
      }
      
      // Check if the module is loaded
      try {
        const output = execSync('lsmod | grep v4l2loopback', { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
        this.moduleLoaded = output.includes('v4l2loopback');
      } catch (error) {
        this.moduleLoaded = false;
      }
      
      return this.moduleLoaded;
    } catch (error) {
      console.error('Error checking v4l2loopback:', error);
      this.moduleLoaded = false;
      return false;
    }
  }
  
  /**
   * Try to load v4l2loopback module if it's not already loaded and we have permission
   */
  async tryLoadV4L2Loopback() {
    try {
      // Only try to load on Linux and if we're running as root
      if (!this.isLinux) {
        console.log('Not running on Linux, skipping v4l2loopback setup');
        return {
          success: true,
          message: 'Not running on Linux'
        };
      }
      
      // Check if the module is already loaded
      const moduleLoaded = await this.checkV4L2Loopback();
      if (moduleLoaded) {
        console.log('v4l2loopback module is already loaded');
        return {
          success: true,
          message: 'v4l2loopback module already loaded'
        };
      }
      
      // If we're not root, we can't load the module
      if (!this.isRoot) {
        console.log('Not running as root, cannot load v4l2loopback module');
        return {
          success: false,
          needsRoot: true,
          message: 'Requires root privileges to load v4l2loopback module'
        };
      }
      
      // Try to load the v4l2loopback module
      try {
        console.log('Loading v4l2loopback module...');
        execSync('modprobe v4l2loopback exclusive_caps=1 max_buffers=2 card_label="Canon Camera"', 
                { stdio: ['ignore', 'pipe', 'pipe'] });
        
        // Check if the module was loaded successfully
        const moduleLoadedAfter = await this.checkV4L2Loopback();
        if (moduleLoadedAfter) {
          console.log('v4l2loopback module loaded successfully');
          return {
            success: true,
            message: 'v4l2loopback module loaded successfully'
          };
        } else {
          console.error('Failed to load v4l2loopback module');
          return {
            success: false,
            message: 'Failed to load v4l2loopback module'
          };
        }
      } catch (error) {
        console.error('Error loading v4l2loopback module:', error);
        
        // Try with simpler parameters
        try {
          console.log('Trying alternative parameters...');
          execSync('modprobe v4l2loopback', { stdio: ['ignore', 'pipe', 'pipe'] });
          
          // Check again if the module was loaded
          const moduleLoadedRetry = await this.checkV4L2Loopback();
          if (moduleLoadedRetry) {
            console.log('v4l2loopback module loaded with alternative parameters');
            return {
              success: true,
              message: 'v4l2loopback module loaded with alternative parameters'
            };
          } else {
            return {
              success: false,
              message: `Error loading v4l2loopback module: ${error.message}`
            };
          }
        } catch (retryError) {
          return {
            success: false,
            message: `Error loading v4l2loopback module: ${retryError.message}`
          };
        }
      }
    } catch (error) {
      console.error('Error in tryLoadV4L2Loopback:', error);
      return {
        success: false,
        message: `Error: ${error.message}`
      };
    }
  }
  
  /**
   * Provide setup instructions for users if automatic setup fails
   */
  getSetupInstructions() {
    const instructions = {
      title: 'Camera Setup Instructions',
      description: 'The application detected that your camera might need additional setup.',
      steps: [
        {
          title: 'Install dependencies',
          command: 'sudo apt-get update && sudo apt-get install -y v4l2loopback-dkms v4l2loopback-utils ffmpeg v4l-utils gphoto2 libgphoto2-dev',
          description: 'Install required packages for camera support'
        },
        {
          title: 'Load v4l2loopback module',
          command: 'sudo modprobe v4l2loopback exclusive_caps=1 max_buffers=2 card_label="Canon Camera"',
          description: 'Load the v4l2loopback kernel module for camera streaming'
        },
        {
          title: 'Make configuration persistent',
          command: 'echo "v4l2loopback" | sudo tee /etc/modules-load.d/v4l2loopback.conf',
          description: 'Make the v4l2loopback module load at boot'
        },
        {
          title: 'Configure module parameters',
          command: 'echo "options v4l2loopback exclusive_caps=1 max_buffers=2 card_label=\'Canon Camera\'" | sudo tee /etc/modprobe.d/v4l2loopback.conf',
          description: 'Set the module parameters'
        },
        {
          title: 'Restart the application',
          command: 'npm start',
          description: 'Start the application again after setup'
        }
      ]
    };
    
    return instructions;
  }
  
  /**
   * Check for Canon camera using v4l2-ctl
   */
  async checkForCanonCamera() {
    try {
      if (!this.isLinux) {
        console.log('Not running on Linux, assuming Canon camera is connected');
        return {
          detected: true,
          device: '/dev/video0', // Placeholder
          message: 'Development mode, assuming camera is available'
        };
      }
      
      // Check for v4l2 devices
      try {
        const output = execSync('v4l2-ctl --list-devices', { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
        
        // Look for Canon cameras
        const canonRegex = /Canon.*\n\s*([\/\w\d]+)/i;
        const match = output.match(canonRegex);
        
        if (match && match[1]) {
          const device = match[1].trim();
          console.log(`Found Canon camera: ${device}`);
          return {
            detected: true,
            device,
            message: `Found Canon camera: ${device}`
          };
        }
        
        // Check for any video device that might be a Canon camera
        try {
          const devices = fs.readdirSync('/dev').filter(d => d.startsWith('video'));
          if (devices.length > 0) {
            // For simplicity, use the first device
            const device = `/dev/${devices[0]}`;
            return {
              detected: true,
              device,
              message: `Using video device: ${device}`
            };
          }
        } catch (fsError) {
          console.error('Error checking /dev directory:', fsError);
        }
        
        return {
          detected: false,
          device: null,
          message: 'No Canon camera detected'
        };
      } catch (error) {
        console.error('Error running v4l2-ctl:', error);
        return {
          detected: false,
          device: null,
          message: `Error running v4l2-ctl: ${error.message}`
        };
      }
    } catch (error) {
      console.error('Error checking for Canon camera:', error);
      return {
        detected: false,
        device: null,
        message: `Error: ${error.message}`
      };
    }
  }
}

// Export a singleton instance
const setupService = new SetupService();
module.exports = setupService;

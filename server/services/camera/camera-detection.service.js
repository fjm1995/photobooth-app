/**
 * Camera Detection Service
 * Responsible for detecting and identifying cameras
 */
const fs = require('fs');
const { spawn, execSync } = require('child_process');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);

class CameraDetectionService {
  constructor() {
    this.knownCanonModels = [
      'Canon EOS R6 Mark II',
      'Canon EOS R6',
      'Canon EOS R5',
      'Canon EOS 5D Mark IV',
      'Canon EOS 5D',
      'EOS Webcam Utility'
    ];
  }

  /**
   * Detect available cameras
   * @returns {Promise<Object>} Detection result
   */
  async detectCamera() {
    try {
      // Only log during first run or when DEBUG_MODE is enabled
      const verboseLogging = process.env.DEBUG_MODE === 'true' || !this.hasRunDetection;
      
      if (verboseLogging) {
        console.log('Starting camera detection process...');
      }
      
      // Track that we've run detection at least once
      this.hasRunDetection = true;
      
      // First check for Canon cameras via v4l2
      const canonCamera = await this.detectCanonCamera();
      
      if (canonCamera.detected) {
        // Only log if it's a new camera or during verbose logging
        if (!this.lastDetectedDevice || 
            this.lastDetectedDevice !== canonCamera.device || 
            verboseLogging) {
          console.log(`Canon camera detected: ${canonCamera.model} at ${canonCamera.device}`);
          this.lastDetectedDevice = canonCamera.device;
        }
        return canonCamera;
      }
      
      // If no Canon camera, check for other webcams
      const webcam = await this.detectWebcam();
      if (webcam.detected) {
        // Only log if it's a new camera or during verbose logging
        if (!this.lastDetectedDevice || 
            this.lastDetectedDevice !== webcam.device || 
            verboseLogging) {
          console.log(`Webcam detected: ${webcam.model} at ${webcam.device}`);
          this.lastDetectedDevice = webcam.device;
        }
      } else if (verboseLogging) {
        console.log('No cameras detected');
        this.lastDetectedDevice = null;
      }
      
      return webcam;
    } catch (error) {
      console.error('Error detecting camera:', error);
      return {
        detected: false,
        device: null,
        type: null,
        model: null,
        error
      };
    }
  }
  
  /**
   * Detect Canon cameras using v4l2-ctl
   * @returns {Promise<Object>} Detection result
   */
  async detectCanonCamera() {
    return new Promise((resolve) => {
      try {
        // On macOS or Windows, just use a placeholder since we're developing
        if (process.platform === 'darwin' || process.platform === 'win32') {
          // Only log once or when in debug mode
          const shouldLog = process.env.DEBUG_MODE === 'true' || !this.hasLoggedDevMode;
          if (shouldLog) {
            console.log(`Development mode detected on ${process.platform}. Using placeholder camera.`);
            this.hasLoggedDevMode = true;
          }
          resolve({
            detected: true,
            device: '/dev/video0', // Fake device
            type: 'canon',
            model: "Canon Camera (Development Mode)"
          });
          return;
        }
        
        // On Linux, proceed with actual camera detection
        // Check for v4l2 devices with "Canon" in the name
        const checkV4l2Cmd = spawn('v4l2-ctl', ['--list-devices']);
        let output = '';
        
        checkV4l2Cmd.stdout.on('data', (data) => {
          output += data.toString();
        });
        
        checkV4l2Cmd.on('close', (code) => {
          if (code !== 0) {
            console.error('Error checking v4l2 devices');
            resolve({
              detected: false,
              device: null,
              type: null,
              model: null
            });
            return;
          }
          
          // Look for Canon cameras in device list
          const canonMatch = output.match(/Canon.*\n\s*([\/\w\d]+)/i);
          
          if (canonMatch && canonMatch[1]) {
            const device = canonMatch[1].trim();
            // Check if we've already logged this device
            if (!this.lastLoggedDevice || this.lastLoggedDevice !== device || process.env.DEBUG_MODE === 'true') {
              console.log(`Found Canon camera as v4l2 device: ${device}`);
              this.lastLoggedDevice = device;
            }
            resolve({
              detected: true,
              device,
              type: 'canon',
              model: "Canon Camera (v4l2 mode)"
            });
          } else {
            // Look for any v4l2loopback device that might be a Canon camera
            const videoDevices = fs.readdirSync('/dev').filter(d => d.startsWith('video'));
            
            if (videoDevices.length > 0) {
              // Use v4l2-ctl to check each device for its capabilities
              this.checkV4l2LoopbackDevices(videoDevices).then(result => {
                resolve(result);
              });
            } else {
              if (process.env.DEBUG_MODE === 'true') {
                console.log('No video devices found');
              }
              resolve({
                detected: false,
                device: null,
                type: null,
                model: null
              });
            }
          }
        });
        
        checkV4l2Cmd.on('error', (error) => {
          console.error('Error executing v4l2-ctl:', error);
          // If we're on a development system without v4l2-ctl, use placeholder
          if (error.code === 'ENOENT') {
            console.log('v4l2-ctl not found. Using placeholder for development.');
            resolve({
              detected: true,
              device: '/dev/video0', // Fake device
              type: 'canon',
              model: "Canon Camera (Development Mode)"
            });
          } else {
            resolve({
              detected: false,
              device: null,
              type: null,
              model: null
            });
          }
        });
      } catch (error) {
        console.error('Error checking for Canon camera with v4l2:', error);
        resolve({
          detected: false,
          device: null,
          type: null,
          model: null,
          error
        });
      }
    });
  }
  
  /**
   * Check for v4l2loopback devices that might be Canon cameras
   * @param {string[]} videoDevices - Array of video device names
   * @returns {Promise<Object>} Detection result
   */
  async checkV4l2LoopbackDevices(videoDevices) {
    // Track already checked devices to avoid repetitive logs
    this.checkedDevices = this.checkedDevices || new Set();
    
    // Check each video device to see if it's a v4l2loopback device
    for (const device of videoDevices) {
      const devicePath = `/dev/${device}`;
      
      // Skip already checked devices unless in debug mode
      if (this.checkedDevices.has(devicePath) && process.env.DEBUG_MODE !== 'true') {
        continue;
      }
      
      // Add to checked devices
      this.checkedDevices.add(devicePath);
      
      try {
        // Use v4l2-ctl to check device information
        const checkDeviceCmd = spawn('v4l2-ctl', ['--device', devicePath, '--all']);
        let deviceOutput = '';
        
        await new Promise((resolve) => {
          checkDeviceCmd.stdout.on('data', (data) => {
            deviceOutput += data.toString();
          });
          
          checkDeviceCmd.on('close', (code) => {
            resolve();
          });
          
          checkDeviceCmd.on('error', () => {
            resolve();
          });
        });
        
        // Check if it's a v4l2loopback device
        if (deviceOutput.includes('v4l2loopback') || 
            deviceOutput.includes('dummy video device') ||
            deviceOutput.includes('loopback')) {
          // Only log if we haven't logged this device before or in debug mode
          if (!this.lastLoopbackDevice || this.lastLoopbackDevice !== devicePath || process.env.DEBUG_MODE === 'true') {
            console.log(`Found potential Canon device via v4l2loopback: ${devicePath}`);
            this.lastLoopbackDevice = devicePath;
          }
          return {
            detected: true,
            device: devicePath,
            type: 'canon',
            model: "Canon Camera (v4l2loopback)"
          };
        }
      } catch (error) {
        console.error(`Error checking device ${devicePath}:`, error);
      }
    }
    
    return {
      detected: false,
      device: null,
      type: null,
      model: null
    };
  }
  
  /**
   * Check for webcams on Linux
   * @returns {Promise<Object>} Detection result
   */
  async detectWebcam() {
    return new Promise((resolve) => {
      try {
        // On non-Linux platforms, return a mock device for development
        if (process.platform !== 'linux') {
          resolve({
            detected: true,
            device: '/dev/video0',
            type: 'webcam',
            model: 'Webcam (Development Mode)'
          });
          return;
        }

        // First, check if we have video devices
        const v4l2Devices = fs.readdirSync('/dev').filter(file => file.startsWith('video'));
        
        // If no video devices, no webcam
        if (v4l2Devices.length === 0) {
          resolve({
            detected: false,
            device: null,
            type: null,
            model: null
          });
          return;
        }
        
        // Check if the video device is actually a webcam using v4l2-ctl
        const v4l2ctl = spawn('v4l2-ctl', ['--list-devices']);
        let v4l2Output = '';
        
        v4l2ctl.stdout.on('data', (data) => {
          v4l2Output += data.toString();
        });
        
        v4l2ctl.on('close', (code) => {
          // If v4l2-ctl worked, check for webcam keywords
          if (code === 0) {
            const isWebcam = /webcam|camera|cam|uvc|video/i.test(v4l2Output);
            
            if (isWebcam) {
              // Try to extract the camera model
              const modelMatch = v4l2Output.match(/([A-Za-z0-9\s]+)(?=\s*:\s*\/dev\/video)/);
              const model = modelMatch && modelMatch[1] ? modelMatch[1].trim() : 'USB Webcam';
              
              // Use the first video device for webcam
              const device = `/dev/${v4l2Devices[0]}`;
              console.log(`Detected webcam on Linux: ${model}`);
              
              resolve({
                detected: true,
                device,
                type: 'webcam',
                model
              });
              return;
            }
          }
          
          // If v4l2-ctl didn't find a webcam, try lsusb as a fallback
          const lsusb = spawn('lsusb');
          let lsusbOutput = '';
          
          lsusb.stdout.on('data', (data) => {
            lsusbOutput += data.toString();
          });
          
          lsusb.on('close', (lsusbCode) => {
            // Look for webcam identifiers in lsusb output
            const webcamRegex = /webcam|camera\s+|logitech.*camera|microsoft.*camera|integrated.*camera/i;
            const isWebcamLsusb = webcamRegex.test(lsusbOutput);
            
            if (isWebcamLsusb) {
              const device = `/dev/${v4l2Devices[0]}`;
              console.log('Detected webcam on Linux (lsusb)');
              
              resolve({
                detected: true,
                device,
                type: 'webcam',
                model: 'USB Webcam'
              });
            } else {
              // No webcam detected
              resolve({
                detected: false,
                device: null,
                type: null,
                model: null
              });
            }
          });
          
          lsusb.on('error', () => {
            // If lsusb fails, we can't confirm it's a webcam
            resolve({
              detected: false,
              device: null,
              type: null,
              model: null
            });
          });
        });
        
        v4l2ctl.on('error', () => {
          // If v4l2-ctl fails, we can't be sure it's a webcam
          resolve({
            detected: false,
            device: null,
            type: null,
            model: null
          });
        });
      } catch (error) {
        console.error('Error checking for webcams:', error);
        resolve({
          detected: false,
          device: null,
          type: null,
          model: null,
          error
        });
      }
    });
  }
}

// Export a singleton instance
const cameraDetectionService = new CameraDetectionService();
module.exports = cameraDetectionService;

/**
 * Central Camera Service - Main Entry Point
 * This file serves as the entry point for the camera service functionality
 */
const cameraDetection = require('./camera-detection.service');
const cameraStream = require('./camera-stream.service');
const cameraCapture = require('./camera-capture.service');
const imageProcessing = require('./image-processing.service');
const deviceManager = require('./device-manager.service');

/**
 * Simplified Camera Service for Linux platforms with Canon cameras
 * Acts as facade for the modularized camera service components
 */
class CameraService {
  constructor() {
    // Initialize sub-services
    this.detector = cameraDetection;
    this.streamer = cameraStream;
    this.capture = cameraCapture;
    this.imageProcessor = imageProcessing;
    this.deviceManager = deviceManager;
    
    // Forward properties from sub-services for compatibility
    // This maintains the same public API as before
    this.cameraConnected = false;
    this.cameraType = null;
    this.cameraModel = null;
    this.v4l2Device = null;
    this.setupStatus = null;
    this.mjpegProcess = null;
    this.mjpegUrl = null;
    
    console.log('Camera service initialized with modular architecture');
  }
  
  /**
   * Initialize the camera service with automatic setup
   */
  async init() {
    try {
      console.log('Initializing camera service with automatic setup...');
      
      // Initialize the device manager first
      await this.deviceManager.init();
      
      // Subscribe to device changes
      this.deviceManager.onDeviceChange = (changes) => {
        console.log('Device changes detected by camera service:', changes);
        this.checkCameraReconnection();
      };
      
      // Check camera availability
      const cameraAvailable = await this.checkCameraAvailability();
      
      if (!cameraAvailable) {
        console.error('No camera detected');
        this.cameraConnected = false;
        this.setupStatus = this.deviceManager.getSetupStatus('camera');
        this.deviceManager.startReconnectionTimer(this.checkCameraReconnection.bind(this));
        return false;
      }
      
      // Camera is available
      this.cameraConnected = true;
      this.setupStatus = {
        success: true,
        message: 'Camera initialized successfully',
        needsSetup: false
      };
      
      // Start the camera stream
      this.startCameraStream();
      
      // Start the reconnection timer
      this.deviceManager.startReconnectionTimer(this.checkCameraReconnection.bind(this));
      
      return true;
    } catch (error) {
      console.error('Error initializing camera service:', error);
      this.cameraConnected = false;
      this.setupStatus = {
        success: false,
        message: `Error during initialization: ${error.message}`,
        needsSetup: true,
        setupType: 'error',
        error: error
      };
      
      // Start the reconnection timer
      this.deviceManager.startReconnectionTimer(this.checkCameraReconnection.bind(this));
      
      return false;
    }
  }
  
  /**
   * Check for camera reconnection
   */
  async checkCameraReconnection() {
    try {
      // Store previous camera state
      const previouslyConnected = this.cameraConnected;
      const previousCameraType = this.cameraType;
      const previousCameraModel = this.cameraModel;
      const previousDevice = this.v4l2Device;
      
      // Check if a camera is available
      const cameraAvailable = await this.checkCameraAvailability();
      
      // Camera was disconnected but is now available
      if (!previouslyConnected && cameraAvailable) {
        console.log(`Camera reconnected: ${this.cameraModel} (${this.cameraType}) on ${this.v4l2Device}`);
        this.cameraConnected = true;
        this.startCameraStream();
        return true;
      }
      
      // Camera was connected but is now disconnected
      if (previouslyConnected && !cameraAvailable) {
        console.log('Camera disconnected');
        this.cameraConnected = false;
        this.stopCameraStream();
        return false;
      }
      
      // Device path changed, camera type changed, or model changed
      if (previouslyConnected && cameraAvailable && 
          (previousDevice !== this.v4l2Device || 
          previousCameraType !== this.cameraType || 
          previousCameraModel !== this.cameraModel)) {
        
        console.log(`Camera changed or moved: ${previousCameraModel} (${previousCameraType}) on ${previousDevice} → ${this.cameraModel} (${this.cameraType}) on ${this.v4l2Device}`);
        
        // Restart the camera stream with the new device path
        this.stopCameraStream();
        this.startCameraStream();
        
        return true;
      }
      
      return cameraAvailable;
    } catch (error) {
      console.error('Error checking camera reconnection:', error);
      return false;
    }
  }
  
  /**
   * Check if a camera is available
   */
  async checkCameraAvailability() {
    try {
      // Use the dedicated camera detection service
      const result = await this.detector.detectCamera();
      
      if (result.detected) {
        // Update this service's properties from the detection result
        this.v4l2Device = result.device;
        this.cameraType = result.type;
        this.cameraModel = result.model;
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error checking camera availability:', error);
      return false;
    }
  }
  
  /**
   * Start the camera stream
   */
  startCameraStream() {
    try {
      if (!this.v4l2Device) {
        console.log('No v4l2 device available for streaming');
        return;
      }
      
      // Use the dedicated streaming service
      const streamResult = this.streamer.startStream(this.v4l2Device, this.cameraType, this.cameraModel);
      
      // Update this service's properties from the stream result
      this.mjpegProcess = streamResult.mjpegProcess;
      this.mjpegUrl = streamResult.mjpegUrl;
      
      console.log(`Camera stream started (${this.cameraType} mode)`);
    } catch (error) {
      console.error('Error starting camera stream:', error);
    }
  }
  
  /**
   * Stop the camera stream
   */
  stopCameraStream() {
    try {
      // Use the dedicated streaming service
      this.streamer.stopStream();
      
      // Update this service's properties
      this.mjpegProcess = null;
      this.mjpegUrl = null;
      
      console.log('Camera stream stopped');
    } catch (error) {
      console.error('Error stopping camera stream:', error);
    }
  }
  
  /**
   * Get the stream URL
   */
  getStreamUrl() {
    return this.streamer.getStreamUrl(this.cameraConnected, this.v4l2Device, this.cameraType);
  }
  
  /**
   * Get the MJPEG stream process for controller use
   */
  getMjpegProcess() {
    return this.mjpegProcess;
  }
  
  /**
   * Capture a photo
   * @param {boolean} awsAvailable - Whether AWS S3 is available for storage
   */
  async capturePhoto(awsAvailable = true) {
    try {
      if (!this.v4l2Device) {
        throw new Error('No camera device available for capture');
      }
      
      // Capture using the dedicated capture service
      const captureResult = await this.capture.capturePhoto(
        this.v4l2Device, 
        this.cameraType, 
        this.cameraModel,
        this.streamer
      );
      
      if (!captureResult.success) {
        throw new Error('Photo capture failed');
      }
      
      // Process the image with the dedicated image processing service
      return await this.imageProcessor.processPhoto(
        captureResult.path, 
        captureResult.filename, 
        awsAvailable,
        this.cameraType,
        this.cameraModel
      );
    } catch (error) {
      console.error('Error capturing photo:', error);
      throw error;
    }
  }
  
  /**
   * Verify if a device actually exists and is usable
   * @param {string} devicePath - The device path to check
   */
  async verifyDeviceExists(devicePath) {
    return this.deviceManager.verifyDevice(devicePath);
  }
}

// Export a singleton instance
const cameraService = new CameraService();
module.exports = cameraService;

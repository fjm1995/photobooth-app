/**
 * Camera Capture Controller
 * Handles photo capture endpoints
 */
const cameraService = require('../../services/camera');
const { S3Client, ListBucketsCommand } = require('@aws-sdk/client-s3');

// Initialize AWS services
const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

/**
 * Capture photo
 */
// Track capture requests to prevent excessive simultaneous captures
let activeCaptureOperations = 0;
let lastCaptureAttempt = 0;
const MAX_CAPTURE_OPERATIONS = 1; // Only allow one capture at a time
const CAPTURE_COOLDOWN_MS = 5000;  // 5 second cooldown between capture operations

exports.capturePhoto = async (req, res) => {
  try {
    const now = Date.now();
    
    // Check if we've reached maximum capture operations
    if (activeCaptureOperations >= MAX_CAPTURE_OPERATIONS) {
      console.log(`Capture rejected - already capturing (active: ${activeCaptureOperations})`);
      return res.status(429).json({
        success: false,
        message: 'Photo capture already in progress, please try again in a moment'
      });
    }
    
    // Check for capture request rate limiting
    if (now - lastCaptureAttempt < CAPTURE_COOLDOWN_MS) {
      console.log(`Rate limiting photo capture (last attempt: ${now - lastCaptureAttempt}ms ago)`);
      return res.status(429).json({
        success: false,
        message: 'Please wait a moment before taking another photo'
      });
    }
    
    // Update trackers
    lastCaptureAttempt = now;
    activeCaptureOperations++;
    
    // Set up cleanup function
    const cleanupCapture = () => {
      activeCaptureOperations = Math.max(0, activeCaptureOperations - 1);
      console.log(`Capture operation completed (remaining: ${activeCaptureOperations})`);
    };
    
    // Add cleanup to response events
    res.on('finish', cleanupCapture);
    res.on('close', cleanupCapture);
    
    // Get the phone number from the request body
    let phoneNumber = null;
    if (req.body && req.body.phoneNumber) {
      phoneNumber = req.body.phoneNumber;
      console.log(`Received phone number: ${phoneNumber}`);
    }
    
    // Check if AWS is available
    let awsAvailable = true;
    
    try {
      // Try a simple AWS operation to check connectivity
      await s3.send(new ListBucketsCommand({}));
      console.log('AWS connectivity verified');
    } catch (error) {
      console.warn('AWS services unavailable, using local storage:', error.message);
      awsAvailable = false;
    }
    
    // Capture the photo
    const result = await cameraService.capturePhoto(awsAvailable);
    
    // Log the full result for debugging
    console.log('Photo capture result from camera service:', JSON.stringify(result, null, 2));
    
    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: 'Error capturing photo'
      });
    }
    
    // Restart camera stream to prevent issues after capture
    try {
      // Stop and restart the camera stream to ensure it's in a clean state for the next use
      cameraService.stopCameraStream();
      setTimeout(() => {
        cameraService.startCameraStream();
        console.log('Camera stream restarted after photo capture');
      }, 500);
    } catch (streamError) {
      console.error('Error restarting camera stream after capture:', streamError);
      // Continue despite stream restart errors
    }
    
    // If we have a phone number, send the SMS with the image URL
    if (phoneNumber) {
      try {
        // Import the SMS service
        const smsService = require('../../services/sms.service');
        
        // Get the URL to send via SMS (prefer signed URL if available)
        const imageUrl = result.signedUrl || result.imageUrl || result.s3Path;
        
        // Send the SMS
        const smsResult = await smsService.sendMessage(phoneNumber, imageUrl);
        console.log('SMS sending result:', smsResult);
        
        // Return the result including SMS status
        return res.status(200).json({
          success: true,
          message: 'Photo captured and SMS sent successfully',
          imageUrl: result.imageUrl || result.s3Path,
          signedUrl: result.signedUrl,
          filename: result.filename,
          awsStatus: result.awsStatus,
          smsStatus: smsResult.status
        });
      } catch (smsError) {
        console.error('Error sending SMS:', smsError);
        
        // Still return success for the photo capture part
        return res.status(200).json({
          success: true,
          message: 'Photo captured successfully but SMS sending failed',
          imageUrl: result.imageUrl || result.s3Path,
          signedUrl: result.signedUrl,
          filename: result.filename,
          awsStatus: result.awsStatus,
          smsError: smsError.message
        });
      }
    } else {
      // Return the result without SMS information
      // Log full result for debugging
      console.log('Photo result before formatting response:', JSON.stringify(result));
      
      // Create a direct proxy URL for image display (ensures same URL as SMS)
      let displayUrl = null;
      if (result.filename) {
        // Always use the proxy URL for consistent behavior
        displayUrl = `/api/photo/view/${result.filename}`;
      }
      
      return res.status(200).json({
        success: true,
        message: 'Photo captured successfully',
        imageUrl: displayUrl || result.imageUrl || result.s3Path || '', 
        signedUrl: result.signedUrl || '',
        filename: result.filename || '',
        awsStatus: result.awsStatus || 'unknown'
      });
    }
  } catch (error) {
    console.error('Error capturing photo:', error);
    return res.status(500).json({
      success: false,
      message: 'Error capturing photo',
      error: error.message
    });
  }
};

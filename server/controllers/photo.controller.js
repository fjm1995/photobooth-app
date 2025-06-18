const { GetObjectCommand } = require('@aws-sdk/client-s3'); // Keep GetObjectCommand
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const awsConfig = require('../config/aws'); // Import centralized AWS config

// Use clients from centralized config
const s3 = awsConfig.s3;
const sns = awsConfig.sns;

// Upload photo controller
exports.uploadPhoto = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: 'No photo uploaded' 
      });
    }

    // Check if AWS is available using the centralized config status
    const awsAvailable = awsConfig.isAwsAvailable();
    
    if (awsAvailable) {
      // Generate a signed URL for the uploaded file (valid for 1 hour)
      const command = new GetObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: req.file.key
      });
      const signedUrl = await getSignedUrl(s3, command, { expiresIn: 604800 }); // URL expires in 7 days
  
      return res.status(200).json({
        success: true,
        message: 'Photo uploaded successfully',
        data: {
          key: req.file.key,
          location: req.file.location, // S3 URL
          signedUrl: signedUrl,
          contentType: req.file.contentType,
          awsStatus: 'available'
        }
      });
    } else {
      // Store locally
      const fs = require('fs');
      const path = require('path');
      const { v4: uuidv4 } = require('uuid');
      
      // Generate a unique filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const uniqueId = uuidv4();
      const filename = `${timestamp}_${uniqueId}.jpg`;
      
      // Create the public directory if it doesn't exist
      const publicDir = path.join(process.cwd(), 'public', 'captures');
      if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
      }
      
      // Copy the file to the public directory
      const publicPath = path.join(publicDir, filename);
      fs.copyFileSync(req.file.path, publicPath);
      
      // Generate a local URL
      const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
      const imageUrl = `${baseUrl}/captures/${filename}`;
      
      return res.status(200).json({
        success: true,
        message: 'Photo uploaded successfully (local storage)',
        data: {
          filename,
          imageUrl,
          signedUrl: imageUrl, // Use the same URL for consistency
          contentType: req.file.mimetype,
          awsStatus: 'unavailable'
        }
      });
    }
  } catch (error) {
    console.error('Error uploading photo:', error);
    return res.status(500).json({
      success: false,
      message: 'Error uploading photo',
      error: error.message
    });
  }
};

// Generate QR code for the image URL
exports.generateQRCode = async (req, res) => {
  try {
    const { imageUrl } = req.body;
    const path = require('path');
    
    if (!imageUrl) {
      return res.status(400).json({
        success: false,
        message: 'Image URL is required'
      });
    }
    
    // Generate QR code
    const qrCodeService = require('../services/qrcode.service');
    const result = await qrCodeService.generateQRCode(imageUrl);
    
    return res.status(200).json({
      success: true,
      message: 'QR code generated successfully',
      data: {
        qrCode: result.qrDataUrl,
        imageUrl: result.imageUrl,
        id: result.id
      }
    });
  } catch (error) {
    console.error('Error generating QR code:', error);
    return res.status(500).json({
      success: false,
      message: 'Error generating QR code',
      error: error.message
    });
  }
};

// Send notification (Email only now that SMS is removed)
exports.sendNotification = async (req, res) => {
  try {
    const { recipient, imageUrl, type } = req.body;
    const path = require('path');
    
    if (!recipient || !imageUrl) {
      return res.status(400).json({
        success: false,
        message: 'Recipient and image URL are required'
      });
    }
    
    if (!type || type !== 'email') {
      return res.status(400).json({
        success: false,
        message: 'Valid notification type (email) is required'
      });
    }
    
    // Email only since SMS is removed
    const emailService = require('../services/email.service');
    
    try {
      // Try to send email
      const result = await emailService.sendEmail(recipient, imageUrl);
      
      return res.status(200).json({
        success: true,
        message: 'Email sent successfully',
        data: {
          messageId: result.id,
          status: result.status,
          type: 'email'
        }
      });
    } catch (error) {
      console.warn('Email service unavailable, using fallback mode:', error.message);
      
      // Fallback to queue if email service fails
      const queueDir = path.join(process.cwd(), 'queued_messages');
      const queueResult = await emailService.queueEmail(recipient, imageUrl, queueDir);
      
      return res.status(200).json({
        success: true,
        message: 'Email queued for later delivery (service unavailable)',
        data: {
          messageId: queueResult.id,
          status: 'queued',
          type: 'email'
        }
      });
    }
  } catch (error) {
    console.error('Error sending notification:', error);
    return res.status(500).json({
      success: false,
      message: 'Error sending notification',
      error: error.message
    });
  }
};

// Legacy SMS endpoint replaced with QR code generation
exports.sendSMS = async (req, res) => {
  try {
    const { imageUrl } = req.body;
    
    if (!imageUrl) {
      return res.status(400).json({
        success: false,
        message: 'Image URL is required'
      });
    }
    
    // Generate QR code instead of sending SMS
    return await exports.generateQRCode(req, res);
  } catch (error) {
    console.error('Error in QR code generation endpoint:', error);
    return res.status(500).json({
      success: false,
      message: 'Error generating QR code',
      error: error.message
    });
  }
};

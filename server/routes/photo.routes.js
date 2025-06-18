const express = require('express');
const router = express.Router();
const multer = require('multer');
const multerS3 = require('multer-s3');
const { GetObjectCommand } = require('@aws-sdk/client-s3'); // Keep GetObjectCommand
const awsConfig = require('../config/aws'); // Import centralized AWS config
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Use the S3 client from the centralized config
const s3 = awsConfig.s3;

// Configure local storage for fallback
const localStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(process.cwd(), 'public', 'captures');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const uniqueId = uuidv4();
    const fileExt = path.extname(file.originalname) || '.jpg';
    cb(null, `${timestamp}_${uniqueId}${fileExt}`);
  }
});

// Configure multer for S3 uploads with fallback to local storage
let storage;
try {
  // Try to use S3 storage with high-quality settings
  storage = multerS3({
    s3: s3,
    bucket: process.env.S3_BUCKET_NAME,
    acl: 'private', // Make files private by default
    contentType: multerS3.AUTO_CONTENT_TYPE,
    metadata: (req, file, cb) => {
      cb(null, { 
        fieldName: file.fieldname,
        highQuality: 'true', // Flag as high quality
        originalSize: 'preserved' // Flag that original size is preserved
      });
    },
    key: (req, file, cb) => {
      // Generate a unique filename with original extension
      const uniqueId = uuidv4();
      const fileExt = path.extname(file.originalname) || '.jpg';
      cb(null, `photos/${uniqueId}${fileExt}`);
    }
  });
  console.log('Using S3 storage for uploads with high-quality settings');
} catch (error) {
  console.warn('Error configuring S3 storage, using local storage:', error.message);
  storage = localStorage;
}

// Configure multer
const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    // Only accept image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max file size
  }
});

// Import controllers
const photoController = require('../controllers/photo.controller');

// Routes
router.post('/upload', upload.single('photo'), (req, res) => {
  console.log('Processing upload request');
  return photoController.uploadPhoto(req, res);
});
router.post('/generate-qrcode', (req, res) => {
  console.log('Processing QR code generation request:', req.body);
  return photoController.generateQRCode(req, res);
});
router.post('/send-notification', (req, res) => {
  console.log('Processing notification request:', req.body);
  return photoController.sendNotification(req, res);
});
router.post('/send-sms', (req, res) => {
  console.log('Processing SMS request (redirected to QR code):', req.body);
  return photoController.sendSMS(req, res);
}); // Legacy endpoint redirected to QR code generation

// Add a proxy endpoint for S3 images to avoid CORS issues
router.get('/view/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    console.log('Proxying S3 image:', filename);
    
    // Check if AWS is available using the centralized config status
    const awsAvailable = awsConfig.isAwsAvailable();
    console.log('Routing /api/photo request based on AWS availability:', awsAvailable);
    
    // First try to get the file from local storage regardless of AWS availability
    // This ensures we always serve the image even if S3 has issues
    const localPath = path.join(process.cwd(), 'public', 'captures', filename);
    if (fs.existsSync(localPath)) {
      console.log('Found local file, serving it directly:', localPath);
      
      // Set appropriate headers for high-quality images
      res.set('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
      
      // Handle download parameter
      if (req.query.download === 'true') {
        res.set('Content-Disposition', `attachment; filename="${filename}"`);
      } else {
        res.set('Content-Disposition', `inline; filename="${filename}"`);
      }
      
      // Send the file
      return res.sendFile(localPath);
    }
    
    // If no local file and AWS is available, try S3
    if (awsAvailable) {
      // Try multiple possible S3 key formats since we're not sure which one was used
      const possibleKeys = [
        `photos/${filename}`,             // Standard format
        filename,                         // Direct filename
        `${filename}`                     // Another potential format
      ];
      
      console.log('Trying S3 with possible keys:', JSON.stringify(possibleKeys));
      
      // Try each key pattern
      let s3Object = null;
      let foundKey = null;
      
      for (const key of possibleKeys) {
        try {
          const command = new GetObjectCommand({
            Bucket: process.env.S3_BUCKET_NAME,
            Key: key
          });
          
          s3Object = await s3.send(command);
          foundKey = key;
          console.log(`Successfully found image in S3 with key: ${key}`);
          break; // Exit loop if successful
        } catch (keyError) {
          console.log(`Key not found in S3: ${key}`);
          // Continue to next key
        }
      }
      
      // If we found the object, serve it
      if (s3Object) {
        // Set appropriate headers
        res.set('Content-Type', s3Object.ContentType || 'image/jpeg');
        res.set('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
        
        // Handle download parameter
        if (req.query.download === 'true') {
          res.set('Content-Disposition', `attachment; filename="${filename}"`);
          console.log('Setting download headers for file:', filename);
        } else {
          res.set('Content-Disposition', `inline; filename="${filename}"`);
        }
        
        if (s3Object.Metadata) {
          console.log('S3 image metadata:', s3Object.Metadata);
          // Pass through any metadata headers that might be useful
          if (s3Object.Metadata['high-quality']) {
            res.set('X-High-Quality', s3Object.Metadata['high-quality']);
          }
          if (s3Object.Metadata['original-size']) {
            res.set('X-Original-Size', s3Object.Metadata['original-size']);
          }
        }
        
        // Convert the readable stream to a buffer and send it without any processing
        const chunks = [];
        for await (const chunk of s3Object.Body) {
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        
        // Send the image data without any transformation
        return res.send(buffer);
      }
    }
    
    // If we get here, we couldn't find the file either in S3 or locally
    return res.status(404).json({
      success: false,
      message: 'Image not found'
    });
  } catch (error) {
    console.error('Error proxying image:', error);
    return res.status(500).json({
      success: false,
      message: 'Error proxying image',
      error: error.message
    });
  }
});

module.exports = router;

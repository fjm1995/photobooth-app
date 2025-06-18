const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Configure multer for memory storage (we'll handle file saving in the controller)
const storage = multer.memoryStorage();

// File filter to only accept image files
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max file size
  }
});

// Import fallback controller - fixed path to use the correct location
const photoController = require('../controllers/photo.controller.fallback');

// Routes
router.post('/upload', upload.single('photo'), photoController.uploadPhoto);
router.post('/send-notification', photoController.sendNotification);
router.post('/send-sms', photoController.sendSMS); // Legacy endpoint for backward compatibility

module.exports = router;

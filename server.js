require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
// AWS SDK clients are now initialized in aws.js
const { GetObjectCommand } = require('@aws-sdk/client-s3'); // Keep GetObjectCommand for proxy if needed
const awsConfig = require('./server/config/aws'); // Import centralized AWS config

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Create backup directories if they don't exist
const backupDir = path.join(__dirname, 'backup_photos');
const queueDir = path.join(__dirname, 'queued_messages');

if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

if (!fs.existsSync(queueDir)) {
  fs.mkdirSync(queueDir, { recursive: true });
}

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Serve photos and images for access
app.use('/backup', express.static(path.join(__dirname, 'backup_photos')));
app.use('/captures', express.static(path.join(__dirname, 'public', 'captures')));
app.use('/images', express.static(path.join(__dirname, 'images')));

// Import routes
const photoRoutes = require('./server/routes/photo.routes');
const fallbackRoutes = require('./server/routes/photo.routes.fallback');
const cameraRoutes = require('./server/routes/camera.routes');

// Import services
const recoveryService = require('./server/services/recovery.service');
const cameraService = require('./server/services/camera.service');

// Use camera routes
app.use('/api/camera', cameraRoutes);

// Add direct route for photo upload
app.post('/api/upload', (req, res) => {
  console.log('Upload request received, redirecting to camera capture endpoint');
  res.redirect(307, '/api/camera/capture'); // 307 preserves the HTTP method (POST)
});

// Middleware to check AWS availability (using centralized config) and use appropriate routes for photo operations
app.use('/api/photo', (req, res, next) => {
  try {
    // Check AWS availability using the centralized config status
    const awsAvailable = awsConfig.isAwsAvailable();
    
    // Add AWS status to request for logging
    req.awsAvailable = awsAvailable;
    
    // Log the status being used for routing
    console.log(`Routing /api/photo request based on AWS availability: ${awsAvailable}`);
    
    // Use appropriate routes based on AWS availability
    if (awsAvailable) {
      // Use AWS routes
      return photoRoutes(req, res, next);
    } else {
      // Use fallback routes
      return fallbackRoutes(req, res, next);
    }
  } catch (error) {
    console.error('Error in AWS availability middleware:', error);
    next(error);
  }
});

// Create endpoint for camera stream
app.get('/camera-stream', (req, res) => {
  const streamUrl = cameraService.getStreamUrl();
  if (streamUrl) {
    res.redirect(streamUrl);
  } else {
    res.status(503).send('Camera stream not available');
  }
});

// Initialize services
(async () => {
  try {
    console.log('Initializing services...');
    
    // Initialize camera service
    console.log('Initializing camera service...');
    const cameraInitialized = await cameraService.init();
    if (cameraInitialized) {
      console.log('Camera service initialized successfully');
    } else {
      console.warn('Camera service initialization failed');
      console.log('Please make sure your Canon camera is connected and properly set up with v4l2loopback');
      console.log('You can run sudo ./scripts/setup-canon-v4l2.sh to set up your camera');
    }
    
    // Initialize recovery service
    console.log('Initializing recovery service...');
    recoveryService.init();
    
    console.log('All services initialized');
  } catch (error) {
    console.error('Error initializing services:', error);
  }
})();

// Expose environment configuration to the frontend
app.get('/api/config', (req, res) => {
  // Only expose necessary configuration settings
  res.json({
    debug: process.env.DEBUG_MODE === 'true',
    environment: process.env.NODE_ENV,
    verboseLogging: process.env.VERBOSE_LOGGING === 'true',
    logoSizePercent: parseFloat(process.env.LOGO_SIZE_PERCENT || '11.2') // Add logo size from env
  });
});

// Serve the main HTML file for any other route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server with error handling to prevent multiple instances
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`
=======================================================
Photobooth Server (Linux Optimized)
=======================================================
Server running on port ${PORT}

Local access:        http://localhost:${PORT}
Network access:      http://<server-ip>:${PORT}
=======================================================
`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`
=======================================================
ERROR: Port ${PORT} is already in use
=======================================================
The photobooth application is already running.

To force stop the existing server:
  1. Run: pkill -f "node server.js"
  2. Then try starting the server again

Alternative: Use a different port
  PORT=3001 npm start
=======================================================
`);
    process.exit(1);
  } else {
    console.error('Error starting server:', err);
    process.exit(1);
  }
});

// Handle process termination gracefully
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Graceful shutdown function
function gracefulShutdown() {
  console.log('Shutting down photobooth server gracefully...');
  
  // Stop any active camera processes
  if (cameraService && typeof cameraService.stopCameraStream === 'function') {
    cameraService.stopCameraStream();
  }
  
  // Close the HTTP server
  server.close(() => {
    console.log('Server closed, exiting process...');
    process.exit(0);
  });
  
  // Force close if it takes too long
  setTimeout(() => {
    console.error('Server shutdown timed out, forcing exit...');
    process.exit(1);
  }, 5000);
}

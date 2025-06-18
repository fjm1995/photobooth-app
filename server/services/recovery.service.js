const fs = require('fs');
const path = require('path');
const { ListBucketsCommand, PutObjectCommand } = require('@aws-sdk/client-s3'); // Keep S3 commands
const { PublishCommand } = require('@aws-sdk/client-sns'); // Keep SNS command
const awsConfig = require('../config/aws'); // Import centralized AWS config
const { promisify } = require('util');
const readdir = promisify(fs.readdir);
const readFile = promisify(fs.readFile);
const unlink = promisify(fs.unlink);

class RecoveryService {
  constructor() {
    // Use clients from centralized config
    this.s3 = awsConfig.s3;
    this.sns = awsConfig.sns;
    this.backupDir = path.join(process.cwd(), 'backup_photos');
    this.queueDir = path.join(process.cwd(), 'queued_messages');
    this.isRunning = false;
    this.checkInterval = 5 * 60 * 1000; // 5 minutes
    this.maxRetries = 5;
    this.awsAvailable = false;
  }

  // Initialize the recovery service
  init() {
    console.log('Recovery service initialized');
    this.startMonitoring();
  }

  // Start monitoring AWS connectivity
  startMonitoring() {
    this.isRunning = true;
    this.checkAwsAvailability();
    
    // Set up interval to check AWS availability
    this.intervalId = setInterval(() => {
      this.checkAwsAvailability();
    }, this.checkInterval);
    
    console.log(`Recovery service monitoring started (checking every ${this.checkInterval / 60000} minutes)`);
  }

  // Stop monitoring
  stopMonitoring() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.isRunning = false;
      console.log('Recovery service monitoring stopped');
    }
  }

  // Check if AWS is available
  async checkAwsAvailability() {
    // Check if clients were initialized in the config
    if (!awsConfig.isAwsAvailable()) {
      const wasAvailable = this.awsAvailable;
      this.awsAvailable = false;
      if (wasAvailable) {
        console.log('AWS connection lost (clients not initialized). Switching to fallback mode.');
      }
      return; // Exit early if clients aren't even initialized
    }

    try {
      // Try to list S3 buckets as a connectivity test using the shared client
      await this.s3.send(new ListBucketsCommand({}));
      
      // If we get here, AWS is available
      const wasUnavailable = !this.awsAvailable;
      this.awsAvailable = true;
      
      if (wasUnavailable) {
        console.log('AWS connection restored. Starting recovery process...');
        this.performRecovery();
      }
    } catch (error) {
      // If we get here, AWS is unavailable
      const wasAvailable = this.awsAvailable;
      this.awsAvailable = false;
      
      if (wasAvailable) {
        console.log('AWS connection lost. Switching to fallback mode.');
      }
    }
  }

  // Perform recovery when AWS becomes available
  async performRecovery() {
    try {
      // Process in parallel
      await Promise.all([
        this.recoverPhotos(),
        this.recoverSmsMessages()
      ]);
    } catch (error) {
      console.error('Error during recovery process:', error);
    }
  }

  // Recover backed up photos
  async recoverPhotos() {
    try {
      // Get all files in the backup directory
      const files = await readdir(this.backupDir);
      
      if (files.length === 0) {
        console.log('No backed up photos to recover');
        return;
      }
      
      console.log(`Found ${files.length} backed up photos to recover`);
      
      // Process each file
      for (const file of files) {
        try {
          const filePath = path.join(this.backupDir, file);
          const fileContent = fs.readFileSync(filePath);
          const fileExt = path.extname(file);
          const contentType = this.getContentTypeFromExt(fileExt);
          
          // Upload to S3 using the shared client
          const uploadCommand = new PutObjectCommand({
            Bucket: process.env.S3_BUCKET_NAME,
            Key: `photos/${file}`,
            Body: fileContent,
            ContentType: contentType,
            ACL: 'private'
          });
          
          const uploadResult = await this.s3.send(uploadCommand);
          
          console.log(`Recovered photo uploaded to S3: ${uploadResult.Location}`);
          
          // Delete the local backup file after successful upload
          await unlink(filePath);
          console.log(`Deleted local backup: ${filePath}`);
        } catch (error) {
          console.error(`Error recovering photo ${file}:`, error);
        }
      }
    } catch (error) {
      console.error('Error recovering photos:', error);
    }
  }

  // Recover queued messages (SMS and Email)
  async recoverSmsMessages() {
    try {
      // Get all files in the queue directory
      const files = await readdir(this.queueDir);
      
      if (files.length === 0) {
        console.log('No queued messages to recover');
        return;
      }
      
      console.log(`Found ${files.length} queued messages to recover`);
      
      // Import services
      const smsService = require('./sms.service');
      const emailService = require('./email.service');
      
      // Process each file
      for (const file of files) {
        try {
          const filePath = path.join(this.queueDir, file);
          const fileContent = await readFile(filePath, 'utf8');
          const message = JSON.parse(fileContent);
          
          // Skip messages that have exceeded max retries
          if (message.attempts >= this.maxRetries) {
            console.log(`Message ${message.id} exceeded max retries, skipping`);
            continue;
          }
          
          // Update attempt count
          message.attempts += 1;
          
          // Determine message type (SMS or Email)
          const isEmail = file.startsWith('email_') || message.type === 'email';
          
          if (isEmail) {
            // Process email message
            try {
              // Try to send via AWS SES
              const result = await emailService.sendEmail(message.email, message.imageUrl);
              console.log(`Recovered email sent to ${message.email}, MessageId: ${result.id}`);
              
              // Delete the queue file after successful send
              await unlink(filePath);
              console.log(`Deleted queue file: ${filePath}`);
            } catch (error) {
              throw new Error(`Email sending failed: ${error.message}`);
            }
          } else {
            // Process SMS message
            try {
              // Try to send via Telnyx first
              const result = await smsService.sendMessage(message.phoneNumber, message.imageUrl);
              console.log(`Recovered SMS sent via Telnyx to ${message.phoneNumber}, MessageId: ${result.id}`);
              
              // Delete the queue file after successful send
              await unlink(filePath);
              console.log(`Deleted queue file: ${filePath}`);
            } catch (telnyxError) {
              console.error(`Telnyx error, trying AWS SNS fallback:`, telnyxError);
              
              // Fallback to AWS SNS if Telnyx fails
              try {
                // Send SMS via AWS SNS using the shared client
                const publishCommand = new PublishCommand({
                  Message: `Here is your photobooth picture! 📸 ${message.imageUrl}`,
                  PhoneNumber: message.phoneNumber,
                  MessageAttributes: {
                    'AWS.SNS.SMS.SenderID': {
                      DataType: 'String',
                      StringValue: process.env.SNS_SENDER_ID || 'PHOTOBOOTH'
                    },
                    'AWS.SNS.SMS.SMSType': {
                      DataType: 'String',
                      StringValue: 'Transactional'
                    }
                  }
                });
                
                const snsResult = await this.sns.send(publishCommand);
                
                console.log(`Recovered SMS sent via AWS SNS to ${message.phoneNumber}, MessageId: ${snsResult.MessageId}`);
                
                // Delete the queue file after successful send
                await unlink(filePath);
                console.log(`Deleted queue file: ${filePath}`);
              } catch (snsError) {
                throw new Error(`Both Telnyx and AWS SNS failed: ${snsError.message}`);
              }
            }
          }
        } catch (error) {
          console.error(`Error recovering message ${file}:`, error);
          
          // Update the file with the new attempt count
          try {
            const filePath = path.join(this.queueDir, file);
            const fileContent = await readFile(filePath, 'utf8');
            const message = JSON.parse(fileContent);
            
            message.attempts += 1;
            message.lastError = error.message;
            message.lastAttempt = new Date().toISOString();
            
            fs.writeFileSync(filePath, JSON.stringify(message, null, 2));
          } catch (updateError) {
            console.error(`Error updating queue file ${file}:`, updateError);
          }
        }
      }
    } catch (error) {
      console.error('Error recovering messages:', error);
    }
  }

  // Helper to get content type from file extension
  getContentTypeFromExt(ext) {
    const contentTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp'
    };
    
    return contentTypes[ext.toLowerCase()] || 'application/octet-stream';
  }

  // Check if AWS is currently available
  isAwsAvailable() {
    return this.awsAvailable;
  }
}

// Export a singleton instance
const recoveryService = new RecoveryService();
module.exports = recoveryService;

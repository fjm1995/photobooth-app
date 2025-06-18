const { SendEmailCommand, GetSendQuotaCommand } = require('@aws-sdk/client-ses'); // Keep SES commands
const awsConfig = require('../config/aws'); // Import centralized AWS config
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class EmailService {
  constructor() {
    // Use the SES client from the centralized config
    this.ses = awsConfig.ses;
    
    // Check if SES is available (only if client was initialized)
    if (this.ses) {
      this.checkSESAvailability();
    }
  }

  async checkSESAvailability() {
    // If client wasn't initialized, it's not available
    if (!this.ses) {
      return false;
    }
    
    try {
      // Try to get send quota to check connectivity using the shared client
      await this.ses.send(new GetSendQuotaCommand({}));
      console.log('AWS SES is available and configured correctly');
      return true;
    } catch (error) {
      console.warn('AWS SES check failed:', error.message);
      console.log('Email delivery will use fallback mode');
      return false;
    }
  }

  async sendEmail(email, imageUrl) {
    try {
      // Verify SES is available
      const sesAvailable = await this.checkSESAvailability();
      if (!sesAvailable) {
        throw new Error('AWS SES is not available');
      }
      
      // HTML body for the email
      const htmlBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #007aff;">Your Photobooth Picture</h2>
          <p>Thank you for using our photobooth! Here's your picture:</p>
          <p><a href="${imageUrl}" style="color: #007aff; text-decoration: none;">Click here to view and download your photo</a></p>
          <p>This link will expire in 1 hour.</p>
          <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
            <p>If you have any questions, please contact us.</p>
          </div>
        </div>
      `;
      
      // Text body as fallback
      const textBody = `Here's your photobooth picture! 📸 ${imageUrl}`;
      
      // Set up the email parameters
      const params = {
        Source: process.env.EMAIL_FROM || 'photobooth@example.com',
        Destination: {
          ToAddresses: [email]
        },
        Message: {
          Subject: {
            Data: 'Your Photobooth Picture',
            Charset: 'UTF-8'
          },
          Body: {
            Text: {
              Data: textBody,
              Charset: 'UTF-8'
            },
            Html: {
              Data: htmlBody,
              Charset: 'UTF-8'
            }
          }
        }
      };
      
      // Send the email using the shared client
      const command = new SendEmailCommand(params);
      const result = await this.ses.send(command);
      
      console.log('Email sent successfully:', result.MessageId);
      
      return {
        id: result.MessageId,
        status: 'sent'
      };
    } catch (error) {
      console.error('Email sending failed:', error);
      throw new Error(`Email sending failed: ${error.message}`);
    }
  }

  // Fallback method for when email service is unavailable
  async queueEmail(email, imageUrl, queueDir) {
    try {
      // Create a message object
      const messageId = uuidv4();
      const timestamp = new Date().toISOString();
      const queuedMessage = {
        id: messageId,
        email: email,
        imageUrl: imageUrl,
        timestamp: timestamp,
        attempts: 0,
        status: 'queued',
        type: 'email'
      };

      // Save to queue file
      const queueFile = path.join(queueDir, `email_${messageId}.json`);
      fs.writeFileSync(queueFile, JSON.stringify(queuedMessage, null, 2));

      console.log('=== FALLBACK MODE: EMAIL QUEUED FOR LATER DELIVERY ===');
      console.log(`To: ${email}`);
      console.log(`Message: Here is your photobooth picture! 📸 ${imageUrl}`);
      console.log(`Queued at: ${timestamp}`);
      console.log('===================================================');

      return {
        id: messageId,
        status: 'queued'
      };
    } catch (error) {
      console.error('Error queuing email:', error);
      throw error;
    }
  }
}

module.exports = new EmailService();

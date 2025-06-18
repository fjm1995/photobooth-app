// Mock SMS Service for development
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class MockSMSService {
  async sendMessage(phoneNumber, imageUrl) {
    try {
      // Format the phone number
      const formattedNumber = this.formatPhoneNumber(phoneNumber);
      
      // Generate a unique message ID
      const messageId = `mock-${uuidv4().substring(0, 8)}`;
      
      // Log the SMS details
      console.log('=== MOCK SMS SERVICE: MESSAGE WOULD BE SENT ===');
      console.log(`To: ${formattedNumber}`);
      console.log(`Message: Thank you for using the Impact Church Photobooth! Here's your photo: ${imageUrl}. Reply HELP for help or STOP to opt out.`);
      console.log(`Message ID: ${messageId}`);
      console.log('==============================================');
      
      // Queue the message for demonstration purposes
      this.queueMessage(phoneNumber, imageUrl, 'queued_messages');
      
      // Return a mock response
      return {
        id: messageId,
        status: 'sent',
        to: formattedNumber
      };
    } catch (error) {
      console.error('Mock SMS sending error:', error);
      return {
        id: `error-${uuidv4().substring(0, 8)}`,
        status: 'error',
        to: this.formatPhoneNumber(phoneNumber)
      };
    }
  }
  
  formatPhoneNumber(number) {
    // If the number already starts with +, just return it
    if (number.startsWith('+')) {
      return number;
    }
    
    // Remove any non-digits
    const cleaned = number.replace(/\D/g, '');
    // Add country code if not present
    return cleaned.startsWith('1') ? `+${cleaned}` : `+1${cleaned}`;
  }
  
  async getDeliveryStatus(messageId) {
    // Mock delivery status
    console.log(`Checking status for message: ${messageId}`);
    
    // Return a mock status
    return {
      id: messageId,
      status: 'delivered',
      to: 'unknown'
    };
  }

  // Queue message for demonstration
  async queueMessage(phoneNumber, imageUrl, queueDir) {
    try {
      // Create a message object
      const messageId = uuidv4();
      const timestamp = new Date().toISOString();
      const queuedMessage = {
        id: messageId,
        phoneNumber: this.formatPhoneNumber(phoneNumber),
        imageUrl: imageUrl,
        timestamp: timestamp,
        attempts: 0,
        status: 'queued'
      };

      // Ensure queue directory exists
      if (!fs.existsSync(queueDir)) {
        fs.mkdirSync(queueDir, { recursive: true });
        console.log(`Created queue directory: ${queueDir}`);
      }

      // Save to queue file
      const queueFile = path.join(queueDir, `${messageId}.json`);
      fs.writeFileSync(queueFile, JSON.stringify(queuedMessage, null, 2));

      console.log('=== MOCK SMS SERVICE: MESSAGE QUEUED ===');
      console.log(`To: ${queuedMessage.phoneNumber}`);
      console.log(`Message: Thank you for using the Impact Church Photobooth! Here's your photo: ${imageUrl}. Reply HELP for help or STOP to opt out.`);
      console.log(`Queued at: ${timestamp}`);
      console.log('=========================================');

      return {
        id: messageId,
        status: 'queued'
      };
    } catch (error) {
      console.error('Error queuing SMS:', error);
      throw error;
    }
  }
}

module.exports = new MockSMSService();

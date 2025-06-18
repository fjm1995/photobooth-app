// We'll use axios instead of node-fetch since it works with CommonJS
const axios = require('axios');
const mockSMSService = require('./sms.service.mock');

class SMSService {
  async sendMessage(phoneNumber, imageUrl) {
    try {
      // Check if we should use the mock SMS service
      if (process.env.USE_MOCK_SMS === 'true') {
        console.log('Using mock SMS service');
        return mockSMSService.sendMessage(phoneNumber, imageUrl);
      }
      
      // Check if Telnyx API key is available
      if (!process.env.TELNYX_API_KEY || !process.env.TELNYX_PHONE_NUMBER) {
        console.log('Telnyx credentials not available, using fallback');
        return this.queueMessage(phoneNumber, imageUrl, 'queued_messages');
      }
      
      const message = `Thank you for using the Impact Church Photobooth! Here's your photo (link valid for 7 days) 📸: ${imageUrl}. Reply HELP for help or STOP to opt out.`;
      const formattedNumber = this.formatPhoneNumber(phoneNumber);
      
      // Prepare request data
      const requestData = {
        from: process.env.TELNYX_PHONE_NUMBER,
        to: formattedNumber,
        text: message
      };
      
      // Add messaging profile ID only if it exists
      if (process.env.TELNYX_MESSAGING_PROFILE_ID) {
        requestData.messaging_profile_id = process.env.TELNYX_MESSAGING_PROFILE_ID;
      }
      
      console.log('Sending SMS with data:', JSON.stringify(requestData, null, 2));
      console.log('Using Telnyx API key:', process.env.TELNYX_API_KEY.substring(0, 10) + '...');
      
      // Send SMS using Telnyx REST API with axios
      const response = await axios({
        method: 'post',
        url: 'https://api.telnyx.com/v2/messages',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${process.env.TELNYX_API_KEY}`
        },
        data: requestData
      });
      
      console.log('SMS sent successfully via Telnyx:', response.data.data.id);
      
      return {
        id: response.data.data.id,
        status: response.data.data.status,
        to: response.data.data.to[0].phone_number
      };
    } catch (error) {
      console.error('Telnyx SMS sending failed:', error);
      
      // Extract and log the detailed error message from Telnyx
      if (error.response && error.response.data && error.response.data.errors) {
        console.error('Telnyx API error details:', JSON.stringify(error.response.data.errors, null, 2));
      }
      
      console.log('Using fallback SMS queue');
      return this.queueMessage(phoneNumber, imageUrl, 'queued_messages');
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
    try {
      // Check if we should use the mock SMS service
      if (process.env.USE_MOCK_SMS === 'true') {
        console.log('Using mock SMS service for delivery status');
        return mockSMSService.getDeliveryStatus(messageId);
      }
      
      // Check if Telnyx API key is available
      if (!process.env.TELNYX_API_KEY) {
        console.log('Telnyx API key not available, cannot check status');
        return { id: messageId, status: 'unknown', to: 'unknown' };
      }
      
      const response = await axios({
        method: 'get',
        url: `https://api.telnyx.com/v2/messages/${messageId}`,
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${process.env.TELNYX_API_KEY}`
        }
      });
      
      return {
        id: response.data.data.id,
        status: response.data.data.status,
        to: response.data.data.to[0].phone_number
      };
    } catch (error) {
      console.error('Error retrieving message status:', error);
      return { id: messageId, status: 'error', to: 'unknown' };
    }
  }

  // Fallback method for when MessageBird is unavailable
  async queueMessage(phoneNumber, imageUrl, queueDir) {
    try {
      const fs = require('fs');
      const path = require('path');
      const { v4: uuidv4 } = require('uuid');
      
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

      console.log('=== FALLBACK MODE: SMS QUEUED FOR LATER DELIVERY ===');
      console.log(`To: ${queuedMessage.phoneNumber}`);
      console.log(`Message: Thank you for using the Impact Church Photobooth! Here's your photo: ${imageUrl}. Reply HELP for help or STOP to opt out.`);
      console.log(`Queued at: ${timestamp}`);
      console.log('===================================================');

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

module.exports = new SMSService();

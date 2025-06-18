// QR Code Generation Service
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

class QRCodeService {
  /**
   * Generate a QR code for the given image URL
   * @param {string} imageUrl - The URL of the image to create a QR code for
   * @returns {Promise<object>} - Object containing QR code data
   */
  async generateQRCode(imageUrl) {
    try {
      // Generate QR code as data URL (base64 encoded)
      const qrDataUrl = await QRCode.toDataURL(imageUrl, {
        errorCorrectionLevel: 'H',
        margin: 1,
        width: 250,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      });

      console.log('QR code generated for URL:', imageUrl);
      
      return {
        id: uuidv4(),
        qrDataUrl,
        imageUrl,
        timestamp: new Date().toISOString(),
        status: 'generated'
      };
    } catch (error) {
      console.error('Error generating QR code:', error);
      throw error;
    }
  }

  /**
   * Generate and save a QR code image file
   * @param {string} imageUrl - The URL of the image to create a QR code for
   * @param {string} saveDir - Directory to save the QR code image
   * @returns {Promise<object>} - Object containing QR code data and file path
   */
  async generateAndSaveQRCode(imageUrl, saveDir = 'public/qrcodes') {
    try {
      // Ensure directory exists
      if (!fs.existsSync(saveDir)) {
        fs.mkdirSync(saveDir, { recursive: true });
        console.log(`Created QR code directory: ${saveDir}`);
      }
      
      // Generate a unique filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const uniqueId = uuidv4();
      const filename = `qr_${timestamp}_${uniqueId}.png`;
      const qrCodePath = path.join(saveDir, filename);
      
      // Generate and save QR code
      await QRCode.toFile(qrCodePath, imageUrl, {
        errorCorrectionLevel: 'H',
        margin: 1,
        width: 250,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      });
      
      // Generate a web-accessible path
      const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
      const qrCodeUrl = `${baseUrl}/${path.relative('public', qrCodePath).replace(/\\/g, '/')}`;
      
      console.log('QR code saved:', qrCodePath);
      console.log('QR code URL:', qrCodeUrl);
      
      return {
        id: uniqueId,
        qrCodePath,
        qrCodeUrl,
        imageUrl,
        timestamp: new Date().toISOString(),
        status: 'saved'
      };
    } catch (error) {
      console.error('Error generating and saving QR code:', error);
      throw error;
    }
  }
}

module.exports = new QRCodeService();

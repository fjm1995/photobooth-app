/**
 * Mock Image Capture Method
 * Fallback capture method that uses a pre-existing image
 */
const fs = require('fs');
const path = require('path');

/**
 * Use a mock image when capture fails
 * @param {string} localPath - Path to save the mock image
 * @returns {Promise<boolean>} Success status
 */
async function useMockImage(localPath) {
  try {
    const mockImage = path.join(process.cwd(), 'public', 'mock_images', 'sample2.jpg');
    
    if (fs.existsSync(mockImage)) {
      fs.copyFileSync(mockImage, localPath);
      console.log('Using mock image since v4l2 capture failed');
      return true;
    } else {
      console.error('Mock image not found');
      return false;
    }
  } catch (error) {
    console.error('Error using mock image:', error);
    return false;
  }
}

module.exports = useMockImage;

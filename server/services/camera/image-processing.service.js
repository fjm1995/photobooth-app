/**
 * Image Processing Service
 * Responsible for processing, watermarking, and storing photos
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const awsConfig = require('../../config/aws');

class ImageProcessingService {
  constructor() {
    // Use the S3 client from the centralized config
    this.s3 = awsConfig.s3;
  }
  
  /**
   * Process a photo (add watermark, upload to S3 or save locally)
   * @param {string} localPath - Path to the local photo file
   * @param {string} filename - The filename of the photo
   * @param {boolean} awsAvailable - Whether AWS is available for upload
   * @param {string} cameraType - The camera type used to take the photo
   * @param {string} cameraModel - The camera model used to take the photo
   * @returns {Promise<Object>} Processing result
   */
  async processPhoto(localPath, filename, awsAvailable, cameraType, cameraModel) {
    try {
      // Add watermark to the photo
      try {
        await this.addWatermark(localPath);
      } catch (watermarkError) {
        console.error('Error adding watermark, continuing without it:', watermarkError);
      }
      
      // Copy to public captures for consistent behavior
      const publicDir = path.join(process.cwd(), 'public', 'captures');
      if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
      }
      const publicPath = path.join(publicDir, filename);
      fs.copyFileSync(localPath, publicPath);
      
      if (awsAvailable) {
        // Process photo for AWS upload
        return this.processPhotoForAWS(localPath, publicPath, filename, cameraType, cameraModel);
      } else {
        // Process photo for local storage
        return this.processPhotoLocally(localPath, publicPath, filename, cameraType, cameraModel);
      }
    } catch (error) {
      console.error('Error processing photo:', error);
      
      // Try local storage as a last resort
      try {
        return await this.processPhotoLocally(
          localPath, 
          path.join(process.cwd(), 'public', 'captures', filename), 
          filename, 
          cameraType, 
          cameraModel
        );
      } catch (fallbackError) {
        console.error('Fallback to local storage also failed:', fallbackError);
        throw error; // Throw the original error
      }
    }
  }
  
  /**
   * Process photo for AWS upload
   * @param {string} localPath - Path to the local photo file
   * @param {string} publicPath - Path to the public copy of the photo
   * @param {string} filename - The filename of the photo
   * @param {string} cameraType - The camera type used to take the photo
   * @param {string} cameraModel - The camera model used to take the photo
   * @returns {Promise<Object>} Processing result
   */
  async processPhotoForAWS(localPath, publicPath, filename, cameraType, cameraModel) {
    try {
      // Check if AWS is properly configured
      if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || !process.env.S3_BUCKET_NAME) {
        console.warn('AWS credentials or bucket name not configured, falling back to local storage');
        return this.processPhotoLocally(localPath, publicPath, filename, cameraType, cameraModel);
      }
      
      try {
        console.log(`Preparing to upload high-quality image to S3: ${filename}`);
        
        // Try to upscale the image if Sharp is available
        let fileBuffer;
        let dimensions = { width: 0, height: 0 };
        
        try {
          // Check if Sharp is available
          const sharpModule = require('sharp');
          
          // Get original image dimensions
          const metadata = await sharpModule(localPath).metadata();
          dimensions = {
            width: metadata.width,
            height: metadata.height
          };
          
          console.log(`Original image dimensions: ${dimensions.width}x${dimensions.height}`);
          
          // If image is smaller than desired resolution, upscale it
          if (dimensions.width < 2000) {
            console.log(`Upscaling image to 2400x1600 (keeping aspect ratio)`);
            
            // Calculate target dimensions while preserving aspect ratio
            const aspectRatio = dimensions.width / dimensions.height;
            let targetWidth = 2400;
            let targetHeight = Math.round(targetWidth / aspectRatio);
            
            // Upscale using Lanczos3 resampling (high quality)
            fileBuffer = await sharpModule(localPath)
              .resize(targetWidth, targetHeight, {
                kernel: 'lanczos3',  // High-quality resampling
                fit: 'fill'
              })
              .jpeg({ 
                quality: 95,
                chromaSubsampling: '4:4:4'  // Best color quality
              })
              .toBuffer();
            
            // Update dimensions to new size
            dimensions = {
              width: targetWidth,
              height: targetHeight
            };
            
            console.log(`Image upscaled to ${dimensions.width}x${dimensions.height}`);
          } else {
            // Just read the file if it's already large enough
            fileBuffer = Buffer.from(fs.readFileSync(localPath));
          }
        } catch (sharpError) {
          // Sharp not available or error during processing, use original file
          console.warn(`Could not upscale image: ${sharpError.message}`);
          fileBuffer = Buffer.from(fs.readFileSync(localPath));
        }
        
        // Upload to S3 with high quality settings
        const uploadCommand = new PutObjectCommand({
          Bucket: process.env.S3_BUCKET_NAME,
          Key: `photos/${filename}`,
          Body: fileBuffer,
          ContentType: 'image/jpeg',
          ACL: 'private',
          Metadata: {
            'high-quality': 'true',
            'original-size': 'preserved',
            'image-processing': 'none'
          }
        });
        
        const uploadResult = await this.s3.send(uploadCommand);
        
        // Generate a signed URL
        const getCommand = new GetObjectCommand({
          Bucket: process.env.S3_BUCKET_NAME,
          Key: `photos/${filename}`
        });
        
        const signedUrl = await getSignedUrl(this.s3, getCommand, { expiresIn: 3600 }); // URL expires in 1 hour
        
        // Delete local file after successful S3 upload
        try {
          console.log(`Successfully uploaded to S3. Deleting local file: ${localPath}`);
          fs.unlinkSync(localPath);
          
          // Also delete the copy in public directory if it exists and is different from localPath
          if (publicPath !== localPath && fs.existsSync(publicPath)) {
            console.log(`Deleting public copy: ${publicPath}`);
            fs.unlinkSync(publicPath);
          }
          console.log(`Local files deleted after successful S3 upload`);
        } catch (deleteError) {
          console.warn(`Warning: Failed to delete local file after S3 upload: ${deleteError.message}`);
          // Continue anyway, this is not critical
        }
        
        // Generate a local URL for proxy fallback (even though the file is deleted)
        const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
        const localUrl = `${baseUrl}/api/photo/view/${filename}`; // Use the proxy URL
        
        // Return the result with both URLs
        return {
          success: true,
          s3Path: uploadResult.Location,
          imageUrl: localUrl,  // Add proxy URL
          signedUrl,
          filename,
          awsStatus: 'available',
          cameraType,
          cameraModel
        };
      } catch (awsError) {
        console.error('AWS upload failed, falling back to local storage:', awsError);
        // Fall back to local storage
        return this.processPhotoLocally(localPath, publicPath, filename, cameraType, cameraModel);
      }
    } catch (error) {
      console.error('Error processing photo for AWS:', error);
      // Fall back to local storage as a last resort
      return this.processPhotoLocally(localPath, publicPath, filename, cameraType, cameraModel);
    }
  }
  
  /**
   * Process photo for local storage
   * @param {string} localPath - Path to the local photo file
   * @param {string} publicPath - Path to the public copy of the photo
   * @param {string} filename - The filename of the photo
   * @param {string} cameraType - The camera type used to take the photo
   * @param {string} cameraModel - The camera model used to take the photo
   * @returns {Promise<Object>} Processing result
   */
  async processPhotoLocally(localPath, publicPath, filename, cameraType, cameraModel) {
    try {
      // Generate a local URL
      const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
      const imageUrl = `${baseUrl}/captures/${filename}`;
      
      // Return the result
      return {
        success: true,
        localPath,
        publicPath,
        imageUrl,
        filename,
        awsStatus: 'unavailable',
        cameraType,
        cameraModel
      };
    } catch (error) {
      console.error('Error processing photo locally:', error);
      throw error;
    }
  }
  
  /**
   * Add watermark to photo
   * @param {string} imagePath - Path to the image to watermark
   * @returns {Promise<boolean>} Success status
   */
  async addWatermark(imagePath) {
    try {
          // Check if Sharp is available
          let hasSharp = false;
          try {
            require.resolve('sharp');
            hasSharp = true;
            console.log('Sharp is available for high-quality image processing');
          } catch (e) {
            console.error('Error using Sharp for watermarking:', e.message);
            hasSharp = false;
          }
      
      if (hasSharp) {
        // Try using Sharp for watermarking
        try {
          const sharp = require('sharp');
          console.log('Sharp is available, attempting to use it for watermarking');
          
          // Load the watermark logo
          const logoPath = path.join(process.cwd(), 'public', 'images', 'impact-logo.png');
          
          if (fs.existsSync(logoPath)) {
            // Get image dimensions
            const metadata = await sharp(imagePath).metadata();
            
            // Calculate logo placement (bottom right corner)
            // Use environment variable LOGO_SIZE_PERCENT if available, otherwise use default 11.2%
            const logoSizePercent = process.env.LOGO_SIZE_PERCENT ? 
              parseFloat(process.env.LOGO_SIZE_PERCENT) / 100 : 0.112;
            const logoWidth = Math.round(metadata.width * logoSizePercent);
            
            // Create a resize transform for the logo
            const resizedLogo = await sharp(logoPath)
              .resize(logoWidth, null) // Maintain aspect ratio
              .toBuffer();
            
            // Now composite with precise positioning
            // Use the highest quality settings to preserve the image quality
            await sharp(imagePath)
              .composite([{
                input: resizedLogo,
                gravity: 'southeast', 
                top: undefined,
                left: undefined,
                blend: 'over',
              }])
              .jpeg({ quality: 100, chromaSubsampling: '4:4:4' }) // Use highest quality JPEG settings
              .toFile(imagePath + '.tmp');
              
            // Replace original file with watermarked version
            fs.renameSync(imagePath + '.tmp', imagePath);
            console.log('Successfully added watermark using Sharp');
            return true;
          } else {
            console.warn(`Watermark logo not found at ${logoPath}`);
            return false;
          }
        } catch (sharpError) {
          console.error('Error using Sharp for watermarking:', sharpError.message);
          console.log('Falling back to ImageMagick for watermarking');
          // Fall back to ImageMagick
          return this.addWatermarkWithImageMagick(imagePath);
        }
      } else {
        // Fall back to ImageMagick
        console.log('Sharp not available, trying ImageMagick for watermarking');
        return this.addWatermarkWithImageMagick(imagePath);
      }
    } catch (error) {
      console.error('Error adding watermark, continuing without it:', error);
      return false;
    }
  }
  
  /**
   * Add watermark using ImageMagick
   * @param {string} imagePath - Path to the image to watermark
   * @returns {Promise<boolean>} Success status
   */
  async addWatermarkWithImageMagick(imagePath) {
    return new Promise((resolve) => {
      const logoPath = path.join(process.cwd(), 'public', 'images', 'impact-logo.png');
      
      if (!fs.existsSync(logoPath)) {
        console.warn(`Watermark logo not found at ${logoPath}`);
        resolve(false);
        return;
      }
      
      // Check if ImageMagick is installed by testing the 'convert' command
      const checkImageMagick = spawn('which', ['convert']);
      
      checkImageMagick.on('close', (code) => {
        if (code !== 0) {
          console.error('ImageMagick (convert) is not installed or not in PATH. Cannot add watermark.');
          resolve(false);
          return;
        }
        
        // ImageMagick is available, proceed with watermarking
        console.log('ImageMagick found, proceeding with watermark');
        
        // Get image dimensions to calculate logo size
        const dimensions = spawn('identify', ['-format', '%w', imagePath]);
        let imageWidth = '';
        
        dimensions.stdout.on('data', (data) => {
          imageWidth += data.toString();
        });
        
        dimensions.on('close', (code) => {
          if (code !== 0) {
            console.warn('Could not get image dimensions, using default logo size');
            // Use standard ImageMagick composite without resizing
            const magick = spawn('convert', [
              imagePath,
              logoPath,
              '-gravity', 'southeast',
              '-composite',
              imagePath
            ]);
            
            magick.on('close', (code) => {
              if (code === 0) {
                console.log('Successfully added watermark using ImageMagick (default size)');
                resolve(true);
              } else {
                console.warn(`ImageMagick watermark failed with code ${code}, continuing without watermark`);
                resolve(false);
              }
            });
            
            magick.on('error', (error) => {
              console.error('ImageMagick error:', error);
              resolve(false);
            });
          } else {
            // Calculate logo size based on image width and environment variable
            const logoSizePercent = process.env.LOGO_SIZE_PERCENT ? 
              parseFloat(process.env.LOGO_SIZE_PERCENT) / 100 : 0.112;
            const logoWidth = Math.round(parseInt(imageWidth) * logoSizePercent);
            
            console.log(`Resizing logo to ${logoWidth}px width (${logoSizePercent * 100}% of image)`);
            
            // Resize logo and composite
            const magick = spawn('convert', [
              imagePath,
              '(',
                logoPath,
                '-resize', `${logoWidth}x`,
              ')',
              '-gravity', 'southeast',
              '-composite',
              imagePath
            ]);
            
            magick.on('close', (code) => {
              if (code === 0) {
                console.log('Successfully added watermark using ImageMagick (custom size)');
                resolve(true);
              } else {
                console.warn(`ImageMagick watermark failed with code ${code}, continuing without watermark`);
                resolve(false);
              }
            });
            
            magick.on('error', (error) => {
              console.error('ImageMagick error:', error);
              resolve(false);
            });
          }
        });
        
        dimensions.on('error', (error) => {
          console.error('Could not execute identify, using default logo composite:', error);
          // Fallback to standard composite without resizing
          const magick = spawn('convert', [
            imagePath,
            logoPath,
            '-gravity', 'southeast',
            '-composite',
            imagePath
          ]);
          
          magick.on('close', (code) => {
            if (code === 0) {
              console.log('Successfully added watermark using ImageMagick (fallback method)');
              resolve(true);
            } else {
              console.warn(`ImageMagick watermark failed with code ${code}, continuing without watermark`);
              resolve(false);
            }
          });
          
          magick.on('error', (error) => {
            console.error('ImageMagick error:', error);
            resolve(false);
          });
        });
      });
      
      checkImageMagick.on('error', (error) => {
        console.error('Error checking for ImageMagick:', error);
        resolve(false);
      });
      
    });
  }
}

// Export a singleton instance
const imageProcessingService = new ImageProcessingService();
module.exports = imageProcessingService;

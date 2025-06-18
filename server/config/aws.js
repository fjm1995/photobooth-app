const { S3Client } = require('@aws-sdk/client-s3');
const { SNSClient } = require('@aws-sdk/client-sns');
const { SESClient } = require('@aws-sdk/client-ses');

// Read configuration from environment variables
const region = process.env.AWS_REGION || 'us-east-1';
const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
};

// Initialize clients only if credentials are provided
let s3 = null;
let sns = null;
let ses = null;

if (credentials.accessKeyId && credentials.secretAccessKey) {
  console.log(`Initializing AWS clients for region: ${region}`);
  s3 = new S3Client({ region, credentials });
  sns = new SNSClient({ region, credentials });
  ses = new SESClient({ region, credentials });
} else {
  console.warn('AWS credentials not found in environment variables. AWS clients will not be initialized.');
}

module.exports = {
  s3,
  sns,
  ses,
  isAwsAvailable: () => !!s3 && !!sns && !!ses // Basic check if clients were initialized
};

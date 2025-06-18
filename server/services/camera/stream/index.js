/**
 * Camera Stream Modules Index
 * Exports all stream-related functionality for easy access
 */
const setupMjpegStream = require('./mjpeg-stream');
const r6Stream = require('./r6-stream');
const mk5dStream = require('./5d-stream');
const setupStreamErrorHandling = require('./error-handler');

module.exports = {
  setupMjpegStream,
  setupSpecializedR6Stream: r6Stream.setupSpecializedR6Stream,
  setupSpecialized5DStream: mk5dStream.createMjpegStream,
  releaseDevices: r6Stream.releaseDevices,
  findWorkingCaptureDevices: r6Stream.findWorkingCaptureDevices,
  setupStreamErrorHandling
};

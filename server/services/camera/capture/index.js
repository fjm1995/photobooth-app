/**
 * Camera Capture Methods Index
 * Exports all capture methods for easy access
 */
const v4l2Capture = require('./v4l2-capture');
const v4l2FallbackCapture = require('./v4l2-fallback-capture');
const r6Capture = require('./r6-capture');
const mk5dCapture = require('./5d-capture');
const mockCapture = require('./mock-capture');

module.exports = {
  v4l2Capture,
  v4l2FallbackCapture,
  r6Capture,
  mk5dCapture,
  mockCapture
};

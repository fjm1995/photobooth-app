/**
 * Camera Controller for Linux / Canon Cameras
 * This file now uses a modular approach for better code organization
 */

// Simply re-export all the controller functionality from the modular version
module.exports = require('./camera/index');

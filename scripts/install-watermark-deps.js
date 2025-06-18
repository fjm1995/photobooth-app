#!/usr/bin/env node

/**
 * Watermark Dependencies Installer
 * 
 * This script installs the necessary dependencies for the photo watermarking feature:
 * - ImageMagick for image manipulation
 * - Sharp with the correct platform-specific binaries
 */

const { spawn, execSync } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

const platform = os.platform();
const arch = os.arch();

console.log(`System information: ${platform} (${arch})`);

async function main() {
  try {
    // Check if running on Raspberry Pi (linux-arm64)
    const isRaspberryPi = platform === 'linux' && (arch === 'arm64' || arch === 'arm');
    
    // First, install ImageMagick
    await installImageMagick();
    
    // Then, ensure Sharp is correctly installed for the platform
    await installSharp(isRaspberryPi);
    
    console.log('\nWatermark dependencies installation completed successfully!');
    console.log('You should now be able to use the watermarking feature.');
  } catch (error) {
    console.error('Error installing watermark dependencies:', error);
    process.exit(1);
  }
}

async function installImageMagick() {
  console.log('\n📦 Installing ImageMagick...');
  
  if (platform === 'linux') {
    try {
      console.log('Using apt-get to install ImageMagick...');
      execSync('sudo apt-get update', { stdio: 'inherit' });
      execSync('sudo apt-get install -y imagemagick', { stdio: 'inherit' });
      console.log('✅ ImageMagick installed successfully.');
      
      // Verify installation
      const version = execSync('convert --version').toString();
      console.log(`Installed version: ${version.split('\n')[0]}`);
      
      return true;
    } catch (error) {
      console.error('❌ Failed to install ImageMagick:', error.message);
      throw error;
    }
  } else if (platform === 'darwin') {
    try {
      console.log('Using Homebrew to install ImageMagick...');
      execSync('brew install imagemagick', { stdio: 'inherit' });
      console.log('✅ ImageMagick installed successfully.');
      return true;
    } catch (error) {
      console.error('❌ Failed to install ImageMagick:', error.message);
      throw error;
    }
  } else if (platform === 'win32') {
    console.log('⚠️ Windows detected. Please manually install ImageMagick:');
    console.log('1. Download from: https://imagemagick.org/script/download.php');
    console.log('2. Make sure to add it to your PATH during installation.');
    console.log('3. Restart your terminal after installation.');
    return false;
  } else {
    console.error(`❌ Unsupported platform: ${platform}`);
    throw new Error(`Unsupported platform: ${platform}`);
  }
}

async function installSharp(isRaspberryPi) {
  console.log('\n📦 Installing Sharp...');
  
  try {
    // First, remove any existing installation
    console.log('Removing any existing Sharp installation...');
    execSync('npm uninstall sharp', { stdio: 'inherit' });
    
    // For Raspberry Pi, use platform-specific installation
    if (isRaspberryPi) {
      console.log('Installing Sharp with platform-specific binaries for linux-arm64...');
      execSync('npm install --os=linux --cpu=arm64 sharp', { stdio: 'inherit' });
    } else {
      // For other platforms, install with optional dependencies
      console.log('Installing Sharp with optional dependencies...');
      execSync('npm install --include=optional sharp', { stdio: 'inherit' });
    }
    
    // Verify installation
    try {
      const sharpPath = require.resolve('sharp');
      console.log(`✅ Sharp installed successfully at: ${sharpPath}`);
      
      // Try loading Sharp to ensure it works
      const sharp = require('sharp');
      console.log(`Sharp version: ${sharp.versions.sharp}`);
      
      return true;
    } catch (error) {
      console.error('❌ Sharp is installed but could not be loaded correctly:', error.message);
      throw error;
    }
  } catch (error) {
    console.error('❌ Failed to install Sharp:', error.message);
    throw error;
  }
}

// Execute the main function
main();

#!/usr/bin/env node

/**
 * Platform-specific dependency installer script
 * This script detects the current platform and runs the appropriate
 * dependency installation command.
 */

const { spawn } = require('child_process');
const os = require('os');
const platform = os.platform();

console.log(`Detected platform: ${platform}`);

let installCommand;
let installArgs;

if (platform === 'linux') {
  console.log('Installing Linux dependencies...');
  
  // Check if we're on a Raspberry Pi
  const isRaspberryPi = () => {
    try {
      const cpuInfo = require('fs').readFileSync('/proc/cpuinfo', 'utf8');
      return cpuInfo.includes('Raspberry Pi') || cpuInfo.includes('BCM2708') || cpuInfo.includes('BCM2709') || cpuInfo.includes('BCM2835');
    } catch (error) {
      return false;
    }
  };
  
  if (isRaspberryPi()) {
    console.log('Raspberry Pi detected, installing Pi-specific dependencies...');
  }
  
  // Use apt-get on Debian/Ubuntu based systems
  installCommand = 'npm';
  installArgs = ['run', 'install:deps:linux'];
} else if (platform === 'darwin') {
  console.log('Installing macOS dependencies...');
  
  // Check if Homebrew is installed
  const checkBrew = spawn('which', ['brew']);
  
  checkBrew.on('close', (code) => {
    if (code !== 0) {
      console.error('Homebrew is not installed. Please install Homebrew first:');
      console.error('  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"');
      process.exit(1);
    }
  });
  
  installCommand = 'npm';
  installArgs = ['run', 'install:deps:mac'];
} else if (platform === 'win32') {
  console.log('Installing Windows dependencies...');
  
  // On Windows, we need to guide the user to install dependencies manually
  installCommand = 'npm';
  installArgs = ['run', 'install:deps:win'];
  
  console.log('\nIMPORTANT: On Windows, you need to install the following dependencies manually:');
  console.log('1. FFmpeg: https://ffmpeg.org/download.html');
  console.log('2. gPhoto2: https://github.com/gphoto/gphoto2-updater/releases');
  console.log('Make sure to add them to your PATH environment variable.\n');
} else {
  console.error(`Unsupported platform: ${platform}`);
  process.exit(1);
}

// Run the installation command
const installation = spawn(installCommand, installArgs, { stdio: 'inherit', shell: true });

installation.on('close', (code) => {
  if (code !== 0) {
    console.error(`Installation failed with code ${code}`);
    process.exit(code);
  }
  
  console.log('Dependencies installed successfully!');
  
  // Additional instructions
  if (platform === 'linux') {
    console.log('\nTo use a DSLR camera, make sure it is connected via USB and turned on.');
    console.log('To use a webcam, make sure it is connected via USB.');
  } else if (platform === 'darwin') {
    console.log('\nTo use a DSLR camera, make sure it is connected via USB and turned on.');
    console.log('The built-in FaceTime camera will be used if no DSLR is detected.');
  } else if (platform === 'win32') {
    console.log('\nAfter installing the dependencies manually, restart your computer.');
    console.log('To use a DSLR camera, make sure it is connected via USB and turned on.');
    console.log('To use a webcam, make sure it is connected via USB or use the built-in camera.');
  }
  
  console.log('\nYou can now run the application with:');
  console.log('  npm start');
});

#!/usr/bin/env node

/**
 * Script to create necessary directories that are excluded from Git
 * These directories are used by the application at runtime but not tracked in the repository
 */

const fs = require('fs');
const path = require('path');

// List of directories to create
const directories = [
  'public/uploads',
  'public/captures',
  'temp_captures',
  'backup_photos',
  'queued_messages',
  'temp_test'
];

// Create each directory
directories.forEach(dir => {
  const fullPath = path.join(__dirname, '..', dir);
  
  // Create the directory if it doesn't exist
  if (!fs.existsSync(fullPath)) {
    console.log(`Creating directory: ${dir}`);
    fs.mkdirSync(fullPath, { recursive: true });
    
    // Create a .gitkeep file so the directory structure is maintained but empty
    fs.writeFileSync(path.join(fullPath, '.gitkeep'), '');
    
    console.log(`✓ Created ${dir}`);
  } else {
    console.log(`✓ Directory already exists: ${dir}`);
  }
});

console.log('\nAll required directories have been created successfully!');
console.log('You can now run the application with:');
console.log('npm start');

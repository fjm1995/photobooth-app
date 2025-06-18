/**
 * Camera Service Migration Script
 * Helps migrate from the monolithic camera.service.js to the modular structure
 */
const fs = require('fs');
const path = require('path');

// Function to create a backup of the original file
function backupFile(filePath) {
  const backupPath = `${filePath}.backup`;
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(filePath, backupPath);
    console.log(`Created backup of ${filePath} at ${backupPath}`);
  } else {
    console.log(`Backup already exists for ${filePath}`);
  }
}

// Function to update imports in files to use the new modular structure
function updateImportsInFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      return;
    }
    
    // Create a backup before modifying
    backupFile(filePath);
    
    // Read the file
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Update imports
    const oldImport = /require\(['"]\.\.\/services\/camera\.service['"]\)/g;
    const newImport = "require('../services/camera')";
    
    if (oldImport.test(content)) {
      content = content.replace(oldImport, newImport);
      fs.writeFileSync(filePath, content);
      console.log(`Updated imports in ${filePath}`);
    } else {
      console.log(`No imports to update in ${filePath}`);
    }
  } catch (error) {
    console.error(`Error updating imports in ${filePath}:`, error);
  }
}

// Function to scan directory for files to update
function scanDirectory(dirPath, fileExtensions = ['.js']) {
  const results = [];
  
  const files = fs.readdirSync(dirPath);
  
  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      // Skip the camera directory itself as we don't want to touch our newly created files
      if (filePath !== path.join(process.cwd(), 'server', 'services', 'camera')) {
        results.push(...scanDirectory(filePath, fileExtensions));
      }
    } else if (
      stat.isFile() && 
      fileExtensions.includes(path.extname(filePath)) &&
      !filePath.endsWith('.backup') && // Skip backup files
      filePath !== path.join(process.cwd(), 'server', 'services', 'camera.service.js') // Skip the original file
    ) {
      results.push(filePath);
    }
  }
  
  return results;
}

// Main function
function main() {
  console.log('Starting camera service migration...');
  
  try {
    // Scan project for JS files
    const projectRoot = process.cwd();
    const files = scanDirectory(projectRoot);
    console.log(`Found ${files.length} files to check`);
    
    // Update imports in each file
    for (const file of files) {
      updateImportsInFile(file);
    }
    
    // Create a symbolic link from old file to new file for backward compatibility (if needed)
    const oldPath = path.join(projectRoot, 'server', 'services', 'camera.service.js');
    const newPath = path.join(projectRoot, 'server', 'services', 'camera', 'index.js');
    
    // Backup the original file
    if (fs.existsSync(oldPath)) {
      backupFile(oldPath);
      
      // Replace the old file with a reference to the new file
      const redirectCode = `/**
 * Camera Service (Legacy)
 * This file has been migrated to a modular structure in the /server/services/camera directory
 * This file exists for backward compatibility
 */
module.exports = require('./camera');
`;
      fs.writeFileSync(oldPath, redirectCode);
      console.log(`Updated ${oldPath} to redirect to the new modular service`);
    }
    
    console.log('Migration completed successfully!');
    console.log(`
=============================================
 Camera Service Migration Complete
=============================================
The camera service has been successfully migrated to a modular structure.

New structure:
- server/services/camera/index.js (main entry point)
- server/services/camera/camera-detection.service.js
- server/services/camera/camera-stream.service.js
- server/services/camera/camera-capture.service.js
- server/services/camera/device-manager.service.js
- server/services/camera/image-processing.service.js

The original file at server/services/camera.service.js has been preserved
but now redirects to the new modular structure.

To revert the changes, you can restore the .backup files.
=============================================
`);
  } catch (error) {
    console.error('Error during migration:', error);
  }
}

// Run the migration
main();

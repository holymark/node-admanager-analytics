const fs = require('fs-extra');
const path = require('path');

const sourceDir = path.join(__dirname, 'src', 'public'); 
const destDir = path.join(__dirname, 'dist', 'public');

console.log(`Copying static files from ${sourceDir} to ${destDir}...`);

fs.copy(sourceDir, destDir)
  .then(() => console.log('Static files copied successfully!'))
  .catch(err => console.error('Error copying static files:', err));
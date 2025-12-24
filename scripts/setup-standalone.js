const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');

/**
 * Recursively copy directory
 */
async function copyDir(src, dest) {
  await fsp.mkdir(dest, { recursive: true });
  const entries = await fsp.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fsp.copyFile(srcPath, destPath);
    }
  }
}

async function setupStandalone() {
  console.log('🔧 Setting up standalone deployment...');

  const rootDir = path.join(__dirname, '..');
  const standaloneDir = path.join(rootDir, '.next', 'standalone');
  const staticDir = path.join(rootDir, '.next', 'static');
  const publicDir = path.join(rootDir, 'public');

  try {
    // Check if standalone directory exists
    if (!fs.existsSync(standaloneDir)) {
      console.error('❌ Standalone directory not found.');
      console.error('⚠️  Next.js did not generate standalone output.');
      console.error('');
      console.error('This can happen in Next.js 13.5.11. You have two options:');
      console.error('');
      console.error('Option 1: Use regular Next.js server (recommended):');
      console.error('  Update ecosystem.config.js to use: "next start -p 3000 -H 0.0.0.0"');
      console.error('');
      console.error('Option 2: Try upgrading Next.js:');
      console.error('  npm install next@latest');
      console.error('  npm run build');
      console.error('');
      console.error('For now, the build completed successfully.');
      console.error('You can use: npm start (which runs next start)');
      process.exit(0); // Exit with success since build completed
    }

    console.log('📁 Copying build artifacts...');
    
    // Create .next directory in standalone if it doesn't exist
    const standaloneNextDir = path.join(standaloneDir, '.next');
    await fsp.mkdir(standaloneNextDir, { recursive: true });

    // Copy static files
    if (fs.existsSync(staticDir)) {
      const targetStaticDir = path.join(standaloneNextDir, 'static');
      await copyDir(staticDir, targetStaticDir);
      console.log('✅ Static files copied');
    } else {
      console.warn('⚠️  Static directory not found');
    }

    // Copy server build files (includes client reference manifest)
    const serverDir = path.join(rootDir, '.next', 'server');
    const standaloneServerDir = path.join(standaloneNextDir, 'server');
    if (fs.existsSync(serverDir)) {
      // Copy the entire server directory to ensure all manifests are present
      await copyDir(serverDir, standaloneServerDir);
      console.log('✅ Server build files copied (including client manifests)');
    } else {
      console.warn('⚠️  Server directory not found');
    }

    // Copy public files
    if (fs.existsSync(publicDir)) {
      const targetPublicDir = path.join(standaloneDir, 'public');
      await copyDir(publicDir, targetPublicDir);
      console.log('✅ Public files copied');
    } else {
      console.warn('⚠️  Public directory not found');
    }

    // Copy .env file if it exists
    const envFile = path.join(rootDir, '.env');
    const envLocalFile = path.join(rootDir, '.env.local');
    const standaloneEnvFile = path.join(standaloneDir, '.env');
    
    if (fs.existsSync(envLocalFile)) {
      await fsp.copyFile(envLocalFile, standaloneEnvFile);
      console.log('✅ .env.local file copied to standalone');
    } else if (fs.existsSync(envFile)) {
      await fsp.copyFile(envFile, standaloneEnvFile);
      console.log('✅ .env file copied to standalone');
    } else {
      console.warn('⚠️  No .env or .env.local file found');
      console.warn('⚠️  Make sure to set environment variables in the standalone directory');
    }

    // Copy sharp module for image optimization (required for standalone mode)
    const sharpSource = path.join(rootDir, 'node_modules', 'sharp');
    const sharpDest = path.join(standaloneDir, 'node_modules', 'sharp');
    if (fs.existsSync(sharpSource)) {
      const sharpDestDir = path.dirname(sharpDest);
      await fsp.mkdir(sharpDestDir, { recursive: true });
      await copyDir(sharpSource, sharpDest);
      console.log('✅ Sharp module copied to standalone');
    } else {
      console.warn('⚠️  Sharp module not found in node_modules');
      console.warn('⚠️  Run "npm install sharp" to enable image optimization');
    }

    // Copy dotenv module for loading .env files in standalone mode
    const dotenvSource = path.join(rootDir, 'node_modules', 'dotenv');
    const dotenvDest = path.join(standaloneDir, 'node_modules', 'dotenv');
    if (fs.existsSync(dotenvSource)) {
      await fsp.mkdir(path.dirname(dotenvDest), { recursive: true });
      await copyDir(dotenvSource, dotenvDest);
      console.log('✅ Dotenv module copied to standalone');
    } else {
      console.warn('⚠️  Dotenv module not found in node_modules');
    }

    console.log('✨ Standalone setup complete!');
    console.log('📝 You can now run: node .next/standalone/server.js');

  } catch (error) {
    console.error('❌ Error setting up standalone:', error);
    process.exit(1);
  }
}

setupStandalone();

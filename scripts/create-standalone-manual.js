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

/**
 * Create standalone structure manually from server files
 */
async function createStandaloneManually() {
  console.log('🔧 Creating standalone structure manually...');

  const rootDir = path.join(__dirname, '..');
  const standaloneDir = path.join(rootDir, '.next', 'standalone');
  const serverDir = path.join(rootDir, '.next', 'server');
  const staticDir = path.join(rootDir, '.next', 'static');
  const publicDir = path.join(rootDir, 'public');
  const nodeModulesDir = path.join(rootDir, 'node_modules');

  try {
    // Create standalone directory
    await fsp.mkdir(standaloneDir, { recursive: true });
    console.log('✅ Created standalone directory');

    // Copy server files
    if (fs.existsSync(serverDir)) {
      await copyDir(serverDir, path.join(standaloneDir, 'server'));
      console.log('✅ Copied server files');
    } else {
      throw new Error('Server directory not found');
    }

    // Create .next directory in standalone
    const standaloneNextDir = path.join(standaloneDir, '.next');
    await fsp.mkdir(standaloneNextDir, { recursive: true });

    // Copy static files
    if (fs.existsSync(staticDir)) {
      const targetStaticDir = path.join(standaloneNextDir, 'static');
      await copyDir(staticDir, targetStaticDir);
      console.log('✅ Copied static files');
    } else {
      console.warn('⚠️  Static directory not found');
    }

    // Copy public files
    if (fs.existsSync(publicDir)) {
      const targetPublicDir = path.join(standaloneDir, 'public');
      await copyDir(publicDir, targetPublicDir);
      console.log('✅ Copied public files');
    } else {
      console.warn('⚠️  Public directory not found');
    }

    // Create server.js file
    const serverJsContent = `const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port, dir: __dirname });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  }).listen(port, hostname, (err) => {
    if (err) throw err;
    console.log(\`> Ready on http://\${hostname}:\${port}\`);
  });
});
`;

    const serverJsPath = path.join(standaloneDir, 'server.js');
    await fsp.writeFile(serverJsPath, serverJsContent);
    console.log('✅ Created server.js');

    // Copy package.json
    const packageJsonPath = path.join(rootDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(await fsp.readFile(packageJsonPath, 'utf8'));
      // Create minimal package.json for standalone
      const standalonePackageJson = {
        name: packageJson.name,
        version: packageJson.version,
        private: true,
        scripts: {
          start: 'node server.js'
        },
        dependencies: {
          next: packageJson.dependencies.next,
          react: packageJson.dependencies.react,
          'react-dom': packageJson.dependencies['react-dom']
        }
      };
      await fsp.writeFile(
        path.join(standaloneDir, 'package.json'),
        JSON.stringify(standalonePackageJson, null, 2)
      );
      console.log('✅ Created package.json');
    }

    console.log('✨ Standalone structure created manually!');
    console.log('📝 Note: This is a workaround. You may need to install dependencies in the standalone directory.');
    console.log('📝 You can now try: cd .next/standalone && npm install && node server.js');

  } catch (error) {
    console.error('❌ Error creating standalone structure:', error);
    process.exit(1);
  }
}

createStandaloneManually();


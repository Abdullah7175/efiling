#!/bin/bash

echo "=== Backend Health Check ==="
echo ""

echo "1. Checking if PM2 process is running..."
pm2 list | grep wmp
if [ $? -eq 0 ]; then
    echo "✅ PM2 process found"
    pm2 info wmp
else
    echo "❌ PM2 process NOT running"
fi

echo ""
echo "2. Checking if port 3000 is listening..."
if netstat -tlnp 2>/dev/null | grep :3000 > /dev/null; then
    echo "✅ Port 3000 is listening"
    netstat -tlnp | grep :3000
elif ss -tlnp 2>/dev/null | grep :3000 > /dev/null; then
    echo "✅ Port 3000 is listening"
    ss -tlnp | grep :3000
else
    echo "❌ Port 3000 is NOT listening"
fi

echo ""
echo "3. Testing backend connection..."
if curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000 | grep -q "200\|301\|302"; then
    echo "✅ Backend responds on http://127.0.0.1:3000"
    curl -I http://127.0.0.1:3000 2>&1 | head -5
else
    echo "❌ Backend does NOT respond on http://127.0.0.1:3000"
    echo "Response:"
    curl -v http://127.0.0.1:3000 2>&1 | head -10
fi

echo ""
echo "4. Checking standalone server.js exists..."
if [ -f ".next/standalone/server.js" ]; then
    echo "✅ Standalone server.js exists"
    ls -lh .next/standalone/server.js
else
    echo "❌ Standalone server.js NOT found"
    echo "Run: npm run build"
fi

echo ""
echo "5. Checking PM2 logs (last 10 lines)..."
pm2 logs wmp --lines 10 --nostream 2>&1 | tail -10

echo ""
echo "=== Check Complete ==="


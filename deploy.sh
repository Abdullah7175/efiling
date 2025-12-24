#!/bin/bash

# WMP Deployment Script
# This script automates the deployment process for the standalone Next.js app

set -e  # Exit on error

echo "🚀 Starting WMP deployment..."
echo "================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    print_error "package.json not found. Are you in the project root?"
    exit 1
fi

# Stop PM2 if running
print_status "Stopping PM2..."
pm2 stop wmp 2>/dev/null || print_warning "PM2 process not running"

# Pull latest code (optional - uncomment if deploying from git)
# print_status "Pulling latest code..."
# git pull origin main

# Install/update dependencies
print_status "Installing dependencies..."
npm install

# Clean old build
print_status "Cleaning old build..."
rm -rf .next

# Build the application
print_status "Building application..."
npm run build

# Verify standalone setup
print_status "Verifying standalone setup..."
if [ -d ".next/standalone/.next/static" ]; then
    print_status "Static files copied successfully"
else
    print_error "Static files not found in standalone directory!"
    print_warning "Running manual setup..."
    npm run setup:standalone
fi

if [ -d ".next/standalone/public" ]; then
    print_status "Public files copied successfully"
else
    print_warning "Public directory not found in standalone!"
fi

# Start PM2
print_status "Starting PM2..."
pm2 start ecosystem.config.js

# Save PM2 configuration
print_status "Saving PM2 configuration..."
pm2 save

# Show status
echo ""
echo "================================"
print_status "Deployment complete!"
echo ""
echo "📊 Application Status:"
pm2 list

echo ""
echo "📝 Quick Commands:"
echo "  View logs:    pm2 logs wmp"
echo "  Restart:      pm2 restart wmp"
echo "  Stop:         pm2 stop wmp"
echo "  Monitor:      pm2 monit"
echo ""


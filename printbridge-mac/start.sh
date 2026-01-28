#!/bin/bash

# PrintBridge for Mac - Startup Script
# =====================================

cd "$(dirname "$0")"

echo ""
echo "PrintBridge for Mac - Starting..."
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed!"
    echo ""
    echo "Please install Node.js from: https://nodejs.org"
    echo "Or using Homebrew: brew install node"
    echo ""
    read -p "Press Enter to exit..."
    exit 1
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "First run detected. Installing dependencies..."
    echo "This may take 1-2 minutes..."
    echo ""
    npm install
    if [ $? -ne 0 ]; then
        echo ""
        echo "ERROR: Failed to install dependencies!"
        read -p "Press Enter to exit..."
        exit 1
    fi
    echo ""
    echo "Dependencies installed successfully!"
    echo ""
fi

# Run the server
node server.js

# Keep window open on error
if [ $? -ne 0 ]; then
    echo ""
    echo "PrintBridge encountered an error."
    read -p "Press Enter to exit..."
fi

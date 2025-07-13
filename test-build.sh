#!/bin/bash

echo "🔧 Testing build configuration locally..."

echo "📦 Installing dependencies..."
npm ci

echo "🔍 Running linting..."
npm run lint -- --fix

echo "🔨 Building TypeScript..."
npm run build

echo "🧪 Running tests..."
npm run test:unit
npm run test:integration

echo "📱 Building Electron app..."
npm run dist

echo "✅ Build test completed successfully!"
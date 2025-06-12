# Windows Build Troubleshooting

## 7-Zip Extraction Error

If you encounter the error:
```
command='...\7za.exe' x -bd '...\winCodeSign\*.7z' failed
```

This is related to Windows code signing cache. Here are the solutions:

### Solution 1: Clear electron-builder cache

1. Delete the electron-builder cache:
   ```powershell
   Remove-Item -Recurse -Force "$env:LOCALAPPDATA\electron-builder\Cache"
   ```

2. Retry the build:
   ```powershell
   npm run build
   npm run dist -- --win
   ```

### Solution 2: Build without code signing

For development/testing, you can build without code signing:

```powershell
npm run dist -- --win --publish=never
```

Or set environment variable:
```powershell
$env:WIN_CSC_LINK=""
npm run dist -- --win
```

### Solution 3: Run as Administrator

1. Open PowerShell as Administrator
2. Navigate to your project directory
3. Run the build command

### Solution 4: Install 7-Zip manually

1. Download and install 7-Zip from https://www.7-zip.org/
2. Add 7-Zip to your PATH environment variable
3. Restart your terminal and retry

### Solution 5: Use portable build (no installer)

Build a portable version that doesn't require code signing:

```powershell
npm run dist -- --win portable
```

### Solution 6: Clean install

1. Delete node_modules and package-lock.json:
   ```powershell
   Remove-Item -Recurse -Force node_modules
   Remove-Item package-lock.json
   ```

2. Clear npm cache:
   ```powershell
   npm cache clean --force
   ```

3. Reinstall dependencies:
   ```powershell
   npm install
   ```

4. Rebuild:
   ```powershell
   npm run build
   npm run dist -- --win
   ```

## Building without installer (for quick testing)

If you just want to test the built application without creating an installer:

```powershell
# Build the TypeScript code
npm run build

# Package the app without installer
npx electron-builder --win --dir
```

This creates an unpacked application in `dist-electron\win-unpacked\` that you can run directly.

## Alternative: Manual packaging

For development testing, you can manually package:

```powershell
# Install electron-packager globally
npm install -g electron-packager

# Package the app
electron-packager . "Perfect World Account Manager" --platform=win32 --arch=x64 --out=dist-manual --overwrite
```

## Common Issues

### Issue: Missing dependencies in built app

Make sure all runtime dependencies are in `dependencies` not `devDependencies` in package.json.

### Issue: App crashes on start

Check that all paths in the code use `path.join()` for cross-platform compatibility.

### Issue: Assets not included

Ensure assets are listed in the `files` array in package.json build configuration.
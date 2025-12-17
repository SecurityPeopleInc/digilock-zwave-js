# Quick Start Guide - Running Digilock

## Step 1: Enable Corepack (if needed)

If you get a yarn version error, enable Corepack:

```bash
# You may need to run this with sudo:
sudo corepack enable

# Or if that doesn't work, try:
corepack enable
```

## Step 2: Install Dependencies

From the **root** of the zwave-js repository:

```bash
cd /Users/leonnardo/Documents/Z-Wave-JS-UI/zwave-js
yarn install
```

This will install all dependencies for the entire monorepo, including Digilock.

## Step 3: Build zwave-js Source Code

Build the zwave-js packages (this compiles TypeScript to JavaScript):

```bash
# From the root directory
yarn build
```

**Note**: This may take a few minutes the first time.

## Step 4: Set Environment Variables (Optional)

```bash
# Set your Z-Wave controller port
export ZWAVE_PORT="/dev/tty.usbserial-DK0E7J3D"  # Change to your actual port

# Optional: Set server port (defaults to 3001)
export PORT=3001
```

To find your Z-Wave controller port on macOS:
```bash
ls /dev/tty.usb* /dev/tty.*usb* 2>/dev/null
```

## Step 5: Run the Server

From the **Digilock** directory:

```bash
cd Digilock
yarn start
```

Or for development with auto-reload:

```bash
yarn dev
```

## Troubleshooting

### If `yarn install` fails with version error:

1. Make sure Corepack is enabled (see Step 1)
2. Try: `corepack prepare yarn@4.10.3 --activate`
3. Verify: `yarn --version` (should show 4.10.3)

### If you get "Cannot find module" errors:

1. Make sure you ran `yarn build` from the root directory
2. Check that all packages built successfully
3. Try rebuilding: `yarn build zwave-js`

### If TypeScript errors occur:

The code uses `tsx` to run TypeScript directly. If `tsx` is not found:
- It should be installed as part of the root dependencies
- Make sure you ran `yarn install` from the root

### Alternative: Run with node directly

If `tsx` doesn't work, you can try using the built JavaScript files. But since you're importing from source `.ts` files, `tsx` is required.

## Expected Output

When the server starts successfully, you should see:

```
Smart Start Provisioner server running on http://localhost:3001
Z-Wave controller port: /dev/tty.usbserial-DK0E7J3D
Set ZWAVE_PORT environment variable to change the controller port
Connecting to Z-Wave controller on /dev/tty.usbserial-DK0E7J3D...
Driver is ready
All nodes are ready
```

## Testing

1. Open your browser to `http://localhost:3001`
2. The WebSocket will connect automatically
3. You should see the provisioning interface


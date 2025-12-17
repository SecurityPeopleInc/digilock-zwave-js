# Digilock Z-Wave Provisioning Client

This project uses the zwave-js source code directly instead of the published package.

## Prerequisites

1. **Node.js**: Version 20 or higher (required by zwave-js)
2. **Yarn**: Version 4.x (the monorepo uses yarn workspaces)
3. **Z-Wave Controller**: A serial port connected Z-Wave controller

## Setup Instructions

### 1. Install Dependencies

First, make sure you're in the root of the zwave-js repository:

```bash
cd /Users/leonnardo/Documents/Z-Wave-JS-UI/zwave-js
```

Install all dependencies (this will install dependencies for the entire monorepo):

```bash
yarn install
```

### 2. Build the zwave-js Source Code

Since you're using the source code directly, you need to build it first:

```bash
yarn build
```

This will compile all TypeScript files in the monorepo. If you only want to build zwave-js and its dependencies:

```bash
yarn build zwave-js
```

**Note**: The source code uses TypeScript, but with the `@@dev` condition in package.json, Node.js can run the TypeScript files directly using `tsx` or with proper conditions. However, some packages may need to be built.

### 3. Install Digilock Dependencies

The Digilock workspace is included in the monorepo. Dependencies will be installed when you run `yarn install` in the root directory. No separate installation needed!

### 4. Configure Environment Variables

Set the Z-Wave controller port (optional, defaults to `/dev/tty.usbserial-DK0E7J3D`):

```bash
export ZWAVE_PORT="/dev/tty.usbserial-DK0E7J3D"  # or your actual port
export PORT=3001  # Optional: server port (defaults to 3001)
```

### 5. Run the Server

From the Digilock directory:

```bash
yarn start
```

Or for development with auto-reload:

```bash
yarn dev
```

## Troubleshooting

### Issue: Module not found errors

If you get errors like "Cannot find module", make sure:
1. You've run `yarn build` in the root directory
2. All dependencies are installed with `yarn install` in the root
3. The relative paths in your imports are correct

### Issue: TypeScript errors

The source code is TypeScript, but Node.js should be able to run it with the `@@dev` condition. If you encounter issues:

1. Make sure you're using Node.js 20+
2. Try using `tsx` instead:
   ```bash
   npx tsx --conditions=@@dev src/server.js
   ```

### Issue: Import path errors

If imports fail, verify the relative paths are correct:
- From `Digilock/src/` to `packages/zwave-js/src/` = `../../packages/zwave-js/src/`
- From `Digilock/models/` to `packages/zwave-js/src/` = `../../packages/zwave-js/src/`

### Issue: Z-Wave controller not found

Make sure:
1. The controller is connected
2. The port path is correct (check with `ls /dev/tty.*` on macOS/Linux)
3. You have permissions to access the serial port

## Development

### Watch Mode

To automatically rebuild when source changes:

```bash
# In the root directory
yarn watch
```

This will watch and rebuild zwave-js when you make changes.

### Testing Changes

After modifying zwave-js source code:
1. The watch mode should rebuild automatically
2. Restart your Digilock server to pick up changes

## Project Structure

```
Digilock/
├── src/
│   ├── server.js          # Express server with WebSocket
│   ├── zwave-client.js   # Z-Wave client wrapper
│   ├── manufacturer-proprietary.js
│   └── device-config.js
├── models/
│   └── ZWaveController.js
├── public/
│   └── index.html
└── package.json
```

## API

The server runs on `http://localhost:3001` (or the port specified in `PORT` env var).

WebSocket endpoint: `ws://localhost:3001`

See `src/server.js` for available WebSocket message types.


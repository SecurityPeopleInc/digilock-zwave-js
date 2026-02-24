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

## Step 4: Set Environment Variables

**Required when running the process** all security keys must be set. If any is missing, the process exits with code 1 and an error listing the missing variables.

```bash
# Required – Z-Wave security keys (32 hex chars each)
export ZWAVE_S0_LEGACY_KEY="..."
export ZWAVE_S2_ACCESS_CONTROL_KEY="..."
export ZWAVE_S2_AUTHENTICATED_KEY="..."
export ZWAVE_S2_UNAUTHENTICATED_KEY="..."

# Required – Long Range security keys
export ZWAVE_S2_ACCESS_CONTROL_KEY_LR="..."
export ZWAVE_S2_AUTHENTICATED_KEY_LR="..."

# Required when running the bundle – Z-Wave serial port (e.g. /dev/serial/by-id/usb-XXXX_YYYY-if00)
export ZWAVE_PORT="/dev/tty.usbserial-DK0E7J3D"
```

Optional:

```bash
# Set server port (defaults to 3005)
export PORT=3005

# Cache directory for Z-Wave driver (defaults to ./store/cache)
export ZWAVE_CACHE_DIR="/path/to/cache"

# Log level: silly | debug | verbose | info | warn | error (defaults to silly)
export ZWAVE_LOG_LEVEL="debug"
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

## Bundling for deployment

You can bundle the Digilock server and its zwave-js dependencies into a single ESM file for deployment (e.g. to run from a Kotlin app via `ProcessBuilder`).

### Prerequisites

1. From the **repo root** (one level above `Digilock`), build all packages:
   ```bash
   yarn build
   ```
2. Install dependencies (including `esbuild`) from repo root or from `Digilock`:
   ```bash
   yarn install
   ```

### Create the bundle

From the **Digilock** directory:

```bash
cd Digilock
yarn bundle
```

This writes `Digilock/dist/digilock-bundle.js` (and `digilock-bundle.js.map`), and copies `public/` and `store/` into `dist/` so the bundle finds them via `__dirname`.

### Run the bundle

- **From the Digilock directory:**
  ```bash
  node dist/digilock-bundle.js
  ```
- **Or from `dist`** (e.g. after copying `dist/` to a deploy folder):
  ```bash
  cd dist && node digilock-bundle.js
  ```
- **Serial port:** Set the **ZWAVE_PORT** environment variable (required); there is no CLI argument.
- **Serialport:** The bundle requires the `serialport` native module at runtime. Run from the repo (so monorepo `node_modules` is used) or run `npm install serialport` in `dist/` after extracting the artifact.

### Deploy layout (e.g. for Kotlin)

Copy to your app (e.g. `/opt/myapp/`): the **dist/** folder from the artifact (bundle, `public/`, `store/`). Ensure `serialport` is available at runtime (e.g. run from a directory that has `node_modules` with serialport, or install it where you run the bundle).

Set required env vars (see Step 4), including **ZWAVE_PORT**, then start with:

```bash
/usr/bin/node /opt/myapp/digilock-bundle.js
```

Or from Kotlin (all configuration via environment variables; no CLI args):

```kotlin
val cmd = listOf("/usr/bin/node", "/opt/myapp/digilock-bundle.js")
val pb = ProcessBuilder(cmd)
pb.environment().apply {
    put("ZWAVE_S0_LEGACY_KEY", "…")
    put("ZWAVE_S2_ACCESS_CONTROL_KEY", "…")
    put("ZWAVE_S2_AUTHENTICATED_KEY", "…")
    put("ZWAVE_S2_UNAUTHENTICATED_KEY", "…")
    put("ZWAVE_S2_ACCESS_CONTROL_KEY_LR", "…")
    put("ZWAVE_S2_AUTHENTICATED_KEY_LR", "…")
    put("ZWAVE_PORT", "/dev/serial/by-id/usb-XXXX_YYYY-if00")
    put("PORT", "3005")  // optional
}
val node = pb.start()
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


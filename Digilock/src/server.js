import express from "express";
import cors from "cors";
import { ZWaveProvisioningClient } from "./zwave-client.js";
import { ZWaveControllerWebsocket } from "./plugins/ZWaveControllerWebsocket.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const ZWAVE_PORT = process.env.ZWAVE_PORT || "/dev/tty.usbserial-DK0E7J3D";

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, "public")));

let zwaveClient = null;
let currentPort = ZWAVE_PORT;
let websocketPlugin = null;

const securityKeys = {
  S2_Unauthenticated: "A0ADEA1A03E4ED41C1EB5AA6D477BF80",
  S2_Authenticated: "7AD358BD306A785992C5F1F7044B7A2D",
  S2_AccessControl: "4D7E6B134365DB71380955FDE55035E6",
  S0_Legacy: "72132737DD98E1FC4474E08F1DEC7FCD",
};

const securityKeysLongRange = {
  S2_Authenticated: "09C5ECF58262835ACBBF8075F70640A2",
  S2_AccessControl: "D96F0EAFCA380BE25C87078B93EEE12E",
};

async function initializeDriver(port) {
  // Close existing driver if it exists
  if (zwaveClient) {
    try {
      await zwaveClient.close();
    } catch (error) {
      console.error("Error closing existing driver:", error);
    }
  }

  // Create new client with security keys
  zwaveClient = new ZWaveProvisioningClient(port, {
    cacheDir: "./store/cache",
    logLevel: "silly",
    securityKeys: securityKeys,
    securityKeysLongRange: securityKeysLongRange,
    deviceConfigPriorityDir: "./store/device-configs", // For forcing CC 0x91 support
  });

  try {
    await zwaveClient.connect();
    currentPort = port;
    console.log(`Successfully connected to Z-Wave controller on ${port}`);
    
    // Update WebSocket plugin with the connected client
    if (websocketPlugin) {
      websocketPlugin.setZWaveClient(zwaveClient, currentPort);
    }
  } catch (error) {
    console.error("Failed to connect to Z-Wave controller:", error);
    throw error;
  }
}

const server = app.listen(PORT, () => {
  console.log(
    `Smart Start Provisioner server running on http://localhost:${PORT}`
  );
  console.log(`Z-Wave controller port: ${ZWAVE_PORT}`);
  console.log(
    `Set ZWAVE_PORT environment variable to change the controller port`
  );
  console.log(
    `WebSocket is ready. Use the START command to initialize the Z-Wave driver.`
  );
});

// Initialize WebSocket plugin immediately (before driver starts)
const plugin = new ZWaveControllerWebsocket();
websocketPlugin = plugin.apply(null, {
  server,
  zwaveClient: null, // Start with null, will be set when driver starts
  currentPort: ZWAVE_PORT,
  initializeDriver, // Pass the function to start the driver
  securityKeys,
  securityKeysLongRange,
});

process.on("SIGINT", async () => {
  console.log("\nShutting down...");
  if (zwaveClient) {
    await zwaveClient.close();
  }
  if (websocketPlugin) {
    websocketPlugin.close();
  }
  server.close();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\nShutting down...");
  if (zwaveClient) {
    await zwaveClient.close();
  }
  if (websocketPlugin) {
    websocketPlugin.close();
  }
  server.close();
  process.exit(0);
});

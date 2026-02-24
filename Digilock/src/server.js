import express from "express";
import cors from "cors";
import { ZWaveProvisioningClient } from "./zwave-client.js";
import { ZWaveControllerWebsocket } from "./plugins/ZWaveControllerWebsocket.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Message shown when serialport is missing (driver cannot connect to hardware without it) */
export const SERIALPORT_REQUIRED_MESSAGE =
	"The \"serialport\" native module is required to connect to a Z-Wave controller. From the folder containing the bundle, run: npm init -y && npm install serialport";

/** Environment variable names for required Z-Wave security keys (Kotlin/ProcessBuilder) */
const REQUIRED_SECURITY_KEY_ENV = {
	S0_Legacy: "ZWAVE_S0_LEGACY_KEY",
	S2_AccessControl: "ZWAVE_S2_ACCESS_CONTROL_KEY",
	S2_Authenticated: "ZWAVE_S2_AUTHENTICATED_KEY",
	S2_Unauthenticated: "ZWAVE_S2_UNAUTHENTICATED_KEY",
};

/** Required env vars for Long Range security keys */
const LONG_RANGE_KEY_ENV = {
	S2_AccessControl: "ZWAVE_S2_ACCESS_CONTROL_KEY_LR",
	S2_Authenticated: "ZWAVE_S2_AUTHENTICATED_KEY_LR",
};

const HEX_KEY_LENGTH = 32;

function isHexKey(value) {
	return (
		typeof value === "string" &&
		value.length === HEX_KEY_LENGTH &&
		/^[0-9A-Fa-f]+$/.test(value)
	);
}

/**
 * Load security keys from environment. Exits process with code 1 if any required key is missing.
 * @returns {{ securityKeys: Object, securityKeysLongRange: Object }}
 */
function loadSecurityKeysFromEnv() {
	const missing = [];
	const securityKeys = {};
	for (const [keyName, envVar] of Object.entries(REQUIRED_SECURITY_KEY_ENV)) {
		const value = process.env[envVar];
		if (!value || !isHexKey(value)) {
			missing.push(envVar);
		} else {
			securityKeys[keyName] = value;
		}
	}
	const securityKeysLongRange = {};
	for (const [keyName, envVar] of Object.entries(LONG_RANGE_KEY_ENV)) {
		const value = process.env[envVar];
		if (!value || !isHexKey(value)) {
			missing.push(envVar);
		} else {
			securityKeysLongRange[keyName] = value;
		}
	}
	if (missing.length > 0) {
		console.error(
			"[FATAL] Security keys do not exist or are invalid. Set all required environment variables:",
		);
		missing.forEach((m) => console.error(`  - ${m}`));
		console.error(
			"Each key must be a 32-character hexadecimal string (16 bytes).",
		);
		process.exit(1);
	}

	return { securityKeys, securityKeysLongRange };
}

const { securityKeys, securityKeysLongRange } = loadSecurityKeysFromEnv();

/** Serial port must be set via ZWAVE_PORT (required for the bundle). */
function getRequiredZwavePort() {
	const port = process.env.ZWAVE_PORT;
	if (!port || typeof port !== "string" || port.trim() === "") {
		console.error(
			"[FATAL] Z-Wave serial port not set. Set the ZWAVE_PORT environment variable (e.g. /dev/serial/by-id/usb-XXXX_YYYY-if00).",
		);
		process.exit(1);
	}
	return port.trim();
}

const app = express();
const PORT = process.env.PORT || 3005;
const ZWAVE_PORT = getRequiredZwavePort();
const CACHE_DIR = process.env.ZWAVE_CACHE_DIR || "./store/cache";
const LOG_LEVEL = process.env.ZWAVE_LOG_LEVEL || "silly";

// Middleware
app.use(cors());
app.use(express.json());
const publicDir = join(__dirname, "public");
app.use(express.static(publicDir));
// Ensure GET / serves the frontend (avoids "Cannot GET /" when static root is wrong e.g. in bundle)
app.get("/", (req, res) => {
	res.sendFile(join(publicDir, "index.html"));
});

let zwaveClient = null;
let currentPort = ZWAVE_PORT;
let websocketPlugin = null;

// const securityKeys = {
// 	S2_Unauthenticated: "A0ADEA1A03E4ED41C1EB5AA6D477BF80",
// 	S2_Authenticated: "7AD358BD306A785992C5F1F7044B7A2D",
// 	S2_AccessControl: "4D7E6B134365DB71380955FDE55035E6",
// 	S0_Legacy: "72132737DD98E1FC4474E08F1DEC7FCD",
// };

// const securityKeysLongRange = {
// 	S2_Authenticated: "09C5ECF58262835ACBBF8075F70640A2",
// 	S2_AccessControl: "D96F0EAFCA380BE25C87078B93EEE12E",
// };

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
		cacheDir: CACHE_DIR,
		logLevel: LOG_LEVEL,
		securityKeys: securityKeys,
		securityKeysLongRange: securityKeysLongRange,
		deviceConfigPriorityDir: "./store/device-configs",
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
		const isSerialportMissing =
			error?.code === "ERR_MODULE_NOT_FOUND" ||
			error?.message?.includes("Cannot find package 'serialport'");
		if (isSerialportMissing) {
			console.error("[FATAL]", SERIALPORT_REQUIRED_MESSAGE);
			throw new Error(SERIALPORT_REQUIRED_MESSAGE);
		}
		console.error("Failed to connect to Z-Wave controller:", error);
		throw error;
	}
}

const server = app.listen(PORT, () => {
	console.log(
		`Smart Start Provisioner server running on http://localhost:${PORT}`,
	);
	console.log(`Z-Wave controller port: ${ZWAVE_PORT}`);
	console.log(
		`Set ZWAVE_PORT environment variable to change the controller port`,
	);
	console.log(
		`WebSocket is ready. Use the START command to initialize the Z-Wave driver.`,
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
	cacheDir: CACHE_DIR,
	logLevel: LOG_LEVEL,
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

import { mkdir, writeFile, access } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Ensures the custom device config directory exists and contains
 * a device config file that forces Manufacturer Proprietary (0x91) support.
 *
 * This is necessary because zwave-js blocks CC 0x91 if it's not advertised
 * in the node's NIF. By creating a custom device config with compat settings,
 * we can force zwave-js to treat CC 0x91 as supported for specific devices.
 *
 * @param {string} configDir - Path to the device config directory
 * @returns {Promise<string>} The path to the config directory
 */
export async function ensureCustomDeviceConfig(
  configDir = "./store/device-configs"
) {
  try {
    // Ensure directory exists
    await mkdir(configDir, { recursive: true });

    // Path to the device config file
    const configFilePath = join(configDir, "silabs-lr-dev.json");

    // Check if file already exists
    try {
      await access(configFilePath);
      console.log(
        `✅ Custom device config already exists at ${configFilePath}`
      );
      return configDir;
    } catch {
      // File doesn't exist, create it
    }

    // Create the device config JSON
    // This config forces CC 0x91 (Manufacturer Proprietary) to be treated as supported
    // for Silicon Labs dev boards (manufacturerId 0x0000, productType/productId 0x0004)
    const deviceConfig = {
      manufacturer: "Silicon Labs (dev board)",
      manufacturerId: "0x0000",
      label: "Silabs LR Dev (hack)",
      description:
        "Dev board with Manufacturer Proprietary CC forced on for testing.",
      devices: [
        {
          productType: "0x0004",
          productId: "0x0004",
        },
      ],
      firmwareVersion: {
        min: "0.0",
        max: "255.255",
      },
      compat: {
        commandClasses: {
          add: {
            91: {
              isSupported: true,
            },
          },
        },
      },
    };

    // Write the config file
    await writeFile(
      configFilePath,
      JSON.stringify(deviceConfig, null, 2),
      "utf8"
    );
    console.log(`✅ Created custom device config at ${configFilePath}`);
    console.log(
      `   This config forces Manufacturer Proprietary (CC 0x91) support for Silicon Labs dev boards`
    );

    return configDir;
  } catch (error) {
    console.error("Failed to ensure custom device config:", error);
    throw error;
  }
}

/**
 * Creates a device config file for a specific node based on its manufacturer ID,
 * product type, and product ID. This forces Manufacturer Proprietary (0x91) support.
 *
 * @param {string} configDir - Path to the device config directory
 * @param {number} nodeId - The node ID
 * @param {number} manufacturerId - The manufacturer ID (hex number, e.g., 0x0000)
 * @param {number} productType - The product type (hex number, e.g., 0x0004)
 * @param {number} productId - The product ID (hex number, e.g., 0x0004)
 * @param {string} manufacturerName - Optional manufacturer name
 * @returns {Promise<string>} The path to the created config file
 */
export async function createDeviceConfigForNode(
  configDir,
  nodeId,
  manufacturerId,
  productType,
  productId,
  manufacturerName = "Unknown Manufacturer"
) {
  try {
    // Ensure directory exists
    await mkdir(configDir, { recursive: true });

    // Convert numbers to hex strings (4 digits, lowercase)
    const manufacturerIdHex = `0x${manufacturerId
      .toString(16)
      .padStart(4, "0")
      .toLowerCase()}`;
    const productTypeHex = `0x${productType
      .toString(16)
      .padStart(4, "0")
      .toLowerCase()}`;
    const productIdHex = `0x${productId
      .toString(16)
      .padStart(4, "0")
      .toLowerCase()}`;

    // Create filename based on node ID and manufacturer
    const filename = `node-${nodeId}-${manufacturerIdHex.replace(
      "0x",
      ""
    )}.json`;
    const configFilePath = join(configDir, filename);

    // Create the device config JSON
    const deviceConfig = {
      manufacturer: manufacturerName,
      manufacturerId: manufacturerIdHex,
      label: `Node ${nodeId} (CC 0x91 forced)`,
      description: `Custom device config for Node ${nodeId} with Manufacturer Proprietary CC (0x91) forced on.`,
      devices: [
        {
          productType: productTypeHex,
          productId: productIdHex,
        },
      ],
      firmwareVersion: {
        min: "0.0",
        max: "255.255",
      },
      compat: {
        commandClasses: {
          add: {
            91: {
              isSupported: true,
            },
          },
        },
      },
    };

    // Write the config file
    await writeFile(
      configFilePath,
      JSON.stringify(deviceConfig, null, 2),
      "utf8"
    );

    console.log(
      `✅ Created device config for Node ${nodeId} at ${configFilePath}`
    );
    console.log(
      `   Manufacturer ID: ${manufacturerIdHex}, Product Type: ${productTypeHex}, Product ID: ${productIdHex}`
    );

    return configFilePath;
  } catch (error) {
    console.error(`Failed to create device config for Node ${nodeId}:`, error);
    throw error;
  }
}

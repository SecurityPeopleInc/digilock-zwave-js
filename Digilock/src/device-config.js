import { mkdir, writeFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Ensures the device config directory exists. Per-node configs (e.g. from
 * createDeviceConfigForNode) are written here when needed.
 *
 * @param {string} configDir - Path to the device config directory
 * @returns {Promise<string>} The path to the config directory
 */
export async function ensureCustomDeviceConfig(
  configDir = "./store/device-configs"
) {
  await mkdir(configDir, { recursive: true });
  return configDir;
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

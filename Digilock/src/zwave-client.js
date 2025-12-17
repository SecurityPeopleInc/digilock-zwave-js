import { Driver } from "../../packages/zwave-js/src/Driver.js";
import { ProvisioningEntryStatus } from "../../packages/zwave-js/src/Controller.js";
import { Protocols, NodeStatus } from "../../packages/core/src/definitions/index.js";
import { EventEmitter } from "events";
import {
  createManufacturerProprietarySender,
  hexTo32ByteBuffer,
} from "./manufacturer-proprietary.js";
import { ensureCustomDeviceConfig } from "./device-config.js";
import { ManufacturerProprietaryCC } from "../../packages/cc/src/cc/ManufacturerProprietaryCC.js";

/**
 * Helper function to convert hex string security keys to buffers
 */
function convertSecurityKeys(keys) {
  const buffers = {};
  for (const [key, value] of Object.entries(keys)) {
    if (value && typeof value === "string" && value.length === 32) {
      const buffer = Buffer.from(value, "hex");
      if (buffer.length === 16) {
        buffers[key] = buffer;
      }
    }
  }
  return buffers;
}

export class ZWaveProvisioningClient extends EventEmitter {
  constructor(port, options = {}) {
    super();
    this.port = port;
    this.driver = null;
    this.driverReady = false;
    this._mpSender = null; // Will be initialized after driver is ready

    // Convert security keys to buffers
    const securityKeysBuffers = convertSecurityKeys(
      options.securityKeys || {}
    );
    const securityKeysLongRangeBuffers = convertSecurityKeys(
      options.securityKeysLongRange || {}
    );

    this.options = {
      storage: {
        cacheDir: options.cacheDir || "./store/cache",
        deviceConfigPriorityDir: options.deviceConfigPriorityDir,
      },
      logConfig: {
        level: options.logLevel || "debug",
        enabled: true,
        logToFile: false,
        nodeFilter: undefined,
        filename: undefined,
      },
      // Only include security keys if they have valid buffers
      ...(Object.keys(securityKeysBuffers).length > 0 && {
        securityKeys: securityKeysBuffers,
      }),
      ...(Object.keys(securityKeysLongRangeBuffers).length > 0 && {
        securityKeysLongRange: securityKeysLongRangeBuffers,
      }),
    };
  }

  async connect() {
    try {
      console.log(`Connecting to Z-Wave controller on ${this.port}...`);

      // Ensure custom device config exists (for forcing CC 0x91 support)
      let deviceConfigPriorityDir =
        this.options.storage.deviceConfigPriorityDir;
      if (!deviceConfigPriorityDir) {
        // Default to store/device-configs if not specified
        deviceConfigPriorityDir = "./store/device-configs";
      }
      await ensureCustomDeviceConfig(deviceConfigPriorityDir);

      const driverOptions = {
        storage: {
          cacheDir: this.options.storage.cacheDir,
          deviceConfigPriorityDir: deviceConfigPriorityDir,
        },
        logConfig: this.options.logConfig,
      };

      // Only add security keys if they exist and have valid buffers
      if (
        this.options.securityKeys &&
        typeof this.options.securityKeys === "object" &&
        Object.keys(this.options.securityKeys).length > 0
      ) {
        // Verify all buffers are 16 bytes
        const validKeys = {};
        for (const [key, buffer] of Object.entries(this.options.securityKeys)) {
          if (Buffer.isBuffer(buffer) && buffer.length === 16) {
            validKeys[key] = buffer;
            console.log(
              `✅ Security key ${key} configured: ${buffer.toString("hex")}`
            );
          } else {
            console.warn(
              `❌ Security key ${key} is invalid: expected Buffer with 16 bytes, got ${
                Buffer.isBuffer(buffer) ? buffer.length : typeof buffer
              }`
            );
          }
        }
        if (Object.keys(validKeys).length > 0) {
          driverOptions.securityKeys = validKeys;
          console.log(
            `✅ Configured ${
              Object.keys(validKeys).length
            } security key(s) for standard Z-Wave`
          );
        } else {
          console.warn(`⚠️  No valid security keys found for standard Z-Wave`);
        }
      } else {
        console.warn(`⚠️  No security keys provided for standard Z-Wave`);
      }

      if (
        this.options.securityKeysLongRange &&
        typeof this.options.securityKeysLongRange === "object" &&
        Object.keys(this.options.securityKeysLongRange).length > 0
      ) {
        // Verify all buffers are 16 bytes
        const validKeys = {};
        for (const [key, buffer] of Object.entries(
          this.options.securityKeysLongRange
        )) {
          if (Buffer.isBuffer(buffer) && buffer.length === 16) {
            validKeys[key] = buffer;
            console.log(
              `✅ Long Range security key ${key} configured: ${buffer.toString(
                "hex"
              )}`
            );
          } else {
            console.warn(
              `❌ Long Range security key ${key} is invalid: expected Buffer with 16 bytes, got ${
                Buffer.isBuffer(buffer) ? buffer.length : typeof buffer
              }`
            );
          }
        }
        if (Object.keys(validKeys).length > 0) {
          driverOptions.securityKeysLongRange = validKeys;
          console.log(
            `✅ Configured ${
              Object.keys(validKeys).length
            } security key(s) for Long Range`
          );
        } else {
          console.warn(`⚠️  No valid security keys found for Long Range`);
        }
      } else {
        console.warn(`⚠️  No security keys provided for Long Range`);
      }

      // Add grantSecurityClasses callback for S2 bootstrapping
      // This is required to grant security classes when nodes request them during inclusion
      driverOptions.grantSecurityClasses = (requested) => {
        console.log(
          `[Security] 🔐 Security classes requested during bootstrapping:`,
          requested
        );
        console.log(
          `[Security]   Requested security classes:`,
          requested.securityClasses
        );

        const granted = {
          clientSideAuth: false,
          securityClasses: [],
        };

        // Map of security class numbers to key names
        const securityClassToKey = {
          0: "S2_Unauthenticated", // SecurityClass.S2_Unauthenticated
          1: "S2_Authenticated", // SecurityClass.S2_Authenticated
          2: "S2_AccessControl", // SecurityClass.S2_AccessControl
          7: "S0_Legacy", // SecurityClass.S0_Legacy
        };

        // Grant only the requested security classes that we have keys for
        if (
          requested.securityClasses &&
          Array.isArray(requested.securityClasses)
        ) {
          for (const securityClass of requested.securityClasses) {
            const keyName = securityClassToKey[securityClass];
            if (keyName && this.options.securityKeys?.[keyName]) {
              granted.securityClasses.push(securityClass);
              console.log(
                `[Security] ✅ Granting ${keyName} (class ${securityClass}) - key available`
              );
            } else {
              console.log(
                `[Security] ❌ Not granting security class ${securityClass} - no key available`
              );
            }
          }
        }

        // If no security classes were granted, log a warning
        if (granted.securityClasses.length === 0) {
          console.warn(
            `[Security] ⚠️  No security classes granted! Requested:`,
            requested.securityClasses,
            `Available keys:`,
            Object.keys(this.options.securityKeys || {})
          );
        } else {
          console.log(
            `[Security] ✅ Granting ${granted.securityClasses.length} security class(es):`,
            granted.securityClasses
          );
        }

        return granted;
      };

      this.driver = new Driver(this.port, driverOptions);

      // Set up event handlers
      this.driver.on("error", (error) => {
        console.error("Driver error:", error);
        this.emit("error", error);
      });

      this.driver.on("driver ready", () => {
        console.log("Driver is ready");
        this.driverReady = true;
        // Initialize Manufacturer Proprietary sender
        this._initializeMPSender();
        this.setupControllerHandlers();
        this.emit("ready");
      });

      this.driver.on("all nodes ready", () => {
        console.log("All nodes are ready");
        this.emit("allNodesReady");
      });

      await this.driver.start();
    } catch (error) {
      console.error("Failed to start driver:", error);
      throw error;
    }
  }

  setupControllerHandlers() {
    const controller = this.driver.controller;

    // Listen for inclusion events to help debug Smart Start
    controller.on("inclusion started", (strategy) => {
      const timestamp = new Date().toISOString();
      const strategyName =
        typeof strategy === "number"
          ? strategy === 1
            ? "SmartStart"
            : strategy === 0
              ? "Default"
              : `Strategy ${strategy}`
          : strategy;
      const currentState = controller.inclusionState;
      const stateName = currentState === 0 ? "Idle" : 
                       currentState === 1 ? "Including" :
                       currentState === 2 ? "Excluding" :
                       currentState === 3 ? "Busy" :
                       currentState === 4 ? "SmartStart" : `Unknown(${currentState})`;
      
      console.log(
        `[Smart Start] Inclusion started (strategy: ${strategyName}) [${timestamp}]`
      );
      console.log(`[Smart Start]   Current state: ${stateName} (${currentState})`);
      
      // If this is a Smart Start inclusion, log which provisioning entry triggered it
      if (strategy === 1 || strategyName === "SmartStart") {
        try {
          const entries = controller.getProvisioningEntries();
          const activeEntries = entries.filter(e => e.status === 0); // 0 = Active
          console.log(`[Smart Start]   Active provisioning entries that could trigger inclusion: ${activeEntries.length}`);
        } catch (err) {
          console.warn(`[Smart Start]   Could not get provisioning entries: ${err.message}`);
        }
      }
    });

    controller.on("inclusion failed", () => {
      const timestamp = new Date().toISOString();
      const currentState = controller.inclusionState;
      const stateName = currentState === 0 ? "Idle" : 
                       currentState === 1 ? "Including" :
                       currentState === 2 ? "Excluding" :
                       currentState === 3 ? "Busy" :
                       currentState === 4 ? "SmartStart" : `Unknown(${currentState})`;
      
      console.error(`[Smart Start] ❌ Inclusion failed [${timestamp}]`);
      console.error(`[Smart Start]   Current state: ${stateName} (${currentState})`);
      console.error(
        `[Smart Start] ⚠️  This may cause zwave-js to automatically retry, which can conflict with Smart Start listening mode`
      );
      
      // Log active provisioning entries
      try {
        const entries = controller.getProvisioningEntries();
        const activeEntries = entries.filter(e => e.status === 0); // 0 = Active
        console.error(`[Smart Start]   Active provisioning entries: ${activeEntries.length}`);
        if (activeEntries.length > 0) {
          activeEntries.forEach((entry, idx) => {
            console.error(`[Smart Start]     ${idx + 1}. DSK=${entry.dsk}, Protocol=${entry.protocol || 'ZWave'}, SecurityClasses=${JSON.stringify(entry.securityClasses)}`);
          });
        }
      } catch (err) {
        console.error(`[Smart Start]   Error getting provisioning entries: ${err.message}`);
      }
    });

    controller.on("exclusion started", () => {
      console.log(`[Smart Start] Exclusion started`);
    });

    // Set up handlers for node events
    controller.on("node added", (node) => {
      console.log(`Node ${node.id} added`);
      this._forceManufacturerProprietarySupport(node);
      this.setupManufacturerProprietaryCommandHandler(node);
      this.emit("nodeAdded", node);
    });

    controller.on("node removed", (node) => {
      console.log(`Node ${node.id} removed`);
      this.emit("nodeRemoved", node.id);
    });

    // Set up handlers for all existing nodes
    for (const node of controller.nodes.values()) {
      this._forceManufacturerProprietarySupport(node);
      this.setupManufacturerProprietaryCommandHandler(node);
    }

    // Set up node status change handlers
    for (const node of controller.nodes.values()) {
      node.on("status changed", () => {
        this.emit("nodeStatusChanged", node);
      });
    }

    // Log all provisioning entries when driver is ready for debugging
    try {
      const allEntries = controller.getProvisioningEntries();
      console.log(
        `[Smart Start] Found ${allEntries.length} provisioning entry/entries:`
      );
      allEntries.forEach((entry, index) => {
        const dskStr = this.normalizeDSK(entry.dsk);
        console.log(
          `[Smart Start]   Entry ${index + 1}: DSK=${dskStr}, Status=${
            entry.status === ProvisioningEntryStatus.Active
              ? "Active"
              : "Inactive"
          }, Protocol=${entry.protocol}, SecurityClasses=${JSON.stringify(
            entry.securityClasses
          )}`
        );
      });
    } catch (error) {
      console.warn(
        `[Smart Start] Could not list provisioning entries:`,
        error.message
      );
    }
  }


  /**
   * Normalizes a DSK string to a consistent format.
   * zwave-js accepts DSK in various formats, but we'll normalize to the standard format:
   * - Remove all dashes and spaces
   * - Convert to uppercase
   * - Re-add dashes every 5 characters (standard format: XXXXX-XXXXX-...)
   * @param {string} dsk - The DSK string in any format
   * @returns {string} Normalized DSK string
   */
  normalizeDSK(dsk) {
    if (!dsk || typeof dsk !== "string") {
      return dsk;
    }
    // Remove all dashes/spaces. Uppercase is fine for hex, digits are unaffected.
    const cleaned = dsk.replace(/[-\s]/g, "").toUpperCase();

    // Standard Z-Wave DSK representation is 8 groups of 5 decimal digits (40 digits total).
    if (/^[0-9]{40}$/.test(cleaned)) {
      return cleaned.match(/.{1,5}/g).join("-");
    }

    // Hex format: 16 bytes -> 32 hex chars. Keep legacy grouping of 5 to stay consistent with UI.
    if (/^[0-9A-F]{32}$/.test(cleaned)) {
      return cleaned.match(/.{1,5}/g).join("-");
    }

    // Some devices provide 40 hex chars (20 bytes). Try to extract a valid 32-char hex DSK.
    if (/^[0-9A-F]{40}$/.test(cleaned)) {
      console.warn(
        `[DSK] ⚠️  DSK length is ${cleaned.length} (expected 32 or 40 decimal). Attempting to extract 32-character hex DSK...`
      );
      const extracted = cleaned.substring(0, 32);
      if (/^[0-9A-F]{32}$/.test(extracted)) {
        console.log(
          `[DSK] ✅ Extracted 32-character hex DSK: ${extracted.match(/.{1,5}/g).join("-")}`
        );
        return extracted.match(/.{1,5}/g).join("-");
      }
      const extractedLast = cleaned.substring(cleaned.length - 32);
      if (/^[0-9A-F]{32}$/.test(extractedLast)) {
        console.log(
          `[DSK] ✅ Extracted 32-character hex DSK from end: ${extractedLast.match(/.{1,5}/g).join("-")}`
        );
        return extractedLast.match(/.{1,5}/g).join("-");
      }
      console.error(
        `[DSK] ❌ Could not extract valid 32-character hex DSK from 40-character input`
      );
      return dsk;
    }

    console.warn(
      `[DSK] ⚠️  DSK length is ${cleaned.length}, expected 40 decimal digits (8x5) or 32 hex characters. DSK may not work correctly.`
    );
    return dsk;
  }

  async getProvisioningEntries() {
    if (!this.driverReady) {
      throw new Error("Driver not ready");
    }

    const entries = this.driver.controller.getProvisioningEntries();

    // Enrich entries with node information
    return entries.map((entry) => {
      const node = entry.nodeId
        ? this.driver.controller.nodes.get(entry.nodeId)
        : null;

      // Convert securityClasses array back to object format for UI
      let securityClassesObj = {};
      if (Array.isArray(entry.securityClasses)) {
        entry.securityClasses.forEach((sc) => {
          switch (sc) {
            case 0: // SecurityClass.S2_Unauthenticated
              securityClassesObj.s2Unauthenticated = true;
              break;
            case 1: // SecurityClass.S2_Authenticated
              securityClassesObj.s2Authenticated = true;
              break;
            case 2: // SecurityClass.S2_AccessControl
              securityClassesObj.s2AccessControl = true;
              break;
            case 7: // SecurityClass.S0_Legacy
              securityClassesObj.s0Legacy = true;
              break;
          }
        });
      } else if (
        entry.securityClasses &&
        typeof entry.securityClasses === "object"
      ) {
        // Already in object format (shouldn't happen, but handle it)
        securityClassesObj = entry.securityClasses;
      }

      return {
        dsk: entry.dsk,
        name: entry.name || "",
        location: entry.location || "",
        status: entry.status === ProvisioningEntryStatus.Active,
        protocol:
          entry.protocol === Protocols.ZWaveLongRange
            ? "ZWaveLongRange"
            : entry.protocol === Protocols.ZWave
            ? "ZWave"
            : entry.protocol || "ZWave",
        nodeId: entry.nodeId || null,
        securityClasses: securityClassesObj,
        supportedProtocols: entry.supportedProtocols || [],
        manufacturerId: entry.manufacturerId,
        productType: entry.productType,
        productId: entry.productId,
        applicationVersion: entry.applicationVersion,
        deviceInfo: node
          ? {
              id: node.id,
              name: node.name,
              status: NodeStatus[node.status],
              deviceConfig: node.deviceConfig
                ? {
                    manufacturer: node.deviceConfig.manufacturer,
                    label: node.deviceConfig.label,
                    description: node.deviceConfig.description,
                  }
                : null,
            }
          : null,
      };
    });
  }

  async provisionSmartStartNode(entry) {
    if (!this.driverReady) {
      throw new Error("Driver not ready");
    }

    if (!entry.dsk) {
      throw new Error("DSK is required");
    }

    // Normalize DSK format to ensure consistent matching
    const originalDSK = entry.dsk;
    entry.dsk = this.normalizeDSK(entry.dsk);

    if (originalDSK !== entry.dsk) {
      console.log(
        `[Provisioning] Normalized DSK: "${originalDSK}" -> "${entry.dsk}"`
      );
    }

    console.log(
      `[Provisioning] Provisioning Smart Start node with DSK: ${entry.dsk}`
    );

    // Check if entry already exists
    const existing = this.driver.controller.getProvisioningEntry(entry.dsk);
    const isNew = !existing;

    if (existing) {
      console.log(
        `[Provisioning] Entry already exists, updating... (status: ${existing.status})`
      );
    } else {
      console.log(`[Provisioning] Creating new provisioning entry`);
    }

    // For new entries supporting Long Range, set to Inactive by default
    if (isNew && entry.supportedProtocols?.includes(Protocols.ZWaveLongRange)) {
      entry.status = ProvisioningEntryStatus.Inactive;
    } else if (entry.status === true || entry.status === "active") {
      entry.status = ProvisioningEntryStatus.Active;
    } else {
      entry.status = ProvisioningEntryStatus.Inactive;
    }

    // Convert protocol string to enum if needed
    if (typeof entry.protocol === "string") {
      if (
        entry.protocol === "ZWaveLongRange" ||
        entry.protocol === "Z-Wave Long Range"
      ) {
        entry.protocol = Protocols.ZWaveLongRange;
      } else {
        entry.protocol = Protocols.ZWave;
      }
    } else if (!entry.protocol) {
      entry.protocol = Protocols.ZWave;
    }

    // Determine if this is a Long Range entry
    const isLongRange = entry.protocol === Protocols.ZWaveLongRange;

    // Ensure securityClasses is properly formatted as an array
    // zwave-js expects securityClasses to be an array of SecurityClass enum values
    // SecurityClass enum values: 0=S2_Unauthenticated, 1=S2_Authenticated, 2=S2_AccessControl, 7=S0_Legacy
    // Process security classes first, then handle Long Range if needed
    console.log(`[Provisioning] Processing security classes from entry:`, {
      securityClasses: entry.securityClasses,
      s2AccessControl: entry.s2AccessControl,
      s2Authenticated: entry.s2Authenticated,
      s2Unauthenticated: entry.s2Unauthenticated,
      s0Legacy: entry.s0Legacy,
    });

    let securityClassesArray = [];

    // First, try to get security classes from the securityClasses property
    if (entry.securityClasses) {
      if (Array.isArray(entry.securityClasses)) {
        // Already an array, validate it contains valid numeric values
        securityClassesArray = entry.securityClasses.filter(
          (sc) => typeof sc === "number" && [0, 1, 2, 7].includes(sc)
        );
      } else if (typeof entry.securityClasses === "object") {
        // Convert object format to array format
        if (
          entry.securityClasses.s2AccessControl === true ||
          entry.securityClasses.s2AccessControl === "true"
        ) {
          securityClassesArray.push(2); // SecurityClass.S2_AccessControl
        }
        if (
          entry.securityClasses.s2Authenticated === true ||
          entry.securityClasses.s2Authenticated === "true"
        ) {
          securityClassesArray.push(1); // SecurityClass.S2_Authenticated
        }
        if (
          entry.securityClasses.s2Unauthenticated === true ||
          entry.securityClasses.s2Unauthenticated === "true"
        ) {
          securityClassesArray.push(0); // SecurityClass.S2_Unauthenticated
        }
        if (
          entry.securityClasses.s0Legacy === true ||
          entry.securityClasses.s0Legacy === "true"
        ) {
          securityClassesArray.push(7); // SecurityClass.S0_Legacy
        }
      }
    }

    // Also check individual properties (they may be passed separately)
    // This allows us to use individual properties even if securityClasses object exists but has false values
    if (entry.s2AccessControl === true || entry.s2AccessControl === "true") {
      if (!securityClassesArray.includes(2)) {
        securityClassesArray.push(2); // SecurityClass.S2_AccessControl
      }
    }
    if (entry.s2Authenticated === true || entry.s2Authenticated === "true") {
      if (!securityClassesArray.includes(1)) {
        securityClassesArray.push(1); // SecurityClass.S2_Authenticated
      }
    }
    if (
      entry.s2Unauthenticated === true ||
      entry.s2Unauthenticated === "true"
    ) {
      if (!securityClassesArray.includes(0)) {
        securityClassesArray.push(0); // SecurityClass.S2_Unauthenticated
      }
    }
    if (entry.s0Legacy === true || entry.s0Legacy === "true") {
      if (!securityClassesArray.includes(7)) {
        securityClassesArray.push(7); // SecurityClass.S0_Legacy
      }
    }

    // Always set security classes - zwave-js will validate them based on protocol
    // For Long Range, zwave-js may ignore or validate differently, but we'll include them
    entry.securityClasses = securityClassesArray;

    if (isLongRange && securityClassesArray.length > 0) {
      console.log(
        `[Provisioning] ⚠️  Long Range device with ${securityClassesArray.length} security class(es) - zwave-js will handle validation`
      );
    }

    console.log(
      `[Provisioning] ✅ Processed ${securityClassesArray.length} security class(es):`,
      securityClassesArray.length > 0 ? securityClassesArray : "none"
    );

    // Log the final entry before provisioning
    console.log(`[Provisioning] Final entry:`, {
      dsk: entry.dsk,
      protocol: entry.protocol,
      status: entry.status,
      securityClasses: entry.securityClasses,
      name: entry.name,
      location: entry.location,
    });

    // Provision the node
    this.driver.controller.provisionSmartStartNode(entry);

    // Verify the entry was added/updated
    const verifyEntry = this.driver.controller.getProvisioningEntry(entry.dsk);
    if (verifyEntry) {
      console.log(
        `[Provisioning] ✅ Entry successfully ${
          isNew ? "added" : "updated"
        } (status: ${verifyEntry.status})`
      );
    } else {
      console.warn(
        `[Provisioning] ⚠️  Entry not found after provisioning - this may indicate an issue`
      );
    }

    return entry;
  }

  async updateProvisioningEntryStatus(dsk, active) {
    if (!this.driverReady) {
      throw new Error("Driver not ready");
    }

    // Normalize DSK format
    const normalizedDSK = this.normalizeDSK(dsk);
    console.log(
      `[Provisioning] Updating entry status: DSK=${normalizedDSK}, active=${active}`
    );

    const entry = this.driver.controller.getProvisioningEntry(normalizedDSK);
    if (!entry) {
      throw new Error(`Provisioning entry not found for DSK: ${normalizedDSK}`);
    }

    entry.status = active
      ? ProvisioningEntryStatus.Active
      : ProvisioningEntryStatus.Inactive;

    this.driver.controller.provisionSmartStartNode(entry);
    return entry;
  }

  async unprovisionSmartStartNode(dskOrNodeId) {
    if (!this.driverReady) {
      throw new Error("Driver not ready");
    }

    // If it's a string (DSK), normalize it. If it's a number, it's a nodeId.
    let normalized = dskOrNodeId;
    if (typeof dskOrNodeId === "string") {
      normalized = this.normalizeDSK(dskOrNodeId);
      if (normalized !== dskOrNodeId) {
        console.log(
          `[Provisioning] Normalized DSK for unprovision: "${dskOrNodeId}" -> "${normalized}"`
        );
      }
    }

    console.log(
      `[Provisioning] Unprovisioning Smart Start node: ${normalized}`
    );
    this.driver.controller.unprovisionSmartStartNode(normalized);
  }

  /**
   * Get all nodes in the network
   * @returns {Array} Array of node information
   */
  getNodes() {
    if (!this.driverReady || !this.driver) {
      return [];
    }

    const nodes = [];
    for (const node of this.driver.controller.nodes.values()) {
      nodes.push({
        id: node.id,
        name: node.name || `Node ${node.id}`,
        status: NodeStatus[node.status] || "Unknown",
        deviceConfig: node.deviceConfig
          ? {
              manufacturer: node.deviceConfig.manufacturer,
              label: node.deviceConfig.label,
              description: node.deviceConfig.description,
            }
          : null,
      });
    }
    return nodes;
  }

  /**
   * Get a specific node by ID
   * @param {number} nodeId - The node ID
   * @returns {Object|null} Node information or null if not found
   */
  getNode(nodeId) {
    if (!this.driverReady || !this.driver) {
      return null;
    }

    const node = this.driver.controller.nodes.get(nodeId);
    if (!node) {
      return null;
    }

    return {
      id: node.id,
      name: node.name || `Node ${node.id}`,
      status: NodeStatus[node.status] || "Unknown",
      deviceConfig: node.deviceConfig
        ? {
            manufacturer: node.deviceConfig.manufacturer,
            label: node.deviceConfig.label,
            description: node.deviceConfig.description,
          }
        : null,
    };
  }


  /**
   * Initializes the Manufacturer Proprietary sender with current driver context.
   * @private
   */
  _initializeMPSender() {
    this._mpSender = createManufacturerProprietarySender({
      driver: this.driver,
      driverReady: () => this.driverReady, // Function that returns current state
      waitForDriverReady: () => this.waitForDriverReady(),
      forceManufacturerProprietarySupport: (node) =>
        this._forceManufacturerProprietarySupport(node),
    });
  }

  /**
   * Force Manufacturer Proprietary (0x91) support on a node even if it is not
   * reported in the NIF. This ensures zwave-js exposes the CC wrapper.
   * This is a minimal version used by the MP sender - full node handling is in ZWaveController.
   * @param {import("../../packages/zwave-js/src/Node.js").ZWaveNode} node
   * @private
   */
  _forceManufacturerProprietarySupport(node) {
    if (!node || typeof node.addCC !== "function") {
      return;
    }
    try {
      const ccId = 0x91; // Manufacturer Proprietary
      const alreadySupported =
        node.supportedCCs?.has?.(ccId) ||
        node.implementedCommandClasses?.has?.(ccId);
      if (!alreadySupported) {
        node.addCC(ccId, { isSupported: true, isControlled: true });
        console.log(
          `⚙️  Forced Manufacturer Proprietary support on node ${node.id}`
        );
      }
    } catch (error) {
      console.warn(
        `Failed to force Manufacturer Proprietary support on node ${node?.id}`,
        error
      );
    }
  }

  /**
   * Sets up a handler to intercept ManufacturerProprietaryCC commands from a node.
   * This intercepts commands before they reach the node's handleCommand method.
   * @param {import("../../packages/zwave-js/src/Node.js").ZWaveNode} node
   */
  setupManufacturerProprietaryCommandHandler(node) {
    if (!node || typeof node.handleCommand !== "function") {
      console.warn(
        `[MP Handler] Cannot setup handler for node ${node?.id}: node or handleCommand missing`
      );
      return;
    }

    // Check if handler is already set up (avoid double-wrapping)
    if (node._mpHandlerAttached) {
      console.log(
        `[MP Handler] Handler already attached to node ${node.id}, skipping`
      );
      return;
    }

    // Store the original handleCommand method
    const originalHandleCommand = node.handleCommand.bind(node);

    node.handleCommand = async (command) => {
      // Debug: Log all commands to see what's being received
      if (command.ccId === 0x91) {
        console.log(
          `[MP Handler] 🔍 Command received for node ${node.id}, CC ID: 0x${command.ccId.toString(16)}, type: ${command.constructor?.name}, instanceof check: ${command instanceof ManufacturerProprietaryCC}`
        );
      }

      // Check by CC ID first (more reliable than instanceof)
      const isManufacturerProprietary =
        command.ccId === 0x91 ||
        command instanceof ManufacturerProprietaryCC ||
        command.constructor?.name === "ManufacturerProprietaryCC";

      if (isManufacturerProprietary) {
        const commandData = {
          nodeId: node.id,
          manufacturerId: command.manufacturerId,
          payload: command.payload
            ? Array.from(Buffer.from(command.payload))
            : null,
          payloadLength: command.payload?.length || 0,
          endpointIndex: command.endpointIndex || 0,
        };

        console.log(
          `[MP Handler] ✅ Received ManufacturerProprietaryCC command from node ${node.id}:`,
          {
            manufacturerId: commandData.manufacturerId
              ? `0x${commandData.manufacturerId.toString(16).padStart(4, "0")}`
              : "unknown",
            payload: commandData.payload,
            payloadHex: commandData.payload
              ? Buffer.from(commandData.payload).toString("hex")
              : null,
            payloadLength: commandData.payloadLength,
            endpointIndex: commandData.endpointIndex,
            commandType: command.constructor?.name,
            ccId: command.ccId,
          }
        );

        this.emit("manufacturerProprietaryCommand", commandData);

        // Note: We don't emit commandClassCommand for Manufacturer Proprietary
        // to avoid duplicate messages. The manufacturerProprietaryCommand event
        // is sufficient and more specific.

        // Return early to prevent the "TODO: no handler" message
        // ManufacturerProprietaryCC commands are handled by our application,
        // so we don't need to pass them to the default handler
        return;
      }

      // Call the original handleCommand for all other commands
      return originalHandleCommand(command);
    };

    // Mark as attached
    node._mpHandlerAttached = true;
    console.log(
      `[MP Handler] ✅ Handler attached to node ${node.id} (CC 0x91 will be intercepted)`
    );
  }

  /**
   * Waits for the driver to be ready.
   * @param {number} timeoutMs - Timeout in milliseconds (default: 30000)
   * @returns {Promise<void>}
   */
  async waitForDriverReady(timeoutMs = 30000) {
    if (this.driverReady) {
      return;
    }

    return new Promise((resolve, reject) => {
      let timer;
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onError = (err) => {
        cleanup();
        reject(err);
      };
      const cleanup = () => {
        clearTimeout(timer);
        this.driver.off("driver ready", onReady);
        this.driver.off("error", onError);
      };

      this.driver.once("driver ready", onReady);
      this.driver.once("error", onError);
      timer = setTimeout(() => {
        cleanup();
        reject(new Error("Timed out waiting for driver ready"));
      }, timeoutMs);
    });
  }

  /**
   * Sends a Manufacturer Proprietary (CC 0x91) command with a random 32-byte payload.
   * Delegates to the Manufacturer Proprietary sender module.
   *
   * @param {number} nodeId - The target node ID (default: 2)
   * @param {number} manufacturerId - The 2-byte manufacturer ID (default: 0x0000 for Silicon Labs)
   * @param {number} count - Number of frames to send (default: 5)
   * @returns {Promise<Object>} Result object with details
   */
  async sendManufacturerProprietaryRandom(options = {}) {
    if (!this._mpSender) {
      this._initializeMPSender();
    }
    return this._mpSender.sendManufacturerProprietaryRandom(options);
  }

  /**
   * Sends a Manufacturer Proprietary (CC 0x91) command with a custom 32-byte payload.
   * Delegates to the Manufacturer Proprietary sender module.
   *
   * @param {number} nodeId - The target node ID (default: 2)
   * @param {Buffer} vendorPayload - The 32-byte vendor payload (must be exactly 32 bytes)
   * @param {number} manufacturerId - The 2-byte manufacturer ID (default: 0x0000 for Silicon Labs)
   * @param {number} count - Number of frames to send (default: 1, max: 100)
   * @returns {Promise<Object>} Result object with details
   */
  async sendManufacturerProprietaryCustom(options) {
    if (!this._mpSender) {
      this._initializeMPSender();
    }
    return this._mpSender.sendManufacturerProprietaryCustom(options);
  }

  /**
   * Converts a hex string to a 32-byte Buffer, validating the length.
   * Delegates to the Manufacturer Proprietary module.
   * @param {string} payloadHex - Hex string (with or without spaces)
   * @returns {Buffer} A 32-byte buffer
   * @throws {Error} If the hex string is invalid or doesn't decode to exactly 32 bytes
   */
  hexTo32ByteBuffer(payloadHex) {
    return hexTo32ByteBuffer(payloadHex);
  }

  async close() {
    if (this.driver) {
      await this.driver.destroy();
      this.driverReady = false;
    }
  }
}

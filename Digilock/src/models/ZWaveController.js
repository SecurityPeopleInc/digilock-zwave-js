import { Driver } from "../../../packages/zwave-js/src/Driver.js";
import { EventEmitter } from "events";
import { NodeStatus } from "../../../packages/core/src/definitions/index.js";
import { ensureCustomDeviceConfig } from "../device-config.js";
import { ZWaveLock } from "./ZWaveLock.js";

/**
 * ZWaveController - Singleton wrapper around z-wave-js Driver
 * Manages the Z-Wave network state and driver lifecycle
 */
export class ZWaveController extends EventEmitter {
  static instance = null;

  constructor(port, options = {}) {
    super();

    if (ZWaveController.instance) {
      return ZWaveController.instance;
    }

    this.port = port;
    this.driver = null;
    this.driverReady = false;
    this.nodes = new Map();
    this.controller = null;

    const securityKeysBuffers = this._convertSecurityKeys(
      options.securityKeys || {}
    );
    const securityKeysLongRangeBuffers = this._convertSecurityKeys(
      options.securityKeysLongRange || {}
    );

    this.options = {
      cacheDir: options.cacheDir || "./store/cache",
      logLevel: options.logLevel || "silly",
      deviceConfigPriorityDir:
        options.deviceConfigPriorityDir || "./store/device-configs",
    };

    this.securityKeys = securityKeysBuffers;
    this.securityKeysLongRange = securityKeysLongRangeBuffers;

    ZWaveController.instance = this;
  }

  /**
   * Convert hex string security keys to buffers
   */
  _convertSecurityKeys(keys) {
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

  /**
   * Initialize and start the Z-Wave driver (connect method)
   */
  async start() {
    if (this.driver && this.driverReady) {
      console.log("Driver already started");
      return;
    }

    if (!this.port) {
      throw new Error(
        "Serial port not specified. Set ZWAVE_PORT environment variable."
      );
    }

    try {
      console.log(`Connecting to Z-Wave controller on ${this.port}...`);

      // Ensure custom device config exists (for forcing CC 0x91 support)
      let deviceConfigPriorityDir = this.options.deviceConfigPriorityDir;
      if (!deviceConfigPriorityDir) {
        // Default to store/device-configs if not specified
        deviceConfigPriorityDir = "./store/device-configs";
      }
      await ensureCustomDeviceConfig(deviceConfigPriorityDir);

      const driverOptions = {
        storage: {
          cacheDir: this.options.cacheDir,
          deviceConfigPriorityDir: deviceConfigPriorityDir,
        },
        logConfig: {
          level: this.options.logLevel || "silly",
          enabled: true,
          logToFile: false, // Log to console, not file
          nodeFilter: undefined, // Log all nodes
          filename: undefined, // No file logging
        },
      };

      // Only add security keys if they exist and have valid buffers
      if (
        this.securityKeys &&
        typeof this.securityKeys === "object" &&
        Object.keys(this.securityKeys).length > 0
      ) {
        // Verify all buffers are 16 bytes
        const validKeys = {};
        for (const [key, buffer] of Object.entries(this.securityKeys)) {
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
        this.securityKeysLongRange &&
        typeof this.securityKeysLongRange === "object" &&
        Object.keys(this.securityKeysLongRange).length > 0
      ) {
        // Verify all buffers are 16 bytes
        const validKeys = {};
        for (const [key, buffer] of Object.entries(
          this.securityKeysLongRange
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
            if (keyName && this.securityKeys?.[keyName]) {
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
            Object.keys(this.securityKeys || {})
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

      this.driver.on("driver ready", async () => {
        console.log("Driver is ready");
        this.driverReady = true;
        this.controller = this.driver.controller;
        this._setupControllerHandlers();
        this._setupNodeHandlers();
        
        // Enable Smart Start listening mode if supported and there are active provisioning entries
        await this._enableSmartStartIfNeeded();
        
        this.emit("driver ready");
      });

      this.driver.on("all nodes ready", () => {
        console.log("All nodes are ready");
        this.emit("all nodes ready");
      });

      await this.driver.start();
    } catch (error) {
      console.error("Failed to start driver:", error);
      this.emit("error", error);
      throw error;
    }
  }

  /**
   * Alias for start() - connects to the Z-Wave controller
   */
  async connect() {
    return this.start();
  }

  /**
   * Stop the driver
   */
  async stop() {
    if (this.driver) {
      try {
        await this.driver.destroy();
        this.driver = null;
        this.driverReady = false;
        this.controller = null;
        this.nodes.clear();
        console.log("Driver stopped");
        this.emit("stopped");
      } catch (error) {
        console.error("Error stopping driver:", error);
        throw error;
      }
    }
  }

  /**
   * Get security key name from security class
   */
  _getSecurityKeyName(securityClass) {
    const mapping = {
      0x01: "S2_Unauthenticated",
      0x02: "S2_Authenticated",
      0x03: "S2_AccessControl",
      0x07: "S0_Legacy",
    };
    return mapping[securityClass] || null;
  }

  /**
   * Set up controller event handlers
   */
  _setupControllerHandlers() {
    if (!this.controller) return;

    // Inclusion/Exclusion event handlers
    this.controller.on("inclusion started", (strategy) => {
      console.log(
        `[ZWaveController] Inclusion started with strategy: ${strategy}`
      );
      this.emit("inclusion started", strategy);
    });

    this.controller.on("inclusion failed", () => {
      const currentState = this.controller.inclusionState;
      const stateName = currentState === 0 ? "Idle" : 
                       currentState === 1 ? "Including" :
                       currentState === 2 ? "Excluding" :
                       currentState === 3 ? "Busy" :
                       currentState === 4 ? "SmartStart" : `Unknown(${currentState})`;
      
      console.error(`[ZWaveController] ❌ Inclusion failed`);
      console.error(`[ZWaveController]   Current inclusion state: ${stateName} (${currentState})`);
      console.error(
        `[ZWaveController] ⚠️  Note: zwave-js may automatically retry failed Smart Start inclusions, which can cause conflicts with Smart Start listening mode`
      );
      
      // Log provisioning entries to see which one might be causing issues
      try {
        const entries = this.controller.getProvisioningEntries();
        const activeEntries = entries.filter(e => e.status === 0); // 0 = Active
        console.error(`[ZWaveController]   Active provisioning entries: ${activeEntries.length}`);
        activeEntries.forEach((entry, idx) => {
          console.error(`[ZWaveController]     Entry ${idx + 1}: DSK=${entry.dsk}, Protocol=${entry.protocol}`);
        });
      } catch (err) {
        console.error(`[ZWaveController]   Could not get provisioning entries: ${err.message}`);
      }
      
      this.emit("inclusion failed");
      // Note: zwave-js automatically re-enables Smart Start listening mode after failures
      // We just log the status for visibility
      this._logSmartStartStatus();
    });

    this.controller.on("inclusion stopped", () => {
      console.log(`[ZWaveController] Inclusion stopped`);
      this.emit("inclusion stopped");
      // Note: zwave-js automatically re-enables Smart Start listening mode after stopping
      // We just log the status for visibility
      this._logSmartStartStatus();
    });

    this.controller.on("exclusion started", () => {
      console.log(`[ZWaveController] Exclusion started`);
      this.emit("exclusion started");
    });

    this.controller.on("exclusion failed", () => {
      console.error(`[ZWaveController] ❌ Exclusion failed`);
      this.emit("exclusion failed");
    });

    this.controller.on("exclusion stopped", () => {
      console.log(`[ZWaveController] Exclusion stopped`);
      this.emit("exclusion stopped");
    });

    this.controller.on("inclusion state changed", async (state) => {
      // Get state name for better logging
      let stateName = `State ${state}`;
      try {
        const InclusionState = await import(
          "../../../packages/zwave-js/src/lib/controller/Inclusion.js"
        ).then((m) => m.InclusionState).catch(() => null);
        if (InclusionState) {
          stateName = InclusionState[state] ?? stateName;
        }
      } catch (error) {
        // Ignore import errors
      }
      
      const timestamp = new Date().toISOString();
      console.log(
        `[ZWaveController] Inclusion state changed: ${stateName} (${state}) [${timestamp}]`
      );
      
      // Log additional context based on state
      if (state === 0) { // Idle
        console.log(`[ZWaveController]   State is now Idle - Smart Start listening mode may be re-enabled`);
      } else if (state === 1) { // Including
        console.log(`[ZWaveController]   Inclusion process is active`);
      } else if (state === 4) { // SmartStart
        console.log(`[ZWaveController]   Smart Start listening mode is active`);
      }
      
      this.emit("inclusion state changed", state);
      
      // Log Smart Start status when state changes to help debug issues
      if (state === 0 || state === 4) { // Idle = 0, SmartStart = 4
        this._logSmartStartStatus();
      }
    });

    this.controller.on("node found", (foundNode) => {
      console.log(
        `[ZWaveController] Node found: ID=${foundNode.id}, DeviceClass=${foundNode.deviceClass?.basic?.label || "Unknown"}`
      );
      console.log(
        `[ZWaveController]   Supported CCs: ${foundNode.supportedCCs?.length || 0}, Controlled CCs: ${foundNode.controlledCCs?.length || 0}`
      );
      this.emit("node found", foundNode);
    });

    // Node added/removed event handlers
    this.controller.on("node added", (node, result) => {
      console.log(
        `[ZWaveController] Node ${node.id} added: ${node.deviceConfig?.label || "Unknown"}`
      );
      if (result) {
        console.log(
          `[ZWaveController]   Inclusion result: ${JSON.stringify(result)}`
        );
      }
      this.addNodeToMap(node);
      this.emit("node added", node, result);
    });

    this.controller.on("node removed", (node, reason) => {
      console.log(
        `[ZWaveController] Node ${node.id} removed from network${reason ? ` (reason: ${reason})` : ""}`
      );
      this.nodes.delete(node.id);
      this.emit("node removed", node, reason);
    });

    // Populate existing nodes (nodes that were already in the network when driver started)
    // The "node added" event won't fire for these, so we need to add them manually
    for (const node of this.controller.nodes.values()) {
      if (!this.nodes.has(node.id)) {
        console.log(
          `[ZWaveController] Adding existing node ${node.id}: ${
            node.deviceConfig?.label || "Unknown"
          }`
        );
        this.addNodeToMap(node);
      }
    }
  }

  /**
   * Set up node event handlers
   */
  _setupNodeHandlers() {
    if (!this.controller) return;

    for (const node of this.controller.nodes.values()) {
      this._attachNodeHandlers(node);
    }
  }

  /**
   * Attach event handlers to a specific node
   */
  _attachNodeHandlers(node) {
    node.on("ready", () => {
      console.log(`Node ${node.id} is ready`);
      // Get or create ZWaveLock instance for this node
      const lock = this.getLock(node.id);
      if (lock) {
        // Re-initialize if needed (in case node was reset)
        lock.initialize();
      }
      this.emit("node ready", node);
    });

    node.on("value added", (args) => {
      this.emit("node value added", { nodeId: node.id, ...args });
    });

    node.on("value updated", (args) => {
      this.emit("node value updated", { nodeId: node.id, ...args });
    });

    node.on("value removed", (args) => {
      this.emit("node value removed", { nodeId: node.id, ...args });
    });

    node.on("notification", (notificationLabel, parameters) => {
      this.emit("node notification", {
        nodeId: node.id,
        notificationLabel,
        parameters,
      });
    });
  }

  // @remind - Man. Proprietary CC
  // Note: Manufacturer Proprietary functionality is now handled by ZWaveLock instances.
  // The methods below are kept for backward compatibility but delegate to ZWaveLock.

  /**
   * Force Manufacturer Proprietary (0x91) support on a node even if it is not
   * reported in the NIF. This ensures zwave-js exposes the CC wrapper.
   * @deprecated Use ZWaveLock instances instead. This method delegates to the node's ZWaveLock.
   * @param {import("../../../packages/zwave-js/src/Node.js").ZWaveNode} node
   */
  forceManufacturerProprietarySupport(node) {
    const lock = this.getLock(node.id);
    if (lock) {
      lock.forceManufacturerProprietarySupport();
    }
  }

  /**
   * Configure ManufacturerProprietaryCC to accept unencrypted commands
   * This allows commands to be received without encryption even if the node
   * was included with security.
   * @deprecated Use ZWaveLock instances instead. This method delegates to the node's ZWaveLock.
   * @param {import("../../../packages/zwave-js/src/Node.js").ZWaveNode} node
   */
  configureManufacturerProprietarySecurity(node) {
    const lock = this.getLock(node.id);
    if (lock) {
      lock.configureManufacturerProprietarySecurity();
    }
  }

  /**
   * Sets up a handler to intercept ManufacturerProprietaryCC commands from a node.
   * This intercepts commands before they reach the node's handleCommand method.
   * @deprecated Use ZWaveLock instances instead. This method delegates to the node's ZWaveLock.
   * @param {import("../../../packages/zwave-js/src/Node.js").ZWaveNode} node
   */
  setupManufacturerProprietaryCommandHandler(node) {
    const lock = this.getLock(node.id);
    if (lock) {
      lock.setupManufacturerProprietaryCommandHandler();
    }
  }

  // @remind - End of Man. Proprietary CC

  /**
   * Add node to the nodes map by creating a ZWaveLock instance
   * @param {import("../../../packages/zwave-js/src/Node.js").ZWaveNode} node
   */
  addNodeToMap(node) {
    // Check if ZWaveLock already exists for this node
    if (this.nodes.has(node.id)) {
      console.log(
        `[ZWaveController] ZWaveLock already exists for node ${node.id}, skipping creation`
      );
      return;
    }

    // Create ZWaveLock instance for this node
    const lock = new ZWaveLock(node, {
      deviceConfigDir: this.options.deviceConfigPriorityDir,
      onSupervisionUpdate: (update) => {
        // Forward supervision updates to controller events
        this.emit("supervisionUpdate", {
          nodeId: node.id,
          update,
        });
      },
    });

    // Forward events from ZWaveLock to ZWaveController
    lock.on("manufacturerProprietaryCommand", (commandData) => {
      this.emit("manufacturerProprietaryCommand", commandData);
    });

    lock.on("commandClassCommand", (data) => {
      this.emit("commandClassCommand", data);
    });

    // Store ZWaveLock instance in the nodes map
    this.nodes.set(node.id, lock);
    console.log(
      `[ZWaveController] Created ZWaveLock instance for node ${node.id}`
    );
  }

  /**
   * Convert DSK to string format
   * @param {string|Buffer|Uint8Array} dsk - The DSK to convert
   * @returns {string} DSK as formatted string (standard Z-Wave format: groups of 5 hex characters)
   */
  dskToString(dsk) {
    if (typeof dsk === "string") return dsk;
    if (Buffer.isBuffer(dsk)) {
      return dsk.toString("hex").match(/.{1,5}/g).join("-");
    }
    if (dsk instanceof Uint8Array) {
      return Buffer.from(dsk).toString("hex").match(/.{1,5}/g).join("-");
    }
    return dsk;
  }

  /**
   * Get a ZWaveLock instance by node ID
   * @param {number} nodeId - The node ID
   * @returns {ZWaveLock|null} The ZWaveLock instance or null if not found
   */
  getLock(nodeId) {
    return this.nodes.get(nodeId) || null;
  }

  /**
   * Get a node by ID (returns ZWaveLock instance)
   * @deprecated Use getLock() instead for clarity
   * @param {number} nodeId - The node ID
   * @returns {ZWaveLock|null} The ZWaveLock instance or null if not found
   */
  getNode(nodeId) {
    return this.getLock(nodeId);
  }

  /**
   * Get the actual Z-Wave node object by ID
   * @param {number} nodeId - The node ID
   * @returns {import("../../../packages/zwave-js/src/Node.js").ZWaveNode|null} The Z-Wave node or null if not found
   */
  getZWaveNode(nodeId) {
    const lock = this.getLock(nodeId);
    return lock ? lock.getNode() : null;
  }

  /**
   * Get all ZWaveLock instances
   * @returns {ZWaveLock[]} Array of all ZWaveLock instances
   */
  getAllNodes() {
    return Array.from(this.nodes.values());
  }

  /**
   * Get all ZWaveLock instances
   * @returns {ZWaveLock[]} Array of all ZWaveLock instances
   */
  getAllLocks() {
    return Array.from(this.nodes.values());
  }

  /**
   * Check if driver is ready
   */
  isReady() {
    return this.driverReady && this.driver !== null;
  }

  /**
   * Get the controller instance
   */
  getController() {
    return this.controller;
  }

  /**
   * Get the driver instance
   */
  getDriver() {
    return this.driver;
  }

  /**
   * Check Smart Start status and log information
   * Note: zwave-js automatically enables Smart Start listening mode when provisioning entries are added
   * This method just provides visibility into the current state
   * @private
   */
  async _enableSmartStartIfNeeded() {
    // Just log status - zwave-js handles Smart Start automatically
    await this._logSmartStartStatus();
  }

  /**
   * Log Smart Start status for debugging
   * @private
   */
  async _logSmartStartStatus() {
    if (!this.controller) {
      return;
    }

    try {
      // Check if Smart Start is supported
      const ZWaveFeature = await import(
        "../../../packages/zwave-js/src/lib/controller/Features.js"
      ).then((m) => m.ZWaveFeature).catch(() => null);

      if (!ZWaveFeature) {
        return;
      }

      const supportsSmartStart = this.controller.supportsFeature(
        ZWaveFeature.SmartStart
      );

      if (!supportsSmartStart) {
        console.log(
          `[ZWaveController] Smart Start is not supported by this controller`
        );
        return;
      }

      const timestamp = new Date().toISOString();
      const currentState = this.controller.inclusionState;
      const InclusionState = await import(
        "../../../packages/zwave-js/src/lib/controller/Inclusion.js"
      ).then((m) => m.InclusionState).catch(() => null);
      const stateName = InclusionState?.[currentState] ?? `State ${currentState}`;

      // Check provisioning entries
      const provisioningEntries = this.controller.getProvisioningEntries();
      const ProvisioningEntryStatus = await import(
        "../../../packages/zwave-js/src/Controller.js"
      ).then((m) => m.ProvisioningEntryStatus).catch(() => null);

      const activeEntries = provisioningEntries.filter(
        (entry) =>
          entry.status ===
          (ProvisioningEntryStatus?.Active ?? 0) // ProvisioningEntryStatus.Active
      );
      const inactiveEntries = provisioningEntries.filter(
        (entry) =>
          entry.status ===
          (ProvisioningEntryStatus?.Inactive ?? 1) // ProvisioningEntryStatus.Inactive
      );

      console.log(
        `[ZWaveController] Smart Start Status [${timestamp}]:`
      );
      console.log(
        `[ZWaveController]   Inclusion State: ${stateName} (${currentState})`
      );
      console.log(
        `[ZWaveController]   Provisioning Entries: ${provisioningEntries.length} total (${activeEntries.length} active, ${inactiveEntries.length} inactive)`
      );
      
      if (activeEntries.length > 0) {
        console.log(`[ZWaveController]   Active entries:`);
        activeEntries.forEach((entry, idx) => {
          console.log(
            `[ZWaveController]     ${idx + 1}. DSK=${entry.dsk}, Protocol=${entry.protocol || 'ZWave'}, SecurityClasses=${JSON.stringify(entry.securityClasses)}`
          );
        });
      }
      
      if (inactiveEntries.length > 0) {
        console.log(`[ZWaveController]   Inactive entries:`);
        inactiveEntries.forEach((entry, idx) => {
          console.log(
            `[ZWaveController]     ${idx + 1}. DSK=${entry.dsk}, Protocol=${entry.protocol || 'ZWave'} (disabled)`
          );
        });
      }

      // Log warning if controller is busy when it should be in Smart Start mode
      if (
        activeEntries.length > 0 &&
        currentState === InclusionState?.Busy
      ) {
        console.warn(
          `[ZWaveController] ⚠️  Controller is busy (state: ${stateName}) but has ${activeEntries.length} active provisioning entries. Smart Start requests may be rejected until controller returns to idle.`
        );
      }

      // Log info if we have active entries but Smart Start is not active
      if (
        activeEntries.length > 0 &&
        currentState !== InclusionState?.SmartStart &&
        currentState === InclusionState?.Idle
      ) {
        console.log(
          `[ZWaveController] ℹ️  Smart Start listening mode should be automatically enabled by zwave-js when provisioning entries are active`
        );
      }
    } catch (error) {
      console.error(
        `[ZWaveController] Error checking Smart Start status:`,
        error.message
      );
    }
  }

  /**
   * Set up WebSocket broadcast handlers for Z-Wave events
   * @param {Function} broadcast - Function to broadcast messages to WebSocket clients
   */
  setupWebSocketBroadcast(broadcast) {
    if (!broadcast || typeof broadcast !== "function") {
      throw new Error("broadcast function is required");
    }

    this.on("driver ready", () => {
      broadcast({
        type: "DRIVER_READY",
        timestamp: new Date().toISOString(),
      });
    });

    this.on("node added", (node) => {
      broadcast({
        type: "NODE_ADDED",
        nodeId: node.id,
        timestamp: new Date().toISOString(),
      });
    });

    this.on("node removed", (node) => {
      broadcast({
        type: "NODE_REMOVED",
        nodeId: node.id,
        timestamp: new Date().toISOString(),
      });
    });

    this.on("node ready", (node) => {
      broadcast({
        type: "NODE_READY",
        nodeId: node.id,
        timestamp: new Date().toISOString(),
      });
    });

    this.on("node value updated", (args) => {
      broadcast({
        type: "NODE_VALUE_UPDATED",
        nodeId: args.nodeId,
        commandClass: args.commandClass,
        property: args.property,
        newValue: args.newValue,
        timestamp: new Date().toISOString(),
      });
    });

    this.on("node notification", (data) => {
      broadcast({
        type: "NODE_NOTIFICATION",
        nodeId: data.nodeId,
        notificationLabel: data.notificationLabel,
        parameters: data.parameters,
        timestamp: new Date().toISOString(),
      });
    });

    this.on("inclusion started", (strategy) => {
      broadcast({
        type: "INCLUSION_STARTED",
        strategy,
        timestamp: new Date().toISOString(),
      });
    });

    this.on("inclusion failed", () => {
      broadcast({
        type: "INCLUSION_FAILED",
        timestamp: new Date().toISOString(),
      });
    });

    this.on("inclusion stopped", () => {
      broadcast({
        type: "INCLUSION_STOPPED",
        timestamp: new Date().toISOString(),
      });
    });

    this.on("exclusion started", () => {
      broadcast({
        type: "EXCLUSION_STARTED",
        timestamp: new Date().toISOString(),
      });
    });

    this.on("exclusion failed", () => {
      broadcast({
        type: "EXCLUSION_FAILED",
        timestamp: new Date().toISOString(),
      });
    });

    this.on("exclusion stopped", () => {
      broadcast({
        type: "EXCLUSION_STOPPED",
        timestamp: new Date().toISOString(),
      });
    });

    this.on("inclusion state changed", (state) => {
      broadcast({
        type: "INCLUSION_STATE_CHANGED",
        state,
        timestamp: new Date().toISOString(),
      });
    });

    this.on("node found", (foundNode) => {
      broadcast({
        type: "NODE_FOUND",
        nodeId: foundNode.id,
        deviceClass: foundNode.deviceClass,
        supportedCCs: foundNode.supportedCCs,
        controlledCCs: foundNode.controlledCCs,
        timestamp: new Date().toISOString(),
      });
    });

    this.on("manufacturerProprietaryCommand", (commandData) => {
      broadcast({
        type: "MANUFACTURER_PROPRIETARY_COMMAND",
        nodeId: commandData.nodeId,
        manufacturerId: commandData.manufacturerId,
        payload: commandData.payload,
        payloadLength: commandData.payloadLength,
        endpointIndex: commandData.endpointIndex,
        timestamp: new Date().toISOString(),
      });
    });

    this.on("supervisionUpdate", (data) => {
      broadcast({
        type: "SUPERVISION_UPDATE",
        nodeId: data.nodeId,
        update: data.update,
        timestamp: new Date().toISOString(),
      });
    });

    this.on("commandClassCommand", (data) => {
      broadcast({
        type: "COMMAND_CLASS_COMMAND",
        nodeId: data.nodeId,
        commandClass: data.commandClass,
        commandClassId: data.commandClassId,
        data: data.data,
        timestamp: new Date().toISOString(),
      });
    });

    this.on("error", (error) => {
      broadcast({
        type: "ERROR",
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    });
  }

  /**
   * Static method to get the singleton instance
   */
  static getInstance(port, options) {
    if (!ZWaveController.instance) {
      ZWaveController.instance = new ZWaveController(port, options);
    }
    return ZWaveController.instance;
  }
}

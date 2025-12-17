import { EventEmitter } from "events";
import { NodeStatus } from "../../../packages/core/src/definitions/index.js";
import { ManufacturerProprietaryCC } from "../../../packages/cc/src/cc/ManufacturerProprietaryCC.js";
import {
  generateRandom32BytePayload,
  hexTo32ByteBuffer,
  getManufacturerProprietaryAPI,
} from "../manufacturer-proprietary.js";
import { createDeviceConfigForNode } from "../device-config.js";

export class ZWaveLock extends EventEmitter {
  /**
   * Creates a new ZWaveLock instance for a Z-Wave node
   * @param {import("../../../packages/zwave-js/src/Node.js").ZWaveNode} node - The Z-Wave node
   * @param {Object} options - Configuration options
   * @param {string} options.deviceConfigDir - Directory for device config files (default: "./store/device-configs")
   * @param {Function} options.onSupervisionUpdate - Callback for supervision updates
   */
  constructor(node, options = {}) {
    super();

    if (!node) {
      throw new Error("ZWaveLock requires a valid Z-Wave node");
    }

    this.node = node;
    this.nodeId = node.id;
    this.deviceConfigDir = options.deviceConfigDir || "./store/device-configs";
    this.onSupervisionUpdate = options.onSupervisionUpdate;
    this._setupComplete = false;
    this._mpAPI = null;
    this.initialize();
  }

  /**
   * Initialize Manufacturer Proprietary support for this node
   * This sets up all the necessary handlers and configurations
   */
  initialize() {
    if (this._setupComplete) {
      console.log(
        `[ZWaveLock ${this.nodeId}] Setup already complete, skipping initialization`
      );
      return;
    }

    console.log(
      `[ZWaveLock ${this.nodeId}] Initializing Manufacturer Proprietary support...`
    );
    this.forceManufacturerProprietarySupport();
    this.configureManufacturerProprietarySecurity();
    this.setupManufacturerProprietaryCommandHandler();
    if (this.node.ready) {
      this._initializeMPAPI();
    } else {
      this.node.once("ready", () => {
        this._initializeMPAPI();
      });
    }

    this._setupComplete = true;
    console.log(
      `[ZWaveLock ${this.nodeId}] ✅ Manufacturer Proprietary support initialized`
    );
  }

  /**
   * Force Manufacturer Proprietary (0x91) support on this node even if it is not
   * reported in the NIF. This ensures zwave-js exposes the CC wrapper.
   */
  forceManufacturerProprietarySupport() {
    if (!this.node || typeof this.node.addCC !== "function") {
      console.warn(
        `[ZWaveLock ${this.nodeId}] Cannot force MP support: node or addCC missing`
      );
      return;
    }

    try {
      const ccId = 0x
      const alreadySupported =
        this.node.supportedCCs?.has?.(ccId) ||
        this.node.implementedCommandClasses?.has?.(ccId);

      if (!alreadySupported) {
        this.node.addCC(ccId, { isSupported: true, isControlled: true });
        console.log(
          `[ZWaveLock ${this.nodeId}] ⚙️  Forced Manufacturer Proprietary support`
        );
      } else {
        console.log(
          `[ZWaveLock ${this.nodeId}] ✅ Manufacturer Proprietary already supported`
        );
      }
    } catch (error) {
      console.warn(
        `[ZWaveLock ${this.nodeId}] Failed to force Manufacturer Proprietary support:`,
        error.message
      );
    }
  }

  /**
   * Configure ManufacturerProprietaryCC to accept unencrypted commands
   * This allows commands to be received without encryption even if the node
   * was included with security.
   */
  configureManufacturerProprietarySecurity() {
    if (!this.node) return;

    try {
      const ccId = 0x

      if (
        this.node.status === NodeStatus.Dead ||
        this.node.status === NodeStatus.Unknown
      ) {

        this.node.once("ready", () => {
          this._setManufacturerProprietarySecurityClass(ccId);
        });
      } else {

        this._setManufacturerProprietarySecurityClass(ccId);
      }
    } catch (error) {
      console.warn(
        `[ZWaveLock ${this.nodeId}] Failed to configure Manufacturer Proprietary security:`,
        error.message
      );
    }
  }

  /**
   * Internal method to set security class for ManufacturerProprietaryCC
   * @private
   */
  _setManufacturerProprietarySecurityClass(ccId) {
    try {
      const NO_SECURITY = undefin

      if (typeof this.node.setCCSecurityClass === "function") {
        try {
          this.node.setCCSecurityClass(ccId, NO_SECURITY);
          console.log(
            `[ZWaveLock ${this.nodeId}] 🔓 Set Manufacturer Proprietary CC (0x91) security class to None (unencrypted)`
          );
          return;
        } catch (error) {
  
          try {
            this.node.setCCSecurityClass(ccId, null);
            console.log(
              `[ZWaveLock ${this.nodeId}] 🔓 Set Manufacturer Proprietary CC (0x91) security class to None (unencrypted)`
            );
            return;
          } catch (err2) {
    
          }
        }
      }

      if (this.node.commandClasses && this.node.commandClasses[0x91]) {
        const cc = this.node.commandClasses[0x91];
        if (cc && typeof cc.setSecurityClass === "function") {
          try {
            cc.setSecurityClass(NO_SECURITY);
            console.log(
              `[ZWaveLock ${this.nodeId}] 🔓 Set Manufacturer Proprietary CC (0x91) security class to None via CC API`
            );
            return;
          } catch (error) {
            try {
              cc.setSecurityClass(null);
              console.log(
                `[ZWaveLock ${this.nodeId}] 🔓 Set Manufacturer Proprietary CC (0x91) security class to None via CC API`
              );
              return;
            } catch (err2) {
      
            }
          }
        }
      }

      if (
        this.node.getCCVersion &&
        this.node.getCCVersion(ccId) !== undefined
      ) {
        try {
          const endpoint = this.node.getEndpoint(0);
          if (endpoint && typeof endpoint.getCC === "function") {
            const ccInstance = endpoint.getCC(ccId);
            if (
              ccInstance &&
              typeof ccInstance.setSecurityClass === "function"
            ) {
              try {
                ccInstance.setSecurityClass(NO_SECURITY);
                console.log(
                  `[ZWaveLock ${this.nodeId}] 🔓 Set Manufacturer Proprietary CC (0x91) security class to None via CC instance`
                );
                return;
              } catch (error) {
                try {
                  ccInstance.setSecurityClass(null);
                  console.log(
                    `[ZWaveLock ${this.nodeId}] 🔓 Set Manufacturer Proprietary CC (0x91) security class to None via CC instance`
                  );
                  return;
                } catch (err2) {
          
                }
              }
            }
          }
        } catch (error) {
  
  
        }
      }

    } catch (error) {
      console.warn(
        `[ZWaveLock ${this.nodeId}] ⚠️  Error setting security class for Manufacturer Proprietary CC:`,
        error.message
      );
    }
  }

  /**
   * Sets up a handler to intercept ManufacturerProprietaryCC commands from this node.
   * This intercepts commands before they reach the node's handleCommand method.
   */
  setupManufacturerProprietaryCommandHandler() {
    if (!this.node || typeof this.node.handleCommand !== "function") {
      console.warn(
        `[ZWaveLock ${this.nodeId}] Cannot setup handler: node or handleCommand missing`
      );
      return;
    }
    if (this.node._mpHandlerAttached) {
      console.log(
        `[ZWaveLock ${this.nodeId}] Handler already attached, skipping`
      );
      return;
    }
    const originalHandleCommand = this.node.handleCommand.bind(this.node);

    this.node.handleCommand = async (command) => {
      if (command.ccId === 0x91) {
        console.log(
          `[ZWaveLock ${this.nodeId}] 🔍 Command received, CC ID: 0x${command.ccId.toString(16)}, type: ${command.constructor?.name}`
        );
      }

      const isManufacturerProprietary =
        command.ccId === 0x91 ||
        command instanceof ManufacturerProprietaryCC ||
        command.constructor?.name === "ManufacturerProprietaryCC";

      if (isManufacturerProprietary) {
        const commandData = {
          nodeId: this.nodeId,
          manufacturerId: command.manufacturerId,
          payload: command.payload
            ? Array.from(Buffer.from(command.payload))
            : null,
          payloadLength: command.payload?.length || 0,
          endpointIndex: command.endpointIndex || 0,
        };

        console.log(
          `[ZWaveLock ${this.nodeId}] ✅ Received ManufacturerProprietaryCC command:`,
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
        





        return;
      }

      return originalHandleCommand(command);
    };
    this.node._mpHandlerAttached = true;
    console.log(
      `[ZWaveLock ${this.nodeId}] ✅ Handler attached (CC 0x91 will be intercepted)`
    );
  }

  /**
   * Initialize the Manufacturer Proprietary API with supervision support
   * @private
   */
  _initializeMPAPI() {
    if (this._mpAPI) {
      return this._mpAPI;
    }

    this._mpAPI = getManufacturerProprietaryAPI(
      this.node,
      this.nodeId,
      this.onSupervisionUpdate
    );

    return this._mpAPI;
  }

  /**
   * Get the Manufacturer Proprietary CC API
   * @returns {Object|null} The MP CC API or null if not available
   */
  getManufacturerProprietaryAPI() {
    if (!this.node.ready) {
      console.warn(
        `[ZWaveLock ${this.nodeId}] Node not ready, cannot get MP API`
      );
      return null;
    }
    this.forceManufacturerProprietarySupport();
    if (!this._mpAPI) {
      this._initializeMPAPI();
    }
    if (!this._mpAPI) {
      const base = this.node.commandClasses["Manufacturer Proprietary"];
      if (base) {
        return base;
      }
    }

    return this._mpAPI;
  }

  /**
   * Sends a Manufacturer Proprietary (CC 0x91) command with a random 32-byte payload.
   * This is useful for testing.
   *
   * @param {Object} options - Send options
   * @param {number} options.manufacturerId - The 2-byte manufacturer ID (default: 0x0000 for Silicon Labs)
   * @param {number} options.count - Number of frames to send (default: 5)
   * @returns {Promise<Object>} Result object with details
   */
  async sendRandom({
    manufacturerId = 0x0000,
    count = 5,
  } = {}) {
    console.log(
      `[ZWaveLock ${this.nodeId}] Sending ${count} random Manufacturer Proprietary frame(s)...`
    );
    if (!this.node.ready) {
      throw new Error(`Node ${this.nodeId} is not ready yet`);
    }
    this.forceManufacturerProprietarySupport();
    const ccMP = this.getManufacturerProprietaryAPI();
    if (!ccMP) {
      throw new Error(
        `Node ${this.nodeId} does not expose Manufacturer Proprietary CC (0x91)`
      );
    }

    const results = [];
    for (let i = 0; i < count; i++) {
      console.log(
        `[ZWaveLock ${this.nodeId}] Sending frame #${i + 1} of ${count}...`
      );

      const vendorPayload = generateRandom32BytePayload();

      const startTime = Date.now();
      try {
        const result = await ccMP.sendData(manufacturerId, vendorPayload);
        const duration = Date.now() - startTime;

        console.log(
          `[ZWaveLock ${this.nodeId}] ✅ Frame #${i + 1} sent in ${duration}ms`
        );

        results.push({
          frameNumber: i + 1,
          payloadHex: vendorPayload.toString("hex"),
          result,
          duration,
        });
      } catch (error) {
        const duration = Date.now() - startTime;
        console.error(
          `[ZWaveLock ${this.nodeId}] ❌ Frame #${i + 1} failed after ${duration}ms:`,
          error.message
        );
        throw error;
      }
    }

    return {
      nodeId: this.nodeId,
      manufacturerId,
      count,
      results,
    };
  }

  /**
   * Sends a Manufacturer Proprietary (CC 0x91) command with a custom 32-byte payload.
   *
   * @param {Object} options - Send options
   * @param {Buffer|string} options.payload - The 32-byte vendor payload (Buffer or hex string)
   * @param {number} options.manufacturerId - The 2-byte manufacturer ID (default: 0x0000 for Silicon Labs)
   * @param {number} options.count - Number of frames to send (default: 1, max: 100)
   * @returns {Promise<Object>} Result object with details
   */
  async sendCustom({
    payload,
    manufacturerId = 0x0000,
    count = 1,
  }) {
    if (!payload) {
      throw new Error("payload is required");
    }

    console.log(
      `[ZWaveLock ${this.nodeId}] Sending ${count} custom Manufacturer Proprietary frame(s)...`
    );
    if (!this.node.ready) {
      throw new Error(`Node ${this.nodeId} is not ready yet`);
    }
    let vendorPayload;
    if (Buffer.isBuffer(payload)) {
      vendorPayload = payload;
    } else if (typeof payload === "string") {
      vendorPayload = hexTo32ByteBuffer(payload);
    } else {
      throw new Error("payload must be a Buffer or hex string");
    }
    if (vendorPayload.length !== 32) {
      throw new Error(
        `vendorPayload must be exactly 32 bytes, got ${vendorPayload.length}`
      );
    }
    if (count <= 0) {
      count = 1;
    }
    if (count > 100) {
      count = 100;
    }
    this.forceManufacturerProprietarySupport();
    const ccMP = this.getManufacturerProprietaryAPI();
    if (!ccMP) {
      throw new Error(
        `Node ${this.nodeId} does not expose Manufacturer Proprietary CC (0x91)`
      );
    }

    const payloadHex = vendorPayload.toString("hex");
    const results = [];

    for (let i = 0; i < count; i++) {
      console.log(
        `[ZWaveLock ${this.nodeId}] Sending frame #${i + 1} of ${count}...`
      );

      const startTime = Date.now();
      try {
        const result = await ccMP.sendData(manufacturerId, vendorPayload);
        const duration = Date.now() - startTime;

        console.log(
          `[ZWaveLock ${this.nodeId}] ✅ Frame #${i + 1} sent in ${duration}ms`
        );

        results.push({
          frameNumber: i + 1,
          result,
          duration,
        });
      } catch (error) {
        const duration = Date.now() - startTime;
        console.error(
          `[ZWaveLock ${this.nodeId}] ❌ Frame #${i + 1} failed after ${duration}ms:`,
          error.message
        );
        throw error;
      }
    }

    return {
      nodeId: this.nodeId,
      count,
      vendorPayloadHex: payloadHex,
      manufacturerId,
      results,
    };
  }

  /**
   * Creates a device config file for this node that forces Manufacturer Proprietary (0x91) support.
   *
   * @param {Object} options - Options for device config creation
   * @param {string} options.configDir - Override the default config directory
   * @param {string} options.manufacturerName - Override the manufacturer name
   * @returns {Promise<string>} The path to the created config file
   */
  async createDeviceConfig(options = {}) {
    const configDir = options.configDir || this.deviceConfigDir;
    const manufacturerName =
      options.manufacturerName ||
      this.node.deviceConfig?.manufacturer ||
      "Unknown Manufacturer";
    const manufacturerId =
      this.node.manufacturerId ?? this.node.deviceConfig?.manufacturerId;
    const productType =
      this.node.productType ?? this.node.deviceConfig?.productType;
    const productId =
      this.node.productId ?? this.node.deviceConfig?.productId;

    if (!manufacturerId || !productType || !productId) {
      throw new Error(
        `Node ${this.nodeId} missing required information: manufacturerId, productType, or productId`
      );
    }
    const manufacturerIdNum =
      typeof manufacturerId === "string"
        ? parseInt(manufacturerId, 16)
        : manufacturerId;
    const productTypeNum =
      typeof productType === "string" ? parseInt(productType, 16) : productType;
    const productIdNum =
      typeof productId === "string" ? parseInt(productId, 16) : productId;

    return await createDeviceConfigForNode(
      configDir,
      this.nodeId,
      manufacturerIdNum,
      productTypeNum,
      productIdNum,
      manufacturerName
    );
  }

  /**
   * Get node information
   * @returns {Object} Node information object
   */
  getInfo() {
    return {
      id: this.nodeId,
      name: this.node.name || `Node ${this.nodeId}`,
      location: this.node.location || "",
      status: NodeStatus[this.node.status] || "Unknown",
      ready: this.node.ready,
      deviceConfig: this.node.deviceConfig,
      protocol: this.node.protocol,
      manufacturerId: this.node.manufacturerId,
      productType: this.node.productType,
      productId: this.node.productId,
      dsk: this.node.dsk ? this.dskToString(this.node.dsk) : null,
      hasManufacturerProprietary:
        !!this.node.commandClasses["Manufacturer Proprietary"],
    };
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
   * Get the underlying Z-Wave node object
   * @returns {import("../../../packages/zwave-js/src/Node.js").ZWaveNode} The Z-Wave node
   */
  getNode() {
    return this.node;
  }
}

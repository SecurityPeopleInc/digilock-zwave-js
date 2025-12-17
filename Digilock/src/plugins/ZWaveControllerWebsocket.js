import { Plugin } from "../models/Plugin.js";
import { WebSocketServer } from "ws";
import { ZWaveProvisioningClient } from "../zwave-client.js";

/**
 * WebSocket Server Plugin for ZWaveController
 * Manages WebSocket server, client connections, and message routing
 */
export class ZWaveControllerWebsocket extends Plugin {
  constructor() {
    super(
      "WebSocket Server",
      "Manages WebSocket server, client connections, and message routing"
    );
    this.wss = null;
    this.clients = new Set();
    this.zwaveClient = null;
    this.currentPort = null;
    this.initializeDriver = null;
    this.securityKeys = null;
    this.securityKeysLongRange = null;
    this.eventHandlersSetup = false;
  }

  /**
   * Apply the WebSocket server plugin to a ZWaveController instance
   * @param {Object} target - The ZWaveController instance
   * @param {Object} options - Plugin options
   * @param {Object} options.server - HTTP server instance to attach WebSocket server to
   * @param {Object} options.zwaveClient - ZWaveProvisioningClient instance (optional, can be null initially)
   * @param {string} options.currentPort - Current Z-Wave port
   * @param {Function} options.initializeDriver - Function to initialize the driver (optional)
   * @param {Object} options.securityKeys - Security keys for Z-Wave (optional)
   * @param {Object} options.securityKeysLongRange - Security keys for Z-Wave Long Range (optional)
   */
  apply(target, options = {}) {
    if (!options.server) {
      throw new Error("HTTP server is required for WebSocket plugin");
    }

    this.zwaveClient = options.zwaveClient || null;
    this.currentPort = options.currentPort || null;
    this.initializeDriver = options.initializeDriver || null;
    this.securityKeys = options.securityKeys || null;
    this.securityKeysLongRange = options.securityKeysLongRange || null;

    this.wss = new WebSocketServer({ server: options.server });

    this.setupZWaveEventHandlers();

    this.setupWebSocketConnectionHandler();

    return {
      close: () => this.close(),
      setZWaveClient: (client, port) => this.setZWaveClient(client, port),
    };
  }

  /**
   * Set or update the Z-Wave client after initialization
   * @param {Object} client - ZWaveProvisioningClient instance
   * @param {string} port - Current Z-Wave port
   */
  setZWaveClient(client, port) {
    this.zwaveClient = client;
    this.currentPort = port;
    this.eventHandlersSetup = false;
    if (client) {
      this.setupZWaveEventHandlers();
    }
  }

  /**
   * Broadcast message to all connected clients
   */
  broadcast(message) {
    const data = JSON.stringify(message);
    this.clients.forEach((client) => {
      if (client.readyState === 1) {
        client.send(data);
      }
    });
  }

  /**
   * Send message to a specific client
   */
  sendToClient(client, message) {
    if (client.readyState === 1) {
      client.send(JSON.stringify(message));
    }
  }

  /**
   * Helper to send response with requestId
   */
  sendResponse(client, requestId, message) {
    this.sendToClient(client, {
      ...message,
      requestId,
    });
  }

  /**
   * Set up Z-Wave event handlers and broadcast to clients
   */
  setupZWaveEventHandlers() {
    if (!this.zwaveClient) return;
    
    this.eventHandlersSetup = true;

    this.zwaveClient.on("ready", () => {
      this.broadcast({
        type: "DRIVER_READY",
        timestamp: new Date().toISOString(),
      });
    });

    this.zwaveClient.on("nodeAdded", (node) => {
      this.broadcast({
        type: "NODE_ADDED",
        nodeId: node.id,
        timestamp: new Date().toISOString(),
      });
    });

    this.zwaveClient.on("nodeRemoved", (nodeId) => {
      this.broadcast({
        type: "NODE_REMOVED",
        nodeId: nodeId,
        timestamp: new Date().toISOString(),
      });
    });

    this.zwaveClient.on("nodeStatusChanged", (node) => {
      this.broadcast({
        type: "NODE_STATUS_CHANGED",
        nodeId: node.id,
        status: node.status,
        timestamp: new Date().toISOString(),
      });
    });

    this.zwaveClient.on("error", (error) => {
      this.broadcast({
        type: "ERROR",
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    });

    this.zwaveClient.on("manufacturerProprietaryCommand", (commandData) => {
      this.broadcast({
        type: "MANUFACTURER_PROPRIETARY_COMMAND",
        data: commandData,
        timestamp: new Date().toISOString(),
      });
    });

    this.zwaveClient.on("commandClassCommand", (commandData) => {
      this.broadcast({
        type: "COMMAND_CLASS_COMMAND",
        data: commandData,
        timestamp: new Date().toISOString(),
      });
    });
  }

  /**
   * Set up WebSocket connection handler
   */
  setupWebSocketConnectionHandler() {
    this.wss.on("connection", (ws) => {
      console.log("New WebSocket client connected");
      this.clients.add(ws);

      this.sendToClient(ws, {
        type: "CONNECTED",
        message: "Connected to Z-Wave middleware",
        timestamp: new Date().toISOString(),
      }); 

      if (this.zwaveClient && this.zwaveClient.driverReady) {
        this.sendToClient(ws, {
          type: "DRIVER_READY",
          timestamp: new Date().toISOString(),
        });
      }

      ws.on("message", (message) => {
        this.handleMessage(ws, message);
      });

      ws.on("close", () => {
        console.log("WebSocket client disconnected");
        this.clients.delete(ws);
      });

      ws.on("error", (error) => {
        console.error("WebSocket error:", error);
        this.clients.delete(ws);
      });
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  async handleMessage(client, message) {
    try {
      const data = JSON.parse(message);

      if (!data.type) {
        this.sendToClient(client, {
          type: "ERROR",
          message: "Message must have a 'type' field",
          requestId: data.requestId,
        });
        return;
      }

      const requestId = data.requestId;

      switch (data.type) {
        case "GET_PROVISIONING_ENTRIES":
          await this.handleGetProvisioningEntries(client, requestId);
          break;

        case "GET_PROVISIONING_ENTRY":
          await this.handleGetProvisioningEntry(client, data, requestId);
          break;

        case "ADD_PROVISIONING_ENTRY":
          await this.handleAddProvisioningEntry(client, data, requestId);
          break;

        case "UPDATE_PROVISIONING_ENTRY_STATUS":
          await this.handleUpdateProvisioningEntryStatus(
            client,
            data,
            requestId
          );
          break;

        case "DELETE_PROVISIONING_ENTRY":
          await this.handleDeleteProvisioningEntry(client, data, requestId);
          break;

        case "GET_NODES":
          await this.handleGetNodes(client, requestId);
          break;

        case "GET_NODE":
          await this.handleGetNode(client, data, requestId);
          break;

        case "GET_STATUS":
          await this.handleGetStatus(client, requestId);
          break;

        case "START":
          await this.handleStart(client, data, requestId);
          break;

        case "SEND_COMMAND":
          await this.handleSendCommand(client, data, requestId);
          break;

        case "PING":
          this.sendResponse(client, requestId, {
            type: "PONG",
            timestamp: new Date().toISOString(),
          });
          break;

        default:
          this.sendResponse(client, requestId, {
            type: "ERROR",
            message: `Unknown message type: ${data.type}`,
          });
      }
    } catch (error) {
      console.error("Error handling message:", error);
      const requestId = JSON.parse(message).requestId;
      this.sendResponse(client, requestId, {
        type: "ERROR",
        message: error.message,
      });
    }
  }

  async handleGetProvisioningEntries(client, requestId) {
    try {
      if (!this.zwaveClient || !this.zwaveClient.driverReady) {
        this.sendResponse(client, requestId, {
          type: "ERROR",
          message: "Driver not ready",
        });
        return;
      }
      const entries = await this.zwaveClient.getProvisioningEntries();
      this.sendResponse(client, requestId, {
        type: "PROVISIONING_ENTRIES",
        data: entries,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.sendResponse(client, requestId, {
        type: "ERROR",
        message: error.message,
      });
    }
  }

  async handleGetProvisioningEntry(client, data, requestId) {
    try {
      if (!this.zwaveClient || !this.zwaveClient.driverReady) {
        this.sendResponse(client, requestId, {
          type: "ERROR",
          message: "Driver not ready",
        });
        return;
      }
      const entries = await this.zwaveClient.getProvisioningEntries();
      const entry = entries.find((e) => e.dsk === data.dsk);
      if (entry) {
        this.sendResponse(client, requestId, {
          type: "PROVISIONING_ENTRY",
          data: entry,
          timestamp: new Date().toISOString(),
        });
      } else {
        this.sendResponse(client, requestId, {
          type: "ERROR",
          message: "Entry not found",
        });
      }
    } catch (error) {
      this.sendResponse(client, requestId, {
        type: "ERROR",
        message: error.message,
      });
    }
  }

  async handleAddProvisioningEntry(client, data, requestId) {
    try {
      const entry = data.entry || data;

      if (!entry.dsk) {
        this.sendResponse(client, requestId, {
          type: "ERROR",
          message: "DSK is required",
        });
        return;
      }

      if (!this.zwaveClient || !this.zwaveClient.driverReady) {
        this.sendResponse(client, requestId, {
          type: "ERROR",
          message: "Driver not ready",
        });
        return;
      }

      const protocol = entry.protocol || "ZWave";
      const isLongRange =
        protocol === "ZWaveLongRange" || protocol === "Z-Wave Long Range";

      let securityClassesObj = {};
      if (
        entry.securityClasses &&
        typeof entry.securityClasses === "object" &&
        !Array.isArray(entry.securityClasses)
      ) {
        securityClassesObj = entry.securityClasses;
      } else {
        securityClassesObj = {
          s2AccessControl:
            entry.s2AccessControl === true || entry.s2AccessControl === "true",
          s2Authenticated:
            entry.s2Authenticated === true || entry.s2Authenticated === "true",
          s2Unauthenticated:
            entry.s2Unauthenticated === true ||
            entry.s2Unauthenticated === "true",
          s0Legacy: entry.s0Legacy === true || entry.s0Legacy === "true",
        };
      }

      const provisioningEntry = {
        dsk: entry.dsk,
        name: entry.name || "",
        location: entry.location || "",
        protocol: protocol,
        status: entry.status !== undefined ? entry.status : false,
        securityClasses: securityClassesObj,
        s2AccessControl:
          entry.s2AccessControl === true || entry.s2AccessControl === "true",
        s2Authenticated:
          entry.s2Authenticated === true || entry.s2Authenticated === "true",
        s2Unauthenticated:
          entry.s2Unauthenticated === true ||
          entry.s2Unauthenticated === "true",
        s0Legacy: entry.s0Legacy === true || entry.s0Legacy === "true",
        supportedProtocols: entry.supportedProtocols || [],
        manufacturerId: entry.manufacturerId,
        productType: entry.productType,
        productId: entry.productId,
        applicationVersion: entry.applicationVersion,
      };

      await this.zwaveClient.provisionSmartStartNode(provisioningEntry);
      this.sendResponse(client, requestId, {
        type: "PROVISIONING_ENTRY_ADDED",
        data: provisioningEntry,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.sendResponse(client, requestId, {
        type: "ERROR",
        message: error.message,
      });
    }
  }

  async handleUpdateProvisioningEntryStatus(client, data, requestId) {
    try {
      if (!this.zwaveClient || !this.zwaveClient.driverReady) {
        this.sendResponse(client, requestId, {
          type: "ERROR",
          message: "Driver not ready",
        });
        return;
      }

      const { dsk, active } = data;

      if (!dsk) {
        this.sendResponse(client, requestId, {
          type: "ERROR",
          message: "dsk is required",
        });
        return;
      }

      if (typeof active !== "boolean") {
        this.sendResponse(client, requestId, {
          type: "ERROR",
          message: "active must be a boolean",
        });
        return;
      }

      await this.zwaveClient.updateProvisioningEntryStatus(dsk, active);
      this.sendResponse(client, requestId, {
        type: "PROVISIONING_ENTRY_STATUS_UPDATED",
        data: { dsk, active },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.sendResponse(client, requestId, {
        type: "ERROR",
        message: error.message,
      });
    }
  }

  async handleDeleteProvisioningEntry(client, data, requestId) {
    try {
      if (!this.zwaveClient || !this.zwaveClient.driverReady) {
        this.sendResponse(client, requestId, {
          type: "ERROR",
          message: "Driver not ready",
        });
        return;
      }

      const { dsk } = data;
      if (!dsk) {
        this.sendResponse(client, requestId, {
          type: "ERROR",
          message: "dsk is required",
        });
        return;
      }

      await this.zwaveClient.unprovisionSmartStartNode(dsk);
      this.sendResponse(client, requestId, {
        type: "PROVISIONING_ENTRY_DELETED",
        data: { dsk },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.sendResponse(client, requestId, {
        type: "ERROR",
        message: error.message,
      });
    }
  }

  async handleGetNodes(client, requestId) {
    try {
      if (!this.zwaveClient || !this.zwaveClient.driverReady) {
        this.sendResponse(client, requestId, {
          type: "NODES",
          data: [],
          timestamp: new Date().toISOString(),
        });
        return;
      }
      const nodes = this.zwaveClient.getNodes();
      this.sendResponse(client, requestId, {
        type: "NODES",
        data: nodes,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.sendResponse(client, requestId, {
        type: "ERROR",
        message: error.message,
      });
    }
  }

  async handleGetNode(client, data, requestId) {
    try {
      if (!this.zwaveClient || !this.zwaveClient.driverReady) {
        this.sendResponse(client, requestId, {
          type: "ERROR",
          message: "Driver not ready",
        });
        return;
      }

      const nodeId = parseInt(data.nodeId);
      if (isNaN(nodeId)) {
        this.sendResponse(client, requestId, {
          type: "ERROR",
          message: "Invalid nodeId",
        });
        return;
      }

      const node = this.zwaveClient.getNode(nodeId);
      if (node) {
        this.sendResponse(client, requestId, {
          type: "NODE",
          data: node,
          timestamp: new Date().toISOString(),
        });
      } else {
        this.sendResponse(client, requestId, {
          type: "ERROR",
          message: "Node not found",
        });
      }
    } catch (error) {
      this.sendResponse(client, requestId, {
        type: "ERROR",
        message: error.message,
      });
    }
  }

  async handleGetStatus(client, requestId) {
    this.sendResponse(client, requestId, {
      type: "STATUS",
      data: {
        driverReady: this.zwaveClient?.driverReady || false,
        port: this.currentPort,
        connected: !!this.zwaveClient,
      },
      timestamp: new Date().toISOString(),
    });
  }

  async handleStart(client, data, requestId) {
    try {
      if (this.zwaveClient && this.zwaveClient.driverReady) {
        this.sendResponse(client, requestId, {
          type: "ERROR",
          message: "Driver is already started",
        });
        return;
      }

      const port = data.port || this.currentPort || "/dev/tty.usbserial-DK0E7J3D";

      if (this.initializeDriver) {
        await this.initializeDriver(port);
        this.sendResponse(client, requestId, {
          type: "START_SUCCESS",
          data: {
            port: port,
            message: "Driver started successfully",
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (!this.securityKeys || !this.securityKeysLongRange) {
        this.sendResponse(client, requestId, {
          type: "ERROR",
          message: "Security keys not configured",
        });
        return;
      }

      if (this.zwaveClient) {
        try {
          await this.zwaveClient.close();
        } catch (error) {
          console.error("Error closing existing driver:", error);
        }
      }

      this.zwaveClient = new ZWaveProvisioningClient(port, {
        cacheDir: "./store/cache",
        logLevel: "silly",
        securityKeys: this.securityKeys,
        securityKeysLongRange: this.securityKeysLongRange,
        deviceConfigPriorityDir: "./store/device-configs",
      });

      this.eventHandlersSetup = false;
      this.setupZWaveEventHandlers();

      await this.zwaveClient.connect();
      this.currentPort = port;

      this.sendResponse(client, requestId, {
        type: "START_SUCCESS",
        data: {
          port: port,
          message: "Driver started successfully",
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error starting driver:", error);
      this.sendResponse(client, requestId, {
        type: "ERROR",
        message: error.message || "Failed to start driver",
      });
    }
  }

  async handleSendCommand(client, data, requestId) {
    try {
      if (!this.zwaveClient || !this.zwaveClient.driverReady) {
        this.sendResponse(client, requestId, {
          type: "ERROR",
          message: "Driver not ready",
        });
        return;
      }

      const { payloadHex, count, nodeId, manufacturerId } = data;

      if (!payloadHex) {
        this.sendResponse(client, requestId, {
          type: "ERROR",
          message: "payloadHex is required",
        });
        return;
      }

      let vendorPayload;
      try {
        vendorPayload = this.zwaveClient.hexTo32ByteBuffer(payloadHex);
      } catch (error) {
        this.sendResponse(client, requestId, {
          type: "ERROR",
          message: error.message || "Invalid payloadHex format",
        });
        return;
      }

      const numericNodeId = Number.isInteger(nodeId)
        ? nodeId
        : Number(nodeId) || 2;
      const numericManufacturerId = Number.isInteger(manufacturerId)
        ? manufacturerId
        : manufacturerId !== undefined
        ? typeof manufacturerId === "string" && manufacturerId.startsWith("0x")
          ? parseInt(manufacturerId, 16)
          : parseInt(manufacturerId, 16)
        : 0x0000;
      const numericCount = Number.isInteger(count) ? count : Number(count) || 1;

      const result = await this.zwaveClient.sendManufacturerProprietaryCustom({
        nodeId: numericNodeId,
        vendorPayload: vendorPayload,
        manufacturerId: numericManufacturerId,
        count: numericCount,
      });

      this.sendResponse(client, requestId, {
        type: "COMMAND_RESULT",
        data: {
          nodeId: result.nodeId,
          count: result.count,
          vendorPayloadHex: result.vendorPayloadHex,
          manufacturerId: result.manufacturerId,
          results: result.results,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.sendResponse(client, requestId, {
        type: "ERROR",
        message:
          error.message || "Failed to send custom Manufacturer Proprietary",
      });
    }
  }

  /**
   * Close the WebSocket server and clean up
   */
  close() {
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
    this.clients.clear();
  }
}

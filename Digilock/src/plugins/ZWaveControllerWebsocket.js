import { Plugin } from "../models/Plugin.js";
import { WebSocketServer } from "ws";
import { ZWaveProvisioningClient } from "../zwave-client.js";
import { CommandClasses } from "../../../packages/core/src/definitions/index.js";

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
			this._broadcastNodeAddedWithCommandClasses(node);
			if (this.zwaveClient && this.zwaveClient.driver) {
				const zwaveNode = this.zwaveClient.driver.controller.nodes.get(
					node.id
				);
				if (zwaveNode) {
					console.log(
						`[WebSocket] Node ${node.id} found in driver, ready: ${zwaveNode.ready}`
					);
					if (zwaveNode.ready) {
						console.log(
							`[WebSocket] Node ${node.id} is already ready, getting command classes`
						);
						this._broadcastNodeCommandClassesUpdate(node.id);
					} else {
						console.log(
							`[WebSocket] Node ${node.id} not ready yet, waiting for ready event`
						);
						zwaveNode.once("ready", () => {
							console.log(
								`[WebSocket] Node ${node.id} became ready, getting command classes`
							);
							this._broadcastNodeCommandClassesUpdate(node.id);
						});
					}
				} else {
					console.warn(
						`[WebSocket] Node ${node.id} not found in driver controller nodes`
					);
				}
			} else {
				console.warn(
					`[WebSocket] Cannot get command classes: zwaveClient=${!!this
						.zwaveClient}, driver=${!!this.zwaveClient
						?.driver}, driverReady=${this.zwaveClient?.driverReady}`
				);
			}
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
					await this.handleGetProvisioningEntry(
						client,
						data,
						requestId
					);
					break;

				case "ADD_PROVISIONING_ENTRY":
					await this.handleAddProvisioningEntry(
						client,
						data,
						requestId
					);
					break;

				case "UPDATE_PROVISIONING_ENTRY_STATUS":
					await this.handleUpdateProvisioningEntryStatus(
						client,
						data,
						requestId
					);
					break;

				case "DELETE_PROVISIONING_ENTRY":
					await this.handleDeleteProvisioningEntry(
						client,
						data,
						requestId
					);
					break;

				case "GET_NODES":
					await this.handleGetNodes(client, requestId);
					break;

				case "GET_NODE":
					await this.handleGetNode(client, data, requestId);
					break;

				case "REMOVE_NODE":
					await this.handleRemoveNode(client, data, requestId);
					break;

				case "GET_NODE_COMMAND_CLASSES":
					await this.handleGetNodeCommandClasses(
						client,
						data,
						requestId
					);
					break;

				case "GET_STATUS":
					await this.handleGetStatus(client, requestId);
					break;

				case "START":
					await this.handleStart(client, data, requestId);
					break;

				case "RESET_CONTROLLER":
					await this.handleFactoryResetController(
						client,
						data,
						requestId
					);
					break;

				case "SEND_COMMAND":
					await this.handleSendCommand(client, data, requestId);
					break;

				case "SEND_GENERIC_COMMAND":
					await this.handleSendGenericCommand(
						client,
						data,
						requestId
					);
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
				protocol === "ZWaveLongRange" ||
				protocol === "Z-Wave Long Range";

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
						entry.s2AccessControl === true ||
						entry.s2AccessControl === "true",
					s2Authenticated:
						entry.s2Authenticated === true ||
						entry.s2Authenticated === "true",
					s2Unauthenticated:
						entry.s2Unauthenticated === true ||
						entry.s2Unauthenticated === "true",
					s0Legacy:
						entry.s0Legacy === true || entry.s0Legacy === "true",
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
					entry.s2AccessControl === true ||
					entry.s2AccessControl === "true",
				s2Authenticated:
					entry.s2Authenticated === true ||
					entry.s2Authenticated === "true",
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

	async handleRemoveNode(client, data, requestId) {
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

			const driver = this.zwaveClient.driver;
			if (!driver) {
				this.sendResponse(client, requestId, {
					type: "ERROR",
					message: "Driver not available",
				});
				return;
			}

			const node = driver.controller.nodes.get(nodeId);
			if (!node) {
				this.sendResponse(client, requestId, {
					type: "ERROR",
					message: `Node ${nodeId} not found`,
				});
				return;
			}

			// Check if node is failed before attempting removal
			const isFailed = await driver.controller.isFailedNode(nodeId);
			if (!isFailed) {
				this.sendResponse(client, requestId, {
					type: "ERROR",
					message: `Node ${nodeId} is not marked as failed. Only failed nodes can be removed.`,
				});
				return;
			}

			// Remove the failed node
			await driver.controller.removeFailedNode(nodeId);

			this.sendResponse(client, requestId, {
				type: "NODE_REMOVED",
				data: { nodeId: nodeId },
				timestamp: new Date().toISOString(),
			});
		} catch (error) {
			this.sendResponse(client, requestId, {
				type: "ERROR",
				message: error.message || "Failed to remove node",
			});
		}
	}

	async handleGetNodeCommandClasses(client, data, requestId) {
		console.log(
			`[WebSocket] handleGetNodeCommandClasses called for nodeId: ${data.nodeId}, requestId: ${requestId}`
		);
		try {
			if (!this.zwaveClient || !this.zwaveClient.driverReady) {
				console.warn(
					`[WebSocket] Driver not ready: zwaveClient=${!!this
						.zwaveClient}, driverReady=${
						this.zwaveClient?.driverReady
					}`
				);
				this.sendResponse(client, requestId, {
					type: "ERROR",
					message: "Driver not ready",
				});
				return;
			}

			const nodeId = parseInt(data.nodeId);
			if (isNaN(nodeId)) {
				console.warn(`[WebSocket] Invalid nodeId: ${data.nodeId}`);
				this.sendResponse(client, requestId, {
					type: "ERROR",
					message: "Invalid nodeId",
				});
				return;
			}

			console.log(`[WebSocket] Looking up node ${nodeId} in driver`);
			const zwaveNode =
				this.zwaveClient.driver.controller.nodes.get(nodeId);
			if (!zwaveNode) {
				console.warn(
					`[WebSocket] Node ${nodeId} not found in driver controller nodes`
				);
				this.sendResponse(client, requestId, {
					type: "ERROR",
					message: "Node not found",
				});
				return;
			}

			console.log(
				`[WebSocket] Node ${nodeId} found, ready: ${zwaveNode.ready}, getting command classes`
			);
			let commandClasses = this._getCommandClassesFromNode(zwaveNode);
			console.log(
				`[WebSocket] Retrieved ${commandClasses.length} command classes for node ${nodeId}`
			);

			// If no command classes found, trigger re-interview and wait for completion
			if (commandClasses.length === 0) {
				console.log(
					`[WebSocket] Node ${nodeId} has 0 command classes, triggering re-interview...`
				);

				try {
					// Wait for interview to complete
					const interviewCompleted = new Promise(
						(resolve, reject) => {
							const timeout = setTimeout(() => {
								zwaveNode.removeListener(
									"interview completed",
									onInterviewCompleted
								);
								reject(
									new Error(
										"Interview timeout after 60 seconds"
									)
								);
							}, 60000); // 60 second timeout

							const onInterviewCompleted = () => {
								clearTimeout(timeout);
								console.log(
									`[WebSocket] Node ${nodeId} interview completed`
								);
								resolve();
							};

							zwaveNode.once(
								"interview completed",
								onInterviewCompleted
							);
						}
					);

					// Start the re-interview
					console.log(
						`[WebSocket] Starting refreshInfo for node ${nodeId}`
					);
					await zwaveNode.refreshInfo({ waitForWakeup: true });

					// Wait for interview to complete
					console.log(
						`[WebSocket] Waiting for node ${nodeId} interview to complete...`
					);
					await interviewCompleted;

					// Get command classes again after interview
					console.log(
						`[WebSocket] Interview completed, getting command classes again for node ${nodeId}`
					);
					commandClasses = this._getCommandClassesFromNode(zwaveNode);
					console.log(
						`[WebSocket] After interview, retrieved ${commandClasses.length} command classes for node ${nodeId}`
					);
				} catch (error) {
					console.error(
						`[WebSocket] Error during re-interview for node ${nodeId}:`,
						error
					);
					// Still return whatever we have (might be empty)
				}
			}

			this.sendResponse(client, requestId, {
				type: "NODE_COMMAND_CLASSES",
				data: {
					nodeId: nodeId,
					commandClasses: commandClasses,
				},
				timestamp: new Date().toISOString(),
			});
		} catch (error) {
			console.error(
				`[WebSocket] Error in handleGetNodeCommandClasses:`,
				error
			);
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

			const port =
				data.port || this.currentPort || "/dev/tty.usbserial-DK0E7J3D";

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

	async handleFactoryResetController(client, data, requestId) {
		try {
			if (!this.zwaveClient || !this.zwaveClient.driverReady) {
				this.sendResponse(client, requestId, {
					type: "ERROR",
					message: "Driver not ready",
				});
				return;
			}

			await this.zwaveClient.factoryResetController();

			const response = {
				type: "CONTROLLER_FACTORY_RESET",
				data: {
					message:
						"Factory reset started. Controller will re-initialize.",
				},
				timestamp: new Date().toISOString(),
			};

			this.sendResponse(client, requestId, response);
			this.broadcast(response);
		} catch (error) {
			this.sendResponse(client, requestId, {
				type: "ERROR",
				message: error.message || "Failed to factory reset controller",
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

			const { payloadBytes, count, nodeId, manufacturerId } = data;

			if (!Array.isArray(payloadBytes)) {
				this.sendResponse(client, requestId, {
					type: "ERROR",
					message: "payloadBytes is required and must be an array",
				});
				return;
			}

			let vendorPayload;
			try {
				const normalizedBytes = payloadBytes.map((value) => Number(value));
				const hasInvalidByte = normalizedBytes.some(
					(value) =>
						!Number.isInteger(value) || value < 0 || value > 255,
				);
				if (hasInvalidByte) {
					throw new Error(
						"payloadBytes must be an array of integers between 0 and 255",
					);
				}
				if (normalizedBytes.length !== 32) {
					throw new Error(
						`payloadBytes must be exactly 32 bytes, got ${normalizedBytes.length}`,
					);
				}
				vendorPayload = Buffer.from(normalizedBytes);
			} catch (error) {
				this.sendResponse(client, requestId, {
					type: "ERROR",
					message: error.message || "Invalid payloadBytes format",
				});
				return;
			}

			const numericNodeId = Number.isInteger(nodeId)
				? nodeId
				: Number(nodeId) || 2;
			const numericManufacturerId = Number.isInteger(manufacturerId)
				? manufacturerId
				: manufacturerId !== undefined
				? typeof manufacturerId === "string" &&
				  manufacturerId.startsWith("0x")
					? parseInt(manufacturerId, 16)
					: parseInt(manufacturerId, 16)
				: 0x0000;
			const numericCount = Number.isInteger(count)
				? count
				: Number(count) || 1;

			const result =
				await this.zwaveClient.sendManufacturerProprietaryCustom({
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
					error.message ||
					"Failed to send custom Manufacturer Proprietary",
			});
		}
	}

	async handleSendGenericCommand(client, data, requestId) {
		try {
			if (!this.zwaveClient || !this.zwaveClient.driverReady) {
				this.sendResponse(client, requestId, {
					type: "ERROR",
					message: "Driver not ready",
				});
				return;
			}

			const { nodeId, ccId, ccCommand, payloadHex, count } = data;

			if (!nodeId || ccId === undefined || ccCommand === undefined) {
				this.sendResponse(client, requestId, {
					type: "ERROR",
					message: "nodeId, ccId, and ccCommand are required",
				});
				return;
			}

			const numericNodeId = Number.isInteger(nodeId)
				? nodeId
				: Number(nodeId);
			const numericCCId = Number.isInteger(ccId) ? ccId : Number(ccId);
			const numericCCCommand = Number.isInteger(ccCommand)
				? ccCommand
				: typeof ccCommand === "string" && ccCommand.startsWith("0x")
				? parseInt(ccCommand, 16)
				: parseInt(ccCommand, 16);
			const numericCount = Number.isInteger(count)
				? count
				: Number(count) || 1;

			if (
				isNaN(numericNodeId) ||
				isNaN(numericCCId) ||
				isNaN(numericCCCommand)
			) {
				this.sendResponse(client, requestId, {
					type: "ERROR",
					message: "Invalid nodeId, ccId, or ccCommand format",
				});
				return;
			}

			if (numericCount < 1 || numericCount > 100) {
				this.sendResponse(client, requestId, {
					type: "ERROR",
					message: "Count must be between 1 and 100",
				});
				return;
			}

			const driver = this.zwaveClient.driver;
			if (!driver) {
				this.sendResponse(client, requestId, {
					type: "ERROR",
					message: "Driver not available",
				});
				return;
			}

			const node = driver.controller.nodes.get(numericNodeId);
			if (!node) {
				this.sendResponse(client, requestId, {
					type: "ERROR",
					message: `Node ${numericNodeId} not found`,
				});
				return;
			}

			// Import CommandClass dynamically
			const { CommandClass } = await import(
				"../../../packages/cc/src/lib/CommandClass.js"
			);

			const results = [];
			let payloadBuffer = null;

			if (payloadHex) {
				try {
					const cleanHex = payloadHex.trim().replace(/\s+/g, "");
					payloadBuffer = Buffer.from(cleanHex, "hex");
				} catch (error) {
					this.sendResponse(client, requestId, {
						type: "ERROR",
						message: `Invalid payloadHex format: ${error.message}`,
					});
					return;
				}
			}

			for (let i = 0; i < numericCount; i++) {
				const startTime = Date.now();
				try {
					const command = new CommandClass({
						nodeId: numericNodeId,
						ccId: numericCCId,
						ccCommand: numericCCCommand,
						payload: payloadBuffer || new Uint8Array(),
					});

					const result = await driver.sendCommand(command, {
						supportCheck: false, // Allow sending even if CC is not reported as supported
					});

					const duration = Date.now() - startTime;

					results.push({
						frameNumber: i + 1,
						result: result ? "Success with response" : "Success",
						duration,
						response: result ? "Received" : "No response",
					});
				} catch (error) {
					const duration = Date.now() - startTime;
					results.push({
						frameNumber: i + 1,
						result: "Error",
						error: error.message,
						duration,
					});
				}
			}

			this.sendResponse(client, requestId, {
				type: "COMMAND_RESULT",
				data: {
					nodeId: numericNodeId,
					ccId: numericCCId,
					ccCommand: numericCCCommand,
					count: numericCount,
					results,
				},
				timestamp: new Date().toISOString(),
			});
		} catch (error) {
			this.sendResponse(client, requestId, {
				type: "ERROR",
				message: error.message || "Failed to send generic command",
			});
		}
	}

	/**
	 * Broadcast node added event with command classes
	 * @private
	 */
	_broadcastNodeAddedWithCommandClasses(node) {
		console.log(
			`[WebSocket] _broadcastNodeAddedWithCommandClasses called for node ${node.id}`
		);
		let commandClasses = [];
		try {
			if (
				this.zwaveClient &&
				this.zwaveClient.driver &&
				this.zwaveClient.driverReady
			) {
				const zwaveNode = this.zwaveClient.driver.controller.nodes.get(
					node.id
				);
				if (zwaveNode) {
					console.log(
						`[WebSocket] Getting command classes for node ${node.id}`
					);
					commandClasses = this._getCommandClassesFromNode(zwaveNode);
					console.log(
						`[WebSocket] Found ${commandClasses.length} command classes for node ${node.id}`
					);
				} else {
					console.warn(
						`[WebSocket] Node ${node.id} not found in driver controller nodes`
					);
				}
			} else {
				console.warn(
					`[WebSocket] Cannot get command classes: zwaveClient=${!!this
						.zwaveClient}, driver=${!!this.zwaveClient
						?.driver}, driverReady=${this.zwaveClient?.driverReady}`
				);
			}
		} catch (error) {
			console.error(
				`[WebSocket] Error getting command classes for node ${node.id}:`,
				error
			);
		}

		console.log(
			`[WebSocket] Broadcasting NODE_ADDED for node ${node.id} with ${commandClasses.length} command classes`
		);
		this.broadcast({
			type: "NODE_ADDED",
			nodeId: node.id,
			commandClasses: commandClasses,
			timestamp: new Date().toISOString(),
		});
	}

	/**
	 * Broadcast command classes update for a node
	 * @private
	 */
	async _broadcastNodeCommandClassesUpdate(nodeId) {
		console.log(
			`[WebSocket] _broadcastNodeCommandClassesUpdate called for node ${nodeId}`
		);
		let commandClasses = [];
		try {
			if (
				this.zwaveClient &&
				this.zwaveClient.driver &&
				this.zwaveClient.driverReady
			) {
				const zwaveNode =
					this.zwaveClient.driver.controller.nodes.get(nodeId);
				if (zwaveNode) {
					console.log(
						`[WebSocket] Getting updated command classes for node ${nodeId}`
					);
					commandClasses = this._getCommandClassesFromNode(zwaveNode);
					console.log(
						`[WebSocket] Found ${commandClasses.length} command classes for node ${nodeId}`
					);

					// If no command classes found, trigger re-interview
					if (commandClasses.length === 0) {
						console.log(
							`[WebSocket] Node ${nodeId} has 0 command classes, triggering re-interview...`
						);

						try {
							// Wait for interview to complete
							const interviewCompleted = new Promise(
								(resolve, reject) => {
									const timeout = setTimeout(() => {
										zwaveNode.removeListener(
											"interview completed",
											onInterviewCompleted
										);
										reject(
											new Error(
												"Interview timeout after 60 seconds"
											)
										);
									}, 60000); // 60 second timeout

									const onInterviewCompleted = () => {
										clearTimeout(timeout);
										console.log(
											`[WebSocket] Node ${nodeId} interview completed`
										);
										resolve();
									};

									zwaveNode.once(
										"interview completed",
										onInterviewCompleted
									);
								}
							);

							// Start the re-interview
							console.log(
								`[WebSocket] Starting refreshInfo for node ${nodeId}`
							);
							await zwaveNode.refreshInfo({
								waitForWakeup: true,
							});

							// Wait for interview to complete
							console.log(
								`[WebSocket] Waiting for node ${nodeId} interview to complete...`
							);
							await interviewCompleted;

							// Get command classes again after interview
							console.log(
								`[WebSocket] Interview completed, getting command classes again for node ${nodeId}`
							);
							commandClasses =
								this._getCommandClassesFromNode(zwaveNode);
							console.log(
								`[WebSocket] After interview, retrieved ${commandClasses.length} command classes for node ${nodeId}`
							);
						} catch (error) {
							console.error(
								`[WebSocket] Error during re-interview for node ${nodeId}:`,
								error
							);
							// Still broadcast whatever we have (might be empty)
						}
					}
				} else {
					console.warn(
						`[WebSocket] Node ${nodeId} not found in driver controller nodes`
					);
				}
			} else {
				console.warn(
					`[WebSocket] Cannot get command classes: zwaveClient=${!!this
						.zwaveClient}, driver=${!!this.zwaveClient
						?.driver}, driverReady=${this.zwaveClient?.driverReady}`
				);
			}
		} catch (error) {
			console.error(
				`[WebSocket] Error getting command classes for node ${nodeId}:`,
				error
			);
		}

		console.log(
			`[WebSocket] Broadcasting NODE_COMMAND_CLASSES_UPDATED for node ${nodeId} with ${commandClasses.length} command classes`
		);
		this.broadcast({
			type: "NODE_COMMAND_CLASSES_UPDATED",
			nodeId: nodeId,
			commandClasses: commandClasses,
			timestamp: new Date().toISOString(),
		});
	}

	/**
	 * Get all command classes from a Z-Wave node
	 * @private
	 */
	_getCommandClassesFromNode(node) {
		console.log(
			`[WebSocket] _getCommandClassesFromNode called for node ${node.id}`
		);
		const commandClasses = [];

		if (!node) {
			console.warn(`[WebSocket] Node is null or undefined`);
			return commandClasses;
		}

		try {
			// Get supported and controlled command classes
			const supportedCCs = node.supportedCCs || new Set();
			// implementedCommandClasses is a Map, so we need to get the keys
			const implementedCCsMap =
				node.implementedCommandClasses || new Map();
			const implementedCCs = new Set(implementedCCsMap.keys());
			const controlledCCs = node.controlledCCs || new Set();

			console.log(
				`[WebSocket] Node ${node.id} - supportedCCs: ${supportedCCs.size}, implementedCCs: ${implementedCCs.size}, controlledCCs: ${controlledCCs.size}`
			);

			// Combine all command classes (extract just the CC IDs)
			const allCCs = new Set([
				...supportedCCs,
				...implementedCCs,
				...controlledCCs,
			]);
			console.log(
				`[WebSocket] Node ${node.id} - total unique CCs: ${allCCs.size}`
			);

			for (const ccId of allCCs) {
				// Ensure ccId is a number, not an object or array
				const numericCCId =
					typeof ccId === "number"
						? ccId
						: Array.isArray(ccId)
						? ccId[0]
						: parseInt(ccId);

				if (isNaN(numericCCId)) {
					console.warn(
						`[WebSocket] Invalid CC ID for node ${node.id}:`,
						ccId
					);
					continue;
				}

				try {
					const ccVersion = node.getCCVersion?.(numericCCId) || 0;
					const ccName = this._getCCName(numericCCId);

					commandClasses.push({
						id: numericCCId,
						name: ccName,
						version: ccVersion,
						supported:
							supportedCCs.has(numericCCId) ||
							implementedCCs.has(numericCCId),
						controlled: controlledCCs.has(numericCCId),
						hasAPI: !!node.commandClasses?.[ccName],
					});
				} catch (error) {
					// Skip if we can't get info for this CC
					console.warn(
						`[WebSocket] Could not get info for CC 0x${numericCCId.toString(
							16
						)} on node ${node.id}:`,
						error.message
					);
				}
			}

			// Sort by ID
			commandClasses.sort((a, b) => a.id - b.id);
			console.log(
				`[WebSocket] Node ${node.id} - returning ${commandClasses.length} command classes`
			);
		} catch (error) {
			console.error(
				`[WebSocket] Error getting command classes for node ${node.id}:`,
				error
			);
		}

		return commandClasses;
	}

	/**
	 * Get command class name from ID
	 * @private
	 */
	_getCCName(ccId) {
		// Try to get name from CommandClasses enum if available
		try {
			if (CommandClasses) {
				for (const [name, id] of Object.entries(CommandClasses)) {
					if (id === ccId) {
						return name;
					}
				}
			}
		} catch (error) {
			// Fallback if CommandClasses not available
		}

		// Fallback: return hex representation
		return `0x${ccId.toString(16).padStart(2, "0")}`;
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

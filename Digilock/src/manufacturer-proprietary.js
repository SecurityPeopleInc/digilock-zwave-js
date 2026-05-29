import crypto from "crypto";

/**
 * Generates a random 32-byte payload for testing.
 * @returns {Buffer} A 32-byte random buffer
 */
export function generateRandom32BytePayload() {
	const payload = crypto.randomBytes(32);
	console.log("Random 32-byte payload:", payload.toString("hex"));
	return payload;
}

/**
 * Converts a hex string to a 32-byte Buffer, validating the length.
 * @param {string} payloadHex - Hex string (with or without spaces)
 * @returns {Buffer} A 32-byte buffer
 * @throws {Error} If the hex string is invalid or doesn't decode to exactly 32 bytes
 */
export function hexTo32ByteBuffer(payloadHex) {
	const normalized = payloadHex.replace(/\s+/g, "");
	if (!/^[0-9a-fA-F]+$/.test(normalized)) {
		throw new Error("Payload must contain only hex characters 0-9, a-f");
	}
	const buf = Buffer.from(normalized, "hex");
	if (buf.length !== 32) {
		throw new Error(
			`vendorPayload must be exactly 32 bytes, got ${buf.length}`,
		);
	}
	return buf;
}

/**
 * Returns the Manufacturer Proprietary CC API with Supervision enabled if possible.
 * @param {import("../../packages/zwave-js/src/Node.js").ZWaveNode} node
 * @param {number} nodeId
 * @param {(update: any) => void} onSupervisionUpdate
 */
export function getManufacturerProprietaryAPI(
	node,
	nodeId,
	onSupervisionUpdate,
) {
	console.log(
		`[MP API] Getting Manufacturer Proprietary API for node ${nodeId}...`,
	);

	const base = node.commandClasses["Manufacturer Proprietary"];
	console.log(`[MP API] Base CC wrapper exists: ${base ? "Yes" : "No"}`);

	if (!base) {
		console.log(`[MP API] ❌ No Manufacturer Proprietary CC wrapper found`);
		return null;
	}

	console.log(`[MP API] Base CC wrapper type:`, base);
	console.log(
		`[MP API] Base has withOptions: ${
			typeof base.withOptions === "function" ? "Yes" : "No"
		}`,
	);

	if (typeof base.withOptions === "function") {
		console.log(`[MP API] ✅ Using withOptions to enable supervision`);
		console.log(`[MP API]   - useSupervision: "auto"`);
		console.log(`[MP API]   - requestStatusUpdates: true`);

		const apiWithSupervision = base.withOptions({
			useSupervision: "auto",
			requestStatusUpdates: true,
			onUpdate: (update) => {
				onSupervisionUpdate?.(update);
				if (update) {
					console.log(
						`📡 Supervision update for node ${nodeId}:`,
						update.status ?? "unknown",
					);
				}
			},
		});

		console.log(`[MP API] ✅ Created API with supervision support`);
		return apiWithSupervision;
	}

	console.log(
		`[MP API] ⚠️  Base API does not support withOptions, using base API`,
	);
	return base;
}

/**
 * Creates Manufacturer Proprietary sending functions that work with a Z-Wave driver.
 * @param {Object} context - Context object with driver, driverReady, waitForDriverReady, and forceManufacturerProprietarySupport
 * @returns {Object} Object containing sendManufacturerProprietaryRandom and sendManufacturerProprietaryCustom functions
 */
function reportCommandSent(context, data) {
	context.onCommandSent?.(data);
}

export function createManufacturerProprietarySender(context) {
	const {
		driver,
		waitForDriverReady,
		forceManufacturerProprietarySupport,
	} = context;

	// Helper to get current driverReady state
	const getDriverReady = () => {
		if (typeof context.driverReady === "function") {
			return context.driverReady();
		}
		if (
			typeof context.driverReady === "object" &&
			context.driverReady !== null
		) {
			return context.driverReady.driverReady || false;
		}
		return context.driverReady || false;
	};

	/**
	 * Sends a Manufacturer Proprietary (CC 0x91) command with a random 32-byte payload.
	 * This is useful for testing.
	 *
	 * @param {number} nodeId - The target node ID (default: 2)
	 * @param {number} manufacturerId - The 2-byte manufacturer ID (default: 0x0000 for Silicon Labs)
	 * @param {number} count - Number of frames to send (default: 5)
	 * @param {boolean} fastMode - If true, disables status updates for faster sending (default: false)
	 * @returns {Promise<Object>} Result object with details
	 */
	async function sendManufacturerProprietaryRandom({
		nodeId = 2,
		manufacturerId = 0x0000,
		count = 5,
		fastMode = false,
	} = {}) {
		console.log(
			`\n[MP Send] ========== Starting Manufacturer Proprietary Send (Random) ==========`,
		);
		console.log(
			`[MP Send] Parameters: nodeId=${nodeId}, manufacturerId=0x${manufacturerId
				.toString(16)
				.padStart(4, "0")}, count=${count}`,
		);

		// Step 1: Check driver
		console.log(`[MP Send] Step 1: Checking driver...`);
		if (!driver) {
			console.log(`[MP Send] ❌ Driver not started`);
			throw new Error("Driver not started");
		}
		console.log(`[MP Send] ✅ Driver exists`);

		// Step 2: Check driver ready state
		console.log(`[MP Send] Step 2: Checking driver ready state...`);
		const isDriverReady = getDriverReady();
		console.log(
			`[MP Send] Driver ready state: ${
				isDriverReady ? "Ready" : "Not Ready"
			}`,
		);
		if (!isDriverReady) {
			console.log(`[MP Send] ⏳ Waiting for driver to be ready...`);
			await waitForDriverReady();
			console.log(`[MP Send] ✅ Driver is now ready`);
		} else {
			console.log(`[MP Send] ✅ Driver already ready`);
		}

		// Step 3: Get node
		console.log(`[MP Send] Step 3: Retrieving node ${nodeId}...`);
		const node = driver.controller.nodes.get(nodeId);
		if (!node) {
			console.log(`[MP Send] ❌ Node ${nodeId} not found in controller`);
			throw new Error(`Node ${nodeId} not found`);
		}
		console.log(`[MP Send] ✅ Node ${nodeId} found`);
		console.log(`[MP Send]   - Node status: ${node.status}`);
		console.log(`[MP Send]   - Node ready: ${node.ready ? "Yes" : "No"}`);
		console.log(
			`[MP Send]   - Node protocol: ${node.protocol || "Unknown"}`,
		);

		// Step 4: Check node ready
		console.log(`[MP Send] Step 4: Checking node readiness...`);
		if (!node.ready) {
			console.log(`[MP Send] ❌ Node ${nodeId} is not ready yet`);
			throw new Error(`Node ${nodeId} is not ready yet`);
		}
		console.log(`[MP Send] ✅ Node ${nodeId} is ready`);

		// Step 5: Force CC support
		console.log(
			`[MP Send] Step 5: Forcing Manufacturer Proprietary CC support...`,
		);
		const hadCCBefore = !!node.commandClasses["Manufacturer Proprietary"];
		console.log(
			`[MP Send]   - CC 0x91 supported before forcing: ${
				hadCCBefore ? "Yes" : "No"
			}`,
		);
		forceManufacturerProprietarySupport(node);
		const hasCCAfter = !!node.commandClasses["Manufacturer Proprietary"];
		console.log(
			`[MP Send]   - CC 0x91 supported after forcing: ${
				hasCCAfter ? "Yes" : "No"
			}`,
		);
		console.log(`[MP Send] ✅ CC support forcing completed`);

		// Step 6: Get CC API
		console.log(
			`[MP Send] Step 6: Getting Manufacturer Proprietary CC API...`,
		);
		let ccMP = node.commandClasses["Manufacturer Proprietary"];
		if (!ccMP) {
			console.log(
				`[MP Send] ❌ Failed to get Manufacturer Proprietary CC API`,
			);
			throw new Error(
				`Node ${nodeId} does not expose Manufacturer Proprietary CC (0x91)`,
			);
		}
		console.log(`[MP Send] ✅ Got Manufacturer Proprietary CC API`);
		console.log(`[MP Send]   - API type: ${typeof ccMP}`);
		console.log(
			`[MP Send]   - API has sendData: ${
				typeof ccMP.sendData === "function" ? "Yes" : "No"
			}`,
		);

		// Step 6.5: Configure API for fast mode if requested
		if (fastMode && typeof ccMP.withOptions === "function") {
			console.log(
				`[MP Send] Step 6.5: Configuring API for fast mode (no status updates)...`,
			);
			ccMP = ccMP.withOptions({
				useSupervision: "auto",
				requestStatusUpdates: false, // Don't wait for status updates
			});
			console.log(`[MP Send] ✅ API configured for fast mode`);
		} else if (fastMode) {
			console.log(
				`[MP Send] ⚠️  Fast mode requested but withOptions not available`,
			);
		}

		// Step 7: Prepare for sending
		console.log(`[MP Send] Step 7: Preparing to send ${count} frame(s)...`);
		console.log(
			`[MP Send] ✅ Node ${nodeId} found, sending Manufacturer Proprietary payloads (32-byte vendor payload)…`,
		);
		console.log(
			`[MP Send]   manufacturerId = ${manufacturerId} (0x${manufacturerId
				.toString(16)
				.padStart(4, "0")})`,
		);

		// Generate all payloads upfront
		const payloads = [];
		for (let i = 0; i < count; i++) {
			const vendorPayload = generateRandom32BytePayload();
			payloads.push({
				frameNumber: i + 1,
				payload: vendorPayload,
				payloadHex: vendorPayload.toString("hex"),
			});
			console.log(
				`[MP Send] Generated payload #${
					i + 1
				}: ${vendorPayload.toString("hex")}`,
			);
		}

		console.log(
			`[MP Send] ✅ Generated ${count} payload(s), queuing all commands for parallel processing...`,
		);

		// Queue all commands at once - they'll be processed sequentially by the driver
		// but this eliminates the wait time between queuing each command
		const sendPromises = payloads.map(
			({ frameNumber, payload, payloadHex }) => {
				console.log(`[MP Send] Queuing frame #${frameNumber}...`);
				const startTime = Date.now();
				return ccMP
					.sendData(manufacturerId, payload)
					.then((result) => {
						const duration = Date.now() - startTime;
						console.log(
							`[MP Send] ✅ Frame #${frameNumber} completed in ${duration}ms`,
						);
						reportCommandSent(context, {
							nodeId,
							ccId: 0x91,
							commandClass: "Manufacturer Proprietary",
							manufacturerId,
							payloadHex,
							frameNumber,
							success: true,
							duration,
							source: "manufacturer_proprietary",
						});
						return {
							frameNumber,
							payloadHex,
							result,
							duration,
						};
					})
					.catch((error) => {
						const duration = Date.now() - startTime;
						console.log(
							`[MP Send] ❌ Frame #${frameNumber} failed after ${duration}ms: ${error.message}`,
						);
						reportCommandSent(context, {
							nodeId,
							ccId: 0x91,
							commandClass: "Manufacturer Proprietary",
							manufacturerId,
							payloadHex,
							frameNumber,
							success: false,
							error: error.message,
							duration,
							source: "manufacturer_proprietary",
						});
						return {
							frameNumber,
							payloadHex,
							error: error.message,
							duration,
						};
					});
			},
		);

		// Wait for all commands to complete
		const results = await Promise.all(sendPromises);

		// Check for errors
		const errors = results.filter((r) => r.error);
		if (errors.length > 0) {
			console.error(
				`[MP Send] ❌ ${errors.length} frame(s) failed out of ${count}`,
			);
			// Optionally throw or return partial results
			// throw new Error(`${errors.length} frame(s) failed`);
		}

		console.log(
			`[MP Send] ✅ All ${count} frame(s) processed (${
				count - errors.length
			} succeeded, ${errors.length} failed)`,
		);

		console.log(
			`\n[MP Send] ========== Finished sending Manufacturer Proprietary commands ==========`,
		);
		return {
			nodeId,
			manufacturerId,
			count,
			results,
		};
	}

	/**
	 * Sends a Manufacturer Proprietary (CC 0x91) command with a custom 32-byte payload.
	 *
	 * @param {number} nodeId - The target node ID (default: 2)
	 * @param {Buffer} vendorPayload - The 32-byte vendor payload (must be exactly 32 bytes)
	 * @param {number} manufacturerId - The 2-byte manufacturer ID (default: 0x0000 for Silicon Labs)
	 * @param {number} count - Number of frames to send (default: 1, max: 100)
	 * @param {boolean} fastMode - If true, disables status updates for faster sending (default: false)
	 * @returns {Promise<Object>} Result object with details
	 */
	async function sendManufacturerProprietaryCustom({
		nodeId = 2,
		vendorPayload,
		manufacturerId = 0x0000,
		count = 1,
		fastMode = false,
	}) {
		console.log(
			`\n[MP Send] ========== Starting Manufacturer Proprietary Send (Custom) ==========`,
		);
		console.log(
			`[MP Send] Parameters: nodeId=${nodeId}, manufacturerId=0x${manufacturerId
				.toString(16)
				.padStart(4, "0")}, count=${count}`,
		);

		// Step 1: Check driver
		console.log(`[MP Send] Step 1: Checking driver...`);
		if (!driver) {
			console.log(`[MP Send] ❌ Driver not started`);
			throw new Error("Driver not started");
		}
		console.log(`[MP Send] ✅ Driver exists`);

		// Step 2: Check driver ready state
		console.log(`[MP Send] Step 2: Checking driver ready state...`);
		const isDriverReady = getDriverReady();
		console.log(
			`[MP Send] Driver ready state: ${
				isDriverReady ? "Ready" : "Not Ready"
			}`,
		);
		if (!isDriverReady) {
			console.log(`[MP Send] ⏳ Waiting for driver to be ready...`);
			await waitForDriverReady();
			console.log(`[MP Send] ✅ Driver is now ready`);
		} else {
			console.log(`[MP Send] ✅ Driver already ready`);
		}

		// Step 3: Validate payload
		console.log(`[MP Send] Step 3: Validating vendor payload...`);
		if (!Buffer.isBuffer(vendorPayload)) {
			console.log(
				`[MP Send] ❌ vendorPayload is not a Buffer (type: ${typeof vendorPayload})`,
			);
			throw new Error("vendorPayload must be a Buffer");
		}
		console.log(`[MP Send] ✅ vendorPayload is a Buffer`);
		console.log(
			`[MP Send]   Payload length: ${vendorPayload.length} bytes`,
		);

		if (vendorPayload.length !== 32) {
			console.log(
				`[MP Send] ❌ Payload length mismatch: expected 32, got ${vendorPayload.length}`,
			);
			throw new Error(
				`vendorPayload must be exactly 32 bytes, got ${vendorPayload.length}`,
			);
		}
		console.log(`[MP Send] ✅ Payload length is correct (32 bytes)`);
		const payloadHex = vendorPayload.toString("hex");
		console.log(`[MP Send]   Payload hex: ${payloadHex}`);

		// Step 4: Get node
		console.log(`[MP Send] Step 4: Retrieving node ${nodeId}...`);
		const node = driver.controller.nodes.get(nodeId);
		if (!node) {
			console.log(`[MP Send] ❌ Node ${nodeId} not found in controller`);
			throw new Error(`Node ${nodeId} not found`);
		}
		console.log(`[MP Send] ✅ Node ${nodeId} found`);
		console.log(`[MP Send]   - Node status: ${node.status}`);
		console.log(`[MP Send]   - Node ready: ${node.ready ? "Yes" : "No"}`);
		console.log(
			`[MP Send]   - Node protocol: ${node.protocol || "Unknown"}`,
		);

		// Step 5: Check node ready
		console.log(`[MP Send] Step 5: Checking node readiness...`);
		if (!node.ready) {
			console.log(`[MP Send] ❌ Node ${nodeId} is not ready yet`);
			throw new Error(`Node ${nodeId} is not ready yet`);
		}
		console.log(`[MP Send] ✅ Node ${nodeId} is ready`);

		// Step 6: Force CC support
		console.log(
			`[MP Send] Step 6: Forcing Manufacturer Proprietary CC support...`,
		);
		const hadCCBefore = !!node.commandClasses["Manufacturer Proprietary"];
		console.log(
			`[MP Send]   - CC 0x91 supported before forcing: ${
				hadCCBefore ? "Yes" : "No"
			}`,
		);
		forceManufacturerProprietarySupport(node);
		const hasCCAfter = !!node.commandClasses["Manufacturer Proprietary"];
		console.log(
			`[MP Send]   - CC 0x91 supported after forcing: ${
				hasCCAfter ? "Yes" : "No"
			}`,
		);
		console.log(`[MP Send] ✅ CC support forcing completed`);

		// Step 7: Get CC API
		console.log(
			`[MP Send] Step 7: Getting Manufacturer Proprietary CC API...`,
		);
		let ccMP = node.commandClasses["Manufacturer Proprietary"];
		if (!ccMP) {
			console.log(
				`[MP Send] ❌ Failed to get Manufacturer Proprietary CC API`,
			);
			throw new Error(
				`Node ${nodeId} does not expose Manufacturer Proprietary CC (0x91)`,
			);
		}
		console.log(`[MP Send] ✅ Got Manufacturer Proprietary CC API`);
		console.log(`[MP Send]   - API type: ${typeof ccMP}`);
		console.log(
			`[MP Send]   - API has sendData: ${
				typeof ccMP.sendData === "function" ? "Yes" : "No"
			}`,
		);

		// Step 7.5: Configure API for fast mode if requested
		if (fastMode && typeof ccMP.withOptions === "function") {
			console.log(
				`[MP Send] Step 7.5: Configuring API for fast mode (no status updates)...`,
			);
			ccMP = ccMP.withOptions({
				useSupervision: "auto",
				requestStatusUpdates: false, // Don't wait for status updates
			});
			console.log(`[MP Send] ✅ API configured for fast mode`);
		} else if (fastMode) {
			console.log(
				`[MP Send] ⚠️  Fast mode requested but withOptions not available`,
			);
		}

		// Step 8: Validate count
		console.log(`[MP Send] Step 8: Validating count parameter...`);
		console.log(`[MP Send]   Original count: ${count}`);
		if (count <= 0) {
			console.log(`[MP Send]   ⚠️  Count <= 0, setting to 1`);
			count = 1;
		}
		if (count > 100) {
			console.log(`[MP Send]   ⚠️  Count > 100, setting to 100`);
			count = 100;
		}
		console.log(`[MP Send]   Final count: ${count}`);

		// Step 9: Prepare for sending
		console.log(`[MP Send] Step 9: Preparing to send ${count} frame(s)...`);
		console.log(
			`[MP Send] ✅ Node ${nodeId} found, sending CUSTOM Manufacturer Proprietary payload ${count} time(s)…`,
		);
		console.log(`[MP Send]   • Vendor payload (32 bytes): ${payloadHex}`);
		console.log(
			`[MP Send]   • Manufacturer ID: ${manufacturerId} (0x${manufacturerId
				.toString(16)
				.padStart(4, "0")})`,
		);

		console.log(
			`[MP Send] ✅ Queuing ${count} command(s) for parallel processing...`,
		);

		// Queue all commands at once - they'll be processed sequentially by the driver
		// but this eliminates the wait time between queuing each command
		const sendPromises = Array.from({ length: count }, (_, i) => {
			const frameNumber = i + 1;
			console.log(`[MP Send] Queuing frame #${frameNumber}...`);
			const startTime = Date.now();
			return ccMP
				.sendData(manufacturerId, vendorPayload)
				.then((result) => {
					const duration = Date.now() - startTime;
					console.log(
						`[MP Send] ✅ Frame #${frameNumber} completed in ${duration}ms`,
					);
					reportCommandSent(context, {
						nodeId,
						ccId: 0x91,
						commandClass: "Manufacturer Proprietary",
						manufacturerId,
						payloadHex,
						frameNumber,
						success: true,
						duration,
						source: "manufacturer_proprietary",
					});
					return {
						frameNumber,
						result,
						duration,
					};
				})
				.catch((error) => {
					const duration = Date.now() - startTime;
					console.log(
						`[MP Send] ❌ Frame #${frameNumber} failed after ${duration}ms: ${error.message}`,
					);
					reportCommandSent(context, {
						nodeId,
						ccId: 0x91,
						commandClass: "Manufacturer Proprietary",
						manufacturerId,
						payloadHex,
						frameNumber,
						success: false,
						error: error.message,
						duration,
						source: "manufacturer_proprietary",
					});
					return {
						frameNumber,
						error: error.message,
						duration,
					};
				});
		});

		// Wait for all commands to complete
		const results = await Promise.all(sendPromises);

		// Check for errors
		const errors = results.filter((r) => r.error);
		if (errors.length > 0) {
			console.error(
				`[MP Send] ❌ ${errors.length} frame(s) failed out of ${count}`,
			);
			// Optionally throw or return partial results
			// throw new Error(`${errors.length} frame(s) failed`);
		}

		console.log(
			`[MP Send] ✅ All ${count} frame(s) processed (${
				count - errors.length
			} succeeded, ${errors.length} failed)`,
		);

		console.log(
			`\n[MP Send] ========== Finished sending CUSTOM Manufacturer Proprietary commands ==========`,
		);
		return {
			nodeId,
			count,
			vendorPayloadHex: payloadHex,
			manufacturerId,
			results,
		};
	}

	return {
		sendManufacturerProprietaryRandom,
		sendManufacturerProprietaryCustom,
	};
}

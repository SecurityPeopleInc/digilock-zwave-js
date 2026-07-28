/**
 * Digilock Manufacturer Proprietary (CC 0x91) 32-byte vendor protocol.
 *
 * Frame layout (32 bytes):
 *   [0]     0x7E  start-of-frame
 *   [1]     message type (0x01 = user auth, 0x02 = status, 0x03 = remote)
 *   [2..3]  reserved
 *   [4]     direction / opcode (0x03 = request, 0x02 = response, 0x00 = status response)
 *   [5]     result for responses (0x01 = accepted, 0x02 = rejected / remote ack)
 *   [6..]   type-specific data
 *   [30]    0xAA  trailer marker
 *   [31]    checksum / trailer
 */

/** Fixed response payloads from the Digilock protocol spec */
export const DIGILOCK_RESPONSES = {
	accepted:
		"7e0100000201000000000000000000000000000000000000000000000000aad6",
	rejected:
		"7e0100000202000000000000000000000000000000000000000000000000aad5",
	status: "7e0200000000000000000000000000000000000000000000000000000000aad6",
	remote: "7e0300000202000000000000000000000000000000000000000000000000aad7",
};

/** Known user credential fingerprints (bytes 14-15 of user requests) */
const KNOWN_USER_CREDENTIALS = new Map([
	["568d", 1],
	["8772", 2],
	["416b", 3],
	["1f7f", 4],
]);

/**
 * @param {Buffer|number[]|Uint8Array|null|undefined} payload
 * @returns {Buffer}
 */
function toBuffer(payload) {
	if (Buffer.isBuffer(payload)) {
		return payload;
	}
	if (payload == null) {
		return Buffer.alloc(0);
	}
	return Buffer.from(payload);
}

/**
 * Formats a buffer as uppercase hex bytes separated by commas.
 * @param {Buffer} buf
 * @returns {string}
 */
export function formatPayloadBytes(buf) {
	return [...buf]
		.map((b) => b.toString(16).toUpperCase().padStart(2, "0"))
		.join(", ");
}

/**
 * Parses a Digilock 32-byte proprietary payload.
 * @param {Buffer|number[]|Uint8Array|null|undefined} payload
 * @returns {object}
 */
export function parseDigilockPayload(payload) {
	const buf = toBuffer(payload);
	const payloadHex = buf.toString("hex");
	const base = {
		payloadHex,
		payloadBytes: formatPayloadBytes(buf),
		length: buf.length,
	};

	if (buf.length < 5 || buf[0] !== 0x7e) {
		return {
			...base,
			kind: "unknown",
			label: "Unknown Payload",
			isRequest: false,
			isResponse: false,
		};
	}

	const messageType = buf[1];
	const opcode = buf[4];
	const result = buf.length > 5 ? buf[5] : 0;

	// User request: 7E 01 .. 03 ...
	if (messageType === 0x01 && opcode === 0x03) {
		const credentialHex =
			buf.length >= 16 ? buf.subarray(14, 16).toString("hex") : "";
		const userNumber = KNOWN_USER_CREDENTIALS.get(credentialHex) ?? null;
		return {
			...base,
			kind: "user_request",
			label: userNumber ? `User ${userNumber} Request` : "User Request",
			isRequest: true,
			isResponse: false,
			messageType,
			opcode,
			userNumber,
			credentialHex,
		};
	}

	// Status request: 7E 02 .. 03 ...
	if (messageType === 0x02 && opcode === 0x03) {
		return {
			...base,
			kind: "status_request",
			label: "Status Request",
			isRequest: true,
			isResponse: false,
			messageType,
			opcode,
		};
	}

	// Remote request: 7E 03 .. 03 ...
	if (messageType === 0x03 && opcode === 0x03) {
		return {
			...base,
			kind: "remote_request",
			label: "Remote Request",
			isRequest: true,
			isResponse: false,
			messageType,
			opcode,
		};
	}

	// User accepted response: 7E 01 .. 02 01 ...
	if (messageType === 0x01 && opcode === 0x02 && result === 0x01) {
		return {
			...base,
			kind: "accepted_response",
			label: "Accepted Response",
			isRequest: false,
			isResponse: true,
			messageType,
			opcode,
			result,
		};
	}

	// User rejected response: 7E 01 .. 02 02 ...
	if (messageType === 0x01 && opcode === 0x02 && result === 0x02) {
		return {
			...base,
			kind: "rejected_response",
			label: "Rejected Response",
			isRequest: false,
			isResponse: true,
			messageType,
			opcode,
			result,
		};
	}

	// Status response: 7E 02 .. 00 ...
	if (messageType === 0x02 && opcode === 0x00) {
		return {
			...base,
			kind: "status_response",
			label: "Status Response",
			isRequest: false,
			isResponse: true,
			messageType,
			opcode,
		};
	}

	// Remote response: 7E 03 .. 02 02 ...
	if (messageType === 0x03 && opcode === 0x02) {
		return {
			...base,
			kind: "remote_response",
			label: "Remote Response",
			isRequest: false,
			isResponse: true,
			messageType,
			opcode,
			result,
		};
	}

	return {
		...base,
		kind: "unknown",
		label: "Unknown Digilock Frame",
		isRequest: false,
		isResponse: false,
		messageType,
		opcode,
	};
}

/**
 * Builds the response payload hex for a parsed Digilock request.
 * @param {object} parsed - Result of parseDigilockPayload
 * @param {"accept"|"reject"} [userDecision="accept"] - Decision for user requests
 * @returns {{ kind: string, label: string, payloadHex: string } | null}
 */
export function buildDigilockResponse(parsed, userDecision = "accept") {
	if (!parsed?.isRequest) {
		return null;
	}

	if (parsed.kind === "user_request") {
		const reject = userDecision === "reject";
		return {
			kind: reject ? "rejected_response" : "accepted_response",
			label: reject ? "Rejected Response" : "Accepted Response",
			payloadHex: reject
				? DIGILOCK_RESPONSES.rejected
				: DIGILOCK_RESPONSES.accepted,
		};
	}

	if (parsed.kind === "status_request") {
		return {
			kind: "status_response",
			label: "Status Response",
			payloadHex: DIGILOCK_RESPONSES.status,
		};
	}

	if (parsed.kind === "remote_request") {
		return {
			kind: "remote_response",
			label: "Remote Response",
			payloadHex: DIGILOCK_RESPONSES.remote,
		};
	}

	return null;
}

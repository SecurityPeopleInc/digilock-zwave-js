import os from "node:os";

/** Stable column order for command monitor experiment logs (logFormatVersion 3). */
export const COMMAND_MONITOR_LOG_COLUMNS = [
	"Experiment_ID",
	"Room_Temperature_C",
	"Relative_Humidity_Percent",
	"Zone",
	"Active_Lock_Count",
	"Timestamp_UTC",
	"Transmission_Interval_ms",
	"Node_ID",
	"Manufacturer_ID",
	"Direction",
	"Round_Trip_Time_ms",
	"Error_Code",
	"Message_Source",
	"Transaction_Success",
	"ACK_RSSI_dBm",
	"Noise_Floor_dBm",
	"Routing_Attempts",
	"Callback_ID",
	"ACK_Channel_Number",
	"TX_Channel_Number",
	"Payload_Sequence_Number",
	"Gateway_ID",
	"Gateway_Location",
	"Lock_Location",
	"Failure_Type",
	"CPU Performance",
];

const RSSI_ERROR_MIN = 125;

/**
 * @param {number | undefined | null} rssi
 * @returns {number | null}
 */
export function formatRssiDbm(rssi) {
	if (rssi == null || typeof rssi !== "number") {
		return null;
	}
	if (rssi >= RSSI_ERROR_MIN) {
		return null;
	}
	return rssi;
}

/**
 * @param {{ x?: number, y?: number } | null | undefined}
 * @returns {string | null}
 */
export function formatPlanLocation(coords) {
	if (!coords || coords.x == null || coords.y == null) {
		return null;
	}
	return `${Number(coords.x).toFixed(4)},${Number(coords.y).toFixed(4)}`;
}

/**
 * @param {Object} enriched
 * @returns {string | null}
 */
export function deriveFailureType(enriched) {
	if (enriched.success !== false) {
		return null;
	}
	if (enriched.error) {
		return String(enriched.error);
	}
	if (enriched.transmitStatus) {
		return String(enriched.transmitStatus);
	}
	return "unknown";
}

/**
 * @returns {number}
 */
export function getCpuPerformanceSnapshot() {
	return Number(os.loadavg()[0].toFixed(3));
}

/**
 * @param {Object} enriched
 * @param {string} eventTimestamp
 * @param {Object} session
 * @returns {Record<string, unknown>}
 */
export function buildCommandMonitorLogRecord(enriched, eventTimestamp, session) {
	const context = session.logContext || {};
	const txReport = enriched.txReport;
	const ackRssi = formatRssiDbm(txReport?.ackRSSI ?? enriched.ackRSSI);
	const noiseFloor = formatRssiDbm(
		txReport?.measuredNoiseFloor ?? enriched.noiseFloor,
	);

	return {
		Experiment_ID: context.experimentId ?? null,
		Room_Temperature_C: context.roomTemperatureC ?? null,
		Relative_Humidity_Percent: context.relativeHumidityPercent ?? null,
		Zone: context.zone ?? session.zone ?? null,
		Active_Lock_Count:
			context.activeLockCount ?? session.activeLockCount ?? null,
		Timestamp_UTC: eventTimestamp,
		Transmission_Interval_ms:
			enriched.intervalMs === undefined ? null : enriched.intervalMs,
		Node_ID: enriched.nodeId ?? null,
		Manufacturer_ID: enriched.manufacturerId ?? null,
		Direction: enriched.direction ?? null,
		Round_Trip_Time_ms: enriched.duration ?? null,
		Error_Code: enriched.error ?? null,
		Message_Source: enriched.source ?? null,
		Transaction_Success: enriched.success !== false,
		ACK_RSSI_dBm: ackRssi,
		Noise_Floor_dBm: noiseFloor,
		Routing_Attempts:
			txReport?.routingAttempts ?? enriched.routingAttempts ?? null,
		Callback_ID: enriched.callbackId ?? null,
		ACK_Channel_Number:
			txReport?.ackChannelNo ?? enriched.ackChannelNo ?? null,
		TX_Channel_Number:
			txReport?.txChannelNo ?? enriched.txChannelNo ?? null,
		Payload_Sequence_Number: enriched.frameNumber ?? null,
		Gateway_ID: context.gatewayId ?? session.gatewayId ?? null,
		Gateway_Location:
			context.gatewayLocation ?? session.gatewayLocation ?? null,
		Lock_Location:
			enriched.lockLocation ??
			session.lockLocationsByNode?.[String(enriched.nodeId)] ??
			null,
		Failure_Type: deriveFailureType(enriched),
		"CPU Performance":
			enriched.cpuPerformance ?? getCpuPerformanceSnapshot(),
	};
}

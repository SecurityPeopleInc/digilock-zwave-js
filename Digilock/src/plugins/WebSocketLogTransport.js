import Transport from "../../../packages/core/node_modules/winston-transport/index.js";
import { createDefaultTransportFormat } from "../../../packages/core/src/bindings/log/node.js";

const MESSAGE = Symbol.for("message");

/**
 * Winston transport that forwards formatted zwave-js log lines to a callback.
 * Uses the same format as the built-in console transport (short timestamps, colors).
 */
export class WebSocketLogTransport extends Transport {
	/**
	 * @param {(line: string, level: string) => void} onLine
	 */
	constructor(onLine) {
		super({
			level: "silly",
			format: createDefaultTransportFormat(true, true),
		});
		this.onLine = onLine;
	}

	log(info, next) {
		setImmediate(() => {
			this.emit("logged", info);
		});

		const line = info[MESSAGE];
		if (typeof line === "string" && line) {
			this.onLine(line, info.level ?? "info");
		}

		next();
	}
}

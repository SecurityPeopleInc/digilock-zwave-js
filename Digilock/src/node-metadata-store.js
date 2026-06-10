import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { dskToString } from "../../packages/core/src/dsk/index.js";

const DEFAULT_DATA = { byNodeId: {}, byDsk: {} };

/**
 * Persists commissioning metadata (DSK, name, location) keyed by node and DSK.
 */
export class NodeMetadataStore {
	constructor(dataDir) {
		this.dataPath = join(dataDir, "node-metadata.json");
		this.dataDir = dataDir;
	}

	async init() {
		await mkdir(this.dataDir, { recursive: true });
	}

	async load() {
		try {
			const raw = await readFile(this.dataPath, "utf8");
			const parsed = JSON.parse(raw);
			return {
				byNodeId: parsed.byNodeId || {},
				byDsk: parsed.byDsk || {},
				updatedAt: parsed.updatedAt ?? null,
			};
		} catch {
			return { ...DEFAULT_DATA, updatedAt: null };
		}
	}

	async save(data) {
		const payload = {
			byNodeId: data.byNodeId || {},
			byDsk: data.byDsk || {},
			updatedAt: new Date().toISOString(),
		};
		await writeFile(this.dataPath, JSON.stringify(payload, null, 2), "utf8");
		return payload;
	}

	async recordProvisioningEntry({ dsk, name, location }) {
		if (!dsk) return null;
		const data = await this.load();
		const key = this._normalizeDskKey(dsk);
		const existing = data.byDsk[key] || {};
		data.byDsk[key] = {
			dsk: dsk,
			name: name ?? existing.name ?? "",
			location: location ?? existing.location ?? "",
			updatedAt: new Date().toISOString(),
		};
		return this.save(data);
	}

	async saveForNode(nodeId, { dsk, name, location }) {
		const data = await this.load();
		const key = String(nodeId);
		const existing = data.byNodeId[key] || {};
		const record = {
			dsk: dsk ?? existing.dsk ?? "",
			name: name ?? existing.name ?? "",
			location: location ?? existing.location ?? "",
			updatedAt: new Date().toISOString(),
		};
		data.byNodeId[key] = record;
		if (record.dsk) {
			data.byDsk[this._normalizeDskKey(record.dsk)] = { ...record, dsk: record.dsk };
		}
		return this.save(data);
	}

	async getForNode(nodeId) {
		const data = await this.load();
		return data.byNodeId[String(nodeId)] || null;
	}

	async linkFromProvisioning(zwaveClient, node) {
		if (!zwaveClient?.driverReady || !node) return null;

		const data = await this.load();
		const nodeId = String(node.id);
		let match = null;

		try {
			const entries = zwaveClient.driver.controller.getProvisioningEntries();
			for (const entry of entries) {
				if (entry.nodeId === node.id) {
					match = entry;
					break;
				}
			}

			if (!match && node.dsk) {
				const nodeDsk = zwaveClient.normalizeDSK(dskToString(node.dsk));
				for (const entry of entries) {
					if (zwaveClient.normalizeDSK(entry.dsk) === nodeDsk) {
						match = entry;
						break;
					}
				}
			}
		} catch {
			// fall through to DSK store lookup
		}

		let record = data.byNodeId[nodeId] || {};
		if (match) {
			record = {
				dsk: match.dsk || record.dsk || "",
				name: match.name || record.name || "",
				location: match.location || record.location || "",
				updatedAt: new Date().toISOString(),
			};
		} else if (node.dsk) {
			try {
				const nodeDsk = zwaveClient.normalizeDSK(dskToString(node.dsk));
				const fromDsk = data.byDsk[this._normalizeDskKey(nodeDsk)];
				if (fromDsk) {
					record = {
						dsk: fromDsk.dsk || nodeDsk,
						name: fromDsk.name || record.name || "",
						location: fromDsk.location || record.location || "",
						updatedAt: new Date().toISOString(),
					};
				} else if (!record.dsk) {
					record.dsk = nodeDsk;
				}
			} catch {
				// ignore DSK conversion errors
			}
		}

		if (!record.dsk && !record.name && !record.location) {
			return null;
		}

		data.byNodeId[nodeId] = record;
		if (record.dsk) {
			data.byDsk[this._normalizeDskKey(record.dsk)] = {
				...record,
				dsk: record.dsk,
			};
		}
		return this.save(data);
	}

	_normalizeDskKey(dsk) {
		return String(dsk).replace(/[-\s]/g, "").toUpperCase();
	}
}

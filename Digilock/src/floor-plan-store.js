import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const DEFAULT_LAYOUT = { maps: [], activeMapId: null };

/**
 * Persists floor plan layout and uploaded map assets on the server.
 */
export class FloorPlanStore {
	constructor(dataDir) {
		this.dataDir = dataDir;
		this.assetsDir = join(dataDir, "assets");
		this.layoutPath = join(dataDir, "layout.json");
	}

	async init() {
		await mkdir(this.assetsDir, { recursive: true });
		await mkdir(this.dataDir, { recursive: true });
	}

	async load() {
		try {
			const raw = await readFile(this.layoutPath, "utf8");
			const data = JSON.parse(raw);
			return {
				maps: Array.isArray(data.maps) ? data.maps : [],
				activeMapId: data.activeMapId ?? null,
				updatedAt: data.updatedAt ?? null,
			};
		} catch {
			return { ...DEFAULT_LAYOUT, updatedAt: null };
		}
	}

	async save(layout) {
		const payload = {
			maps: Array.isArray(layout.maps) ? layout.maps : [],
			activeMapId: layout.activeMapId ?? null,
			updatedAt: new Date().toISOString(),
		};
		await writeFile(
			this.layoutPath,
			JSON.stringify(payload, null, 2),
			"utf8",
		);
		return payload;
	}

	async saveAsset(base64Data, originalName, mimeType) {
		const ext =
			mimeType === "application/pdf"
				? "pdf"
				: mimeType === "image/png"
					? "png"
					: mimeType === "image/jpeg" || mimeType === "image/jpg"
						? "jpg"
						: mimeType === "image/webp"
							? "webp"
							: mimeType === "image/gif"
								? "gif"
								: "bin";
		const fileName = `${randomUUID()}.${ext}`;
		const filePath = join(this.assetsDir, fileName);
		const buffer = Buffer.from(base64Data, "base64");
		await writeFile(filePath, buffer);
		return {
			fileName,
			url: `/floor-plan-assets/${fileName}`,
			mimeType,
			originalName: originalName || fileName,
		};
	}
}

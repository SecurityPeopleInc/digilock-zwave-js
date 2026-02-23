#!/usr/bin/env node
/**
 * Bundle Digilock server and zwave-js dependencies into a single ESM file.
 * Run from repo root: node Digilock/build-bundle.mjs
 * Or from Digilock: node build-bundle.mjs (script resolves repo root)
 *
 * Prerequisites: yarn build (build all packages so build/esm exists)
 * Output: Digilock/dist/digilock-bundle.js
 * Runtime: node dist/digilock-bundle.js (requires serialport in node_modules)
 */

import * as esbuild from "esbuild";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import { existsSync, mkdirSync, cpSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Repo root: directory that contains both Digilock and packages (one or two levels up from Digilock)
const digilockDir = __dirname;
const repoRoot = (() => {
	const parent = dirname(digilockDir);
	if (existsSync(join(parent, "packages"))) return parent;
	const grandparent = dirname(parent);
	if (existsSync(join(grandparent, "packages"))) return grandparent;
	return parent;
})();
const outFile = join(digilockDir, "dist", "digilock-bundle.js");

// Resolve .js to .ts in packages so we can bundle TypeScript source
function resolveJsToTsPlugin() {
	return {
		name: "resolve-js-to-ts",
		setup(build) {
			build.onResolve({ filter: /.*/ }, (args) => {
				if (args.resolveDir && args.path.endsWith(".js") && !args.path.startsWith(".") && !args.path.startsWith("#")) {
					return undefined;
				}
				if (!args.path.endsWith(".js") || !args.importer) return undefined;
				const fromPackages = args.importer.includes("packages" + (process.platform === "win32" ? "\\" : "/"));
				if (!fromPackages && !args.importer.includes("Digilock")) return undefined;
				const base = resolve(args.resolveDir, args.path);
				const tsPath = base.replace(/\.js$/i, ".ts");
				if (existsSync(tsPath)) {
					return { path: tsPath, namespace: "file" };
				}
				return undefined;
			});
		},
	};
}

// Resolve ../../packages/<pkg>/src/... or ../../../packages/<pkg>/... to built ESM or source
function packagesPathPlugin(useBuilt) {
	return {
		name: "packages-path",
		setup(build) {
			const re = /^(\.\.\/)+(packages\/[^/]+\/)(?:src\/|build\/esm\/)?(.*)$/;
			build.onResolve({ filter: /\.\.\/.*packages\// }, (args) => {
				const m = args.path.match(re);
				if (!m) return undefined;
				const [, , pkg, rest] = m;
				const pkgName = pkg.replace(/\/$/, "");
				const prefer = useBuilt ? "build/esm" : "src";
				const restFile = useBuilt ? rest : rest.replace(/\.js$/i, ".ts");
				let candidate = join(repoRoot, pkgName, prefer, restFile);
				if (existsSync(candidate)) return { path: candidate, namespace: "file" };
				const fallback = join(repoRoot, pkgName, prefer === "build/esm" ? "src" : "build/esm", useBuilt ? rest.replace(/\.ts$/i, ".js") : rest);
				if (existsSync(fallback)) return { path: fallback, namespace: "file" };
				return undefined;
			});
		},
	};
}

// Resolve package.json "imports" (#default_bindings/*, #mdns_discovery) so the bundle can resolve them
function zwaveImportsPlugin() {
	const bindings = {
		"#default_bindings/serial": join(repoRoot, "packages/serial/src/bindings/node.ts"),
		"#default_bindings/fs": join(repoRoot, "packages/core/src/bindings/fs/node.ts"),
		"#default_bindings/db": join(repoRoot, "packages/core/src/bindings/db/jsonl.ts"),
		"#default_bindings/log": join(repoRoot, "packages/core/src/bindings/log/node.ts"),
		"#mdns_discovery": join(repoRoot, "packages/zwave-js/src/lib/driver/mDNSDiscovery/node.ts"),
	};
	return {
		name: "zwave-imports",
		setup(build) {
			build.onResolve({ filter: /^#/ }, (args) => {
				const resolved = bindings[args.path];
				if (resolved && existsSync(resolved)) {
					return { path: resolved, namespace: "file" };
				}
				return undefined;
			});
		},
	};
}

async function main() {
	// Entry: always use path relative to this script (Digilock/src/server.js)
	const entryAbsolute = join(digilockDir, "src", "server.js");
	if (!existsSync(entryAbsolute)) {
		console.error("Entry not found:", entryAbsolute);
		console.error("Run yarn bundle from the Digilock directory.");
		process.exit(1);
	}
	const useBuiltPackages = existsSync(join(repoRoot, "packages/zwave-js/build/esm"));

	if (!useBuiltPackages) {
		console.warn("packages/zwave-js/build/esm not found. Run 'yarn build' from repo root first.");
		console.warn("Bundling will try to use source (.ts) with resolver plugins.");
	}

	mkdirSync(dirname(outFile), { recursive: true });

	await esbuild.build({
		absWorkingDir: repoRoot,
		entryPoints: [entryAbsolute],
		bundle: true,
		format: "esm",
		platform: "node",
		target: "node20",
		outfile: outFile,
		sourcemap: true,
		// Native bindings must stay external
		external: [
			"serialport",
			"@serialport/stream",
			"@serialport/bindings-interface",
		],
		plugins: [
			packagesPathPlugin(useBuiltPackages),
			...(useBuiltPackages ? [] : [resolveJsToTsPlugin()]),
			zwaveImportsPlugin(),
		],
		// Only inject require (createRequire); __dirname/__filename are set by server.js and conflict with bundled code
		banner: {
			js: [
				"import { createRequire as _bundleCreateRequire } from 'module';",
				"const require = _bundleCreateRequire(import.meta.url);",
			].join("\n"),
		},
	});

	// Copy public and store into dist so __dirname-based paths work when running the bundle
	const distDir = dirname(outFile);
	for (const name of ["public", "store"]) {
		const src = join(digilockDir, name);
		if (existsSync(src)) {
			const dest = join(distDir, name);
			cpSync(src, dest, { recursive: true });
			console.log("Copied", name, "to dist/");
		}
	}

	console.log("Bundle written to:", outFile);
	console.log("Run from Digilock: node dist/digilock-bundle.js");
	console.log("Or from dist: node digilock-bundle.js (public/ and store/ are in dist/)");
	console.log("Ensure serialport is installed: npm install serialport (or use the repo node_modules).");
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});

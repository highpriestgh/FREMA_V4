/**
 * Vendors OpenCV.js into `public/vendor/` at build time.
 *
 * The scanner previously pulled a 10 MB script from docs.opencv.org on every first use.
 * That makes the feature depend on the open internet at *runtime* — unavailable on an
 * intranet-only deployment, blocked by a strict Content-Security-Policy, unversioned, and it
 * tells a third party which of your users are scanning documents. Fetching it once at build
 * time turns all of that into a build-time concern.
 *
 * The file is gitignored: it is a vendored artefact, not source.
 */
import { createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const VERSION = "4.9.0";
const URL = `https://docs.opencv.org/${VERSION}/opencv.js`;

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const target = join(root, "public", "vendor", "opencv.js");

const existing = await stat(target).catch(() => null);
if (existing && existing.size > 1_000_000) {
  console.log(`opencv.js already vendored (${(existing.size / 1e6).toFixed(1)} MB)`);
  process.exit(0);
}

console.log(`Fetching OpenCV ${VERSION}…`);

const response = await fetch(URL);
if (!response.ok) {
  console.error(`Failed to fetch ${URL}: ${response.status} ${response.statusText}`);
  // Non-fatal: the rest of the app builds and works. Only the scanner is affected, and it
  // reports its own "not ready" state rather than breaking the page.
  process.exit(0);
}

await mkdir(dirname(target), { recursive: true });
await pipeline(response.body, createWriteStream(target));

const written = await stat(target);
console.log(`Vendored opencv.js (${(written.size / 1e6).toFixed(1)} MB) → public/vendor/`);

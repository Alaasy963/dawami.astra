import { generateSW } from "workbox-build";
const result = await generateSW({
  globDirectory: "dist",
  globPatterns: [
    "index.html",
    "assets/*.{js,css,woff2}",
    "icon.svg",
    "*.png",
    "manifest.webmanifest",
  ],
  globIgnores: ["assets/Map-*", "assets/browser-*"],
  swDest: "dist/sw.js",
  navigateFallback: "index.html",
  navigateFallbackDenylist: [/^\/api\//],
  cleanupOutdatedCaches: true,
  clientsClaim: true,
  skipWaiting: false,
  importScripts: ["/push.js"],
  sourcemap: false,
});
if (result.warnings.length) throw new Error(result.warnings.join("\n"));
console.log(
  `Offline shell: ${result.count} assets, ${result.size} bytes. API responses and map tiles are never cached.`,
);

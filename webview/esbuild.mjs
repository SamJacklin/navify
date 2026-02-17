import esbuild from "esbuild";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const watch = process.argv.includes("--watch");

const ctx = await esbuild.context({
  entryPoints: [path.join(__dirname, "src", "main.tsx")],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["es2020"],
  sourcemap: watch,
  minify: !watch,
  outdir: path.join(__dirname, "..", "media", "webview", "dist"),
  entryNames: "main",
  loader: { ".css": "css" }
});

if (watch) {
  await ctx.watch();
  console.log("[webview] watching");
} else {
  await ctx.rebuild();
  await ctx.dispose();
  console.log("[webview] built");
}

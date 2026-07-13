import { mkdir, copyFile, readFile, writeFile, cp } from "node:fs/promises";

await mkdir("dist/data", { recursive: true });
await mkdir("dist/assets", { recursive: true });
const og = Bun.spawnSync(["python3", "scripts/generate-og.py"]);
if (!og.success) {
  process.stderr.write(og.stderr.toString());
  process.exit(og.exitCode || 1);
}
process.stdout.write(og.stdout.toString());
const proc = Bun.spawnSync(["bun", "build", "./src/app.js", "--outdir=dist", "--target=browser"]);
if (!proc.success) {
  process.stderr.write(proc.stderr.toString());
  process.exit(proc.exitCode || 1);
}
process.stdout.write(proc.stdout.toString());
await copyFile("styles.css", "dist/styles.css");
await copyFile("data/episodes.json", "dist/data/episodes.json");
await cp("assets", "dist/assets", { recursive: true });
const html = await readFile("index.html", "utf8");
await writeFile("dist/index.html", html.replace('./src/app.js', './app.js'));
console.log("Static build written to dist/");

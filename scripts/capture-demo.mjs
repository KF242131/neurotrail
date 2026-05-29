#!/usr/bin/env node
// Capture the built-in "sample agent PR replay" as hero media for the README.
// Writes docs/hero.gif (looping) and docs/hero.png (poster frame).
//
// One-time setup (dev-only tools, NOT shipped in the npm package):
//   npm i -D playwright && npx playwright install chromium
//   # ffmpeg must be on PATH (brew install ffmpeg)
// Then:
//   npm run demo:capture
//
// It starts the Vite viewer pointed at an EMPTY workspace (so the sample replay
// plays instead of any live session), records ~14s of the animation headlessly,
// and encodes an optimized GIF with ffmpeg.
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 4319;
const WIDTH = 1280;
const HEIGHT = 800;
const SECONDS = 13;
const GIF_WIDTH = 800;
const FPS = 10;
const GIF_SECONDS = 11; // trim the encoded loop (keeps the README GIF small)

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", ...opts });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))
    );
  });
}

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`viewer did not start at ${url}`);
}

let playwright;
try {
  playwright = await import("playwright");
} catch {
  console.error(
    "Playwright is required for demo capture:\n" +
      "  npm i -D playwright && npx playwright install chromium"
  );
  process.exit(1);
}

const docsDir = path.join(root, "docs");
await fs.mkdir(docsDir, { recursive: true });
const emptyWorkspace = await fs.mkdtemp(path.join(os.tmpdir(), "nt-demo-ws-"));
const videoDir = await fs.mkdtemp(path.join(os.tmpdir(), "nt-demo-vid-"));

console.log("• starting viewer against an empty workspace (forces the sample replay)…");
const server = spawn(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["run", "dev", "--", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"],
  { cwd: root, stdio: "ignore", env: { ...process.env, NEUROTRAIL_WORKSPACE: emptyWorkspace } }
);

try {
  await waitForServer(`http://localhost:${PORT}/`);
  console.log("• recording the replay…");
  const { chromium } = playwright;
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    recordVideo: { dir: videoDir, size: { width: WIDTH, height: HEIGHT } },
  });
  const page = await context.newPage();
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "load" });
  await page.waitForTimeout(1500); // let the graph settle in
  await page.keyboard.press("c"); // cinematic mode: hide side panels for a clean shot
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(docsDir, "hero.png") });
  await page.waitForTimeout(SECONDS * 1000);
  await context.close(); // flushes the video file
  await browser.close();

  const webm = (await fs.readdir(videoDir)).find((f) => f.endsWith(".webm"));
  if (!webm) throw new Error("no video produced");
  const webmPath = path.join(videoDir, webm);

  console.log("• encoding optimized gif (ffmpeg, two-pass palette)…");
  const palette = path.join(videoDir, "palette.png");
  const vf = `fps=${FPS},scale=${GIF_WIDTH}:-1:flags=lanczos`;
  const trim = ["-ss", "1", "-t", String(GIF_SECONDS)];
  await run("ffmpeg", ["-y", ...trim, "-i", webmPath, "-vf", `${vf},palettegen=stats_mode=diff`, palette]);
  await run("ffmpeg", [
    "-y", ...trim, "-i", webmPath, "-i", palette,
    "-lavfi", `${vf}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3`,
    path.join(docsDir, "hero.gif"),
  ]);

  console.log("\n✓ wrote docs/hero.gif and docs/hero.png");
} finally {
  server.kill();
}

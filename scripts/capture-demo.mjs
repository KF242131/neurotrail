#!/usr/bin/env node
// Capture the built-in "sample agent PR replay" as README media.
// Writes:
//   docs/hero.gif / docs/hero.png
//   docs/task-map.gif / docs/task-map.png
//   docs/review-path.gif / docs/review-path.png
//
// One-time setup (dev-only tools, NOT shipped in the npm package):
//   npm i -D playwright && npx playwright install chromium
//   # ffmpeg must be on PATH (brew install ffmpeg)
// Then:
//   npm run demo:capture
//
// It starts the Vite viewer pointed at an EMPTY workspace (so the sample replay
// plays instead of any live session), records the cinematic replay headlessly,
// and encodes several optimized GIF slices with ffmpeg.
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 4319;
const WIDTH = 1280;
const HEIGHT = 800;
const SECONDS = 42;
const GIF_WIDTH = 780;
const FPS = 9;

const POSTERS = [
  { name: "hero", at: 1.2 },
  { name: "task-map", at: 13 },
  { name: "review-path", at: 32 },
];

const GIF_CLIPS = [
  { name: "hero", start: 2, duration: 12 },
  { name: "task-map", start: 11, duration: 10 },
  { name: "review-path", start: 28, duration: 10 },
];

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
  console.log("• recording the cinematic replay…");
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
  const captureStart = Date.now();
  const waitUntil = async (seconds) => {
    const elapsed = Date.now() - captureStart;
    const waitMs = Math.max(0, seconds * 1000 - elapsed);
    if (waitMs > 0) await page.waitForTimeout(waitMs);
  };

  for (const poster of POSTERS) {
    await waitUntil(poster.at);
    await page.screenshot({ path: path.join(docsDir, `${poster.name}.png`) });
  }

  await waitUntil(SECONDS);
  await context.close(); // flushes the video file
  await browser.close();

  const webm = (await fs.readdir(videoDir)).find((f) => f.endsWith(".webm"));
  if (!webm) throw new Error("no video produced");
  const webmPath = path.join(videoDir, webm);

  console.log("• encoding optimized gifs (ffmpeg, two-pass palette)…");
  const vf = `fps=${FPS},scale=${GIF_WIDTH}:-1:flags=lanczos`;
  for (const clip of GIF_CLIPS) {
    const palette = path.join(videoDir, `${clip.name}-palette.png`);
    const trim = ["-ss", String(clip.start), "-t", String(clip.duration)];
    await run("ffmpeg", [
      "-y",
      ...trim,
      "-i",
      webmPath,
      "-vf",
      `${vf},palettegen=stats_mode=diff`,
      "-frames:v",
      "1",
      "-update",
      "1",
      palette,
    ]);
    await run("ffmpeg", [
      "-y",
      ...trim,
      "-i",
      webmPath,
      "-i",
      palette,
      "-lavfi",
      `${vf}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3`,
      path.join(docsDir, `${clip.name}.gif`),
    ]);
  }

  console.log(
    "\n✓ wrote docs/hero.gif, docs/task-map.gif, docs/review-path.gif and poster PNGs"
  );
} finally {
  server.kill();
}

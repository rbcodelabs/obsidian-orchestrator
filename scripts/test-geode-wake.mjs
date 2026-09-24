// Installed-app smoke: real WASM/models/audio processing with synthetic microphone input.
// Usage: GEODE_EXECUTABLE=... PLAYWRIGHT_PACKAGE=... node scripts/test-geode-wake.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(process.env.PLAYWRIGHT_PACKAGE || import.meta.url);
const { _electron } = require('@playwright/test');
assert.ok(process.env.GEODE_EXECUTABLE, 'Set GEODE_EXECUTABLE to the installed app binary');
const root = process.cwd();
const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'wake-test-vault-'));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'wake-test-profile-'));
const pluginDir = path.join(vault, '.geode/plugins/obsidian-orchestrator');
fs.mkdirSync(pluginDir, { recursive: true });
for (const file of ['main.js', 'manifest.json', 'styles.css', 'ort-wasm-simd-threaded.wasm', 'melspectrogram.onnx', 'embedding_model.onnx', 'hey_obsidian.onnx']) {
  fs.copyFileSync(path.join(root, 'dist', file), path.join(pluginDir, file));
}
fs.writeFileSync(path.join(vault, '.geode/plugins.json'), JSON.stringify(['obsidian-orchestrator']));
fs.writeFileSync(path.join(profile, 'geode.json'), JSON.stringify({ recentVaults: [vault], lastVault: vault }));
const env = { ...process.env, GEODE_HEADLESS: '1' };
delete env.ELECTRON_RUN_AS_NODE;
const app = await _electron.launch({ executablePath: process.env.GEODE_EXECUTABLE, args: [`--user-data-dir=${profile}`, '--headless'], env });
try {
  const page = await app.firstWindow();
  page.on('console', msg => { if (msg.type() === 'error') console.log('Renderer:', msg.text()); });
  await page.waitForFunction(() => globalThis.app?.pluginManager?.isEnabled('obsidian-orchestrator'));
  await page.evaluate(() => {
    globalThis.testMicStreams = [];
    globalThis.testMicContexts = [];
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext({ sampleRate: 16000 });
      const oscillator = context.createOscillator();
      const destination = context.createMediaStreamDestination();
      oscillator.connect(destination);
      oscillator.start();
      await context.resume();
      globalThis.testMicStreams.push(destination.stream);
      globalThis.testMicContexts.push(context);
      return destination.stream;
    };
    globalThis.app.commands.execute('open-settings');
  });
  await page.locator('.vertical-tab-nav-item').filter({ hasText: /^Orchestrator$/ }).click();
  await page.getByRole('button', { name: 'Calibrate', exact: true }).click();
  await page.getByRole('button', { name: 'Start calibration', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.voice-enroll-error, .voice-enroll-counter'), undefined, { timeout: 30000 });
  assert.equal(await page.locator('.voice-enroll-error').count(), 0, (await page.locator('.voice-enroll-error').allTextContents()).join('\n'));
  await page.getByRole('button', { name: 'Save calibration', exact: true }).waitFor({ timeout: 60000 });
  assert.equal(await page.locator('.voice-enroll-row').count(), 5);
  const scores = await page.locator('.voice-enroll-score-val').allTextContents();
  assert.ok(scores.every(score => Number.isFinite(Number(score))), JSON.stringify(scores));
  assert.equal(await page.evaluate(() => globalThis.testMicStreams.every(s => s.getTracks().every(t => t.readyState === 'ended'))), true, 'capture stopped after enrollment');
  fs.mkdirSync(path.join(root, 'docs/qa'), { recursive: true });
  await page.screenshot({ path: path.join(root, 'docs/qa/geode-wake-calibration.png') });
  await page.getByRole('button', { name: 'Save calibration', exact: true }).click();
  const templates = await page.evaluate(() => globalThis.app.pluginManager.getPlugin('obsidian-orchestrator').settings.enrollmentEmbeddings);
  assert.equal(templates.length, 3);
  assert.ok(templates.every(e => e.length === 96 && e.every(Number.isFinite)));
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Synthetic permission denial', 'NotAllowedError'); };
  });
  await page.getByRole('button', { name: /^(Re-calibrate|Calibrate)$/ }).click();
  await page.getByRole('button', { name: 'Start calibration', exact: true }).click();
  await page.locator('.voice-enroll-error').waitFor();
  assert.match(await page.locator('.voice-enroll-error').innerText(), /Could not start wake-word calibration:.*NotAllowedError/);
  console.log('PASS: real runtime and three models; five synthetic audio samples scored; calibration saved; microphone tracks stopped. Not a speech-accuracy test.');
  console.log('PASS: denied microphone access displays an accurate startup error.');
} finally {
  await app.close();
}

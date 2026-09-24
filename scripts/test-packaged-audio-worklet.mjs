// Actual Orchestrator capture against a built Geode, using synthetic audio only.
// Usage: GEODE_REPO=/path/to/built/geode node scripts/test-packaged-audio-worklet.mjs
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

assert.ok(process.env.GEODE_REPO, 'Set GEODE_REPO to a built Geode repository');
const geodeRepo = path.resolve(process.env.GEODE_REPO);
const require = createRequire(path.join(geodeRepo, 'package.json'));
const { _electron } = require('@playwright/test');
const consumerRoot = fileURLToPath(new URL('../', import.meta.url));
const bundle = await build({
  entryPoints: [path.join(consumerRoot, 'src/AudioCapture.ts')],
  bundle: true, write: false, format: 'iife', globalName: 'CaptureUnderTest', platform: 'browser',
});
const profile = mkdtempSync(path.join(os.tmpdir(), 'packaged-audio-worklet-'));
const env = { ...process.env, GEODE_HEADLESS: '1' };
delete env.ELECTRON_RUN_AS_NODE;
let app;
try {
  app = await _electron.launch({
    executablePath: require('electron'),
    args: [geodeRepo, `--user-data-dir=${profile}`, '--autoplay-policy=no-user-gesture-required'], env,
  });
  const page = await app.firstWindow();
  await page.waitForFunction(() => Boolean(globalThis.geode?.audioCaptureWorklet));
  await page.evaluate(code => (0, eval)(code), bundle.outputFiles[0].text);
  const evidence = await page.evaluate(async () => {
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    const ctx = new AudioContext({ sampleRate: 16000 });
    const oscillator = ctx.createOscillator();
    const destination = ctx.createMediaStreamDestination();
    const originalBlob = URL.createObjectURL;
    const originalGetUserMedia = navigator.mediaDevices.getUserMedia;
    let capture;
    let callbacks = 0;
    let nonzero = 0;
    const moduleUrls = [];
    const originalAddModule = ctx.audioWorklet.addModule.bind(ctx.audioWorklet);
    ctx.audioWorklet.addModule = async url => { moduleUrls.push(url); return originalAddModule(url); };
    ctx.createScriptProcessor = () => { throw new Error('Unexpected ScriptProcessor fallback'); };
    URL.createObjectURL = () => { throw new Error('Unexpected blob capture'); };
    navigator.mediaDevices.getUserMedia = () => { throw new Error('Microphone access forbidden in this test'); };
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const waitForPcm = async () => {
      const deadline = performance.now() + 10000;
      while (!nonzero && performance.now() < deadline) await wait(20);
      assert(nonzero > 0, 'Expected nonzero PCM from the actual capture implementation');
    };
    const onSamples = samples => {
      assert(samples instanceof Float32Array, 'Expected Float32Array PCM');
      callbacks++;
      if (samples.some(sample => Math.abs(sample) > 0.01)) nonzero++;
    };
    try {
      oscillator.connect(destination);
      oscillator.start();
      await ctx.resume();
      capture = await CaptureUnderTest.attachAudioCapture(ctx, destination.stream, onSamples);
      await waitForPcm();
      capture.disconnect();
      const firstCallbacks = callbacks;
      await wait(150);
      assert(callbacks === firstCallbacks, 'Callbacks continued after disconnect');
      nonzero = 0;
      capture = await CaptureUnderTest.attachAudioCapture(ctx, destination.stream, onSamples);
      await waitForPcm();
      capture.disconnect();
      const secondCallbacks = callbacks;
      await wait(150);
      assert(callbacks === secondCallbacks, 'Repeated capture callbacks continued after disconnect');
      assert(moduleUrls.length === 1, 'Packaged module was registered more than once');
      assert(moduleUrls[0] === globalThis.geode.audioCaptureWorklet.moduleUrl, 'Wrong capture module loaded');
      return { sampleRate: ctx.sampleRate, firstCallbacks, secondCallbacks, moduleRegistrations: moduleUrls.length };
    } finally {
      capture?.disconnect();
      oscillator.stop();
      oscillator.disconnect();
      destination.stream.getTracks().forEach(track => track.stop());
      await ctx.close();
      URL.createObjectURL = originalBlob;
      navigator.mediaDevices.getUserMedia = originalGetUserMedia;
    }
  });
  console.log('PASS: actual Orchestrator packaged capture; nonzero synthetic PCM, same-context reattachment, one registration, callbacks stop on disconnect; no blob, fallback, or microphone access.', evidence);
} finally {
  try { await app?.close(); }
  finally { rmSync(profile, { recursive: true, force: true }); }
}

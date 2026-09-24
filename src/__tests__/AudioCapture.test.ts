import { afterEach, expect, it, vi } from 'vitest';
import { attachAudioCapture } from '../AudioCapture';
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function setup(blocked: boolean) {
  const source = { connect: vi.fn(), disconnect: vi.fn() };
  const fallback = { connect: vi.fn(), disconnect: vi.fn(), onaudioprocess: null as any };
  const worklet = { connect: vi.fn(), disconnect: vi.fn(), port: { onmessage: null as any, close: vi.fn() } };
  vi.stubGlobal('AudioWorkletNode', class { constructor() { return worklet; } });
  const revoke = vi.spyOn(URL, 'revokeObjectURL');
  const context = {
    audioWorklet: { addModule: blocked ? vi.fn().mockRejectedValue(new DOMException('CSP blocked', 'AbortError')) : vi.fn().mockResolvedValue(undefined) },
    createMediaStreamSource: vi.fn(() => source), createScriptProcessor: vi.fn(() => fallback), destination: {},
  };
  return { source, fallback, worklet, context, revoke };
}

it('captures PCM with silent ScriptProcessor output when worklet loading is blocked', async () => {
  const { source, fallback, context, revoke } = setup(true);
  const samples = vi.fn();
  const capture = await attachAudioCapture(context as never, {} as never, samples);
  expect(context.createScriptProcessor).toHaveBeenCalledWith(2048, 1, 1);
  expect(source.connect).toHaveBeenCalledWith(fallback);
  expect(fallback.connect).toHaveBeenCalledWith(context.destination);
  const input = new Float32Array([0.2, 0.3]);
  const output = new Float32Array([1, 1]);
  fallback.onaudioprocess({ inputBuffer: { getChannelData: () => input }, outputBuffer: { numberOfChannels: 1, getChannelData: () => output } });
  expect(samples).toHaveBeenCalledWith(input);
  expect([...output]).toEqual([0, 0]);
  expect(revoke).toHaveBeenCalled();
  capture.disconnect();
  expect(source.disconnect).toHaveBeenCalled();
  expect(fallback.disconnect).toHaveBeenCalled();
  expect(fallback.onaudioprocess).toBeNull();
});

const packaged = { moduleUrl: 'file:///app/audio/pcm-capture.js', processorName: 'geode-pcm-capture-v1' };

it('prefers packaged capture without creating a blob and pulls silent output', async () => {
  const { context, worklet } = setup(false);
  vi.stubGlobal('geode', { audioCaptureWorklet: packaged });
  const createBlob = vi.spyOn(URL, 'createObjectURL');
  const samples = vi.fn();
  const capture = await attachAudioCapture(context as never, {} as never, samples);
  expect(context.audioWorklet.addModule).toHaveBeenCalledWith(packaged.moduleUrl);
  expect(createBlob).not.toHaveBeenCalled();
  expect(worklet.connect).toHaveBeenCalledWith(context.destination);
  worklet.port.onmessage({ data: new Float32Array([0.25]) });
  expect(samples).toHaveBeenCalledWith(new Float32Array([0.25]));
  capture.disconnect();
  expect(worklet.port.onmessage).toBeNull();
  expect(worklet.port.close).toHaveBeenCalledOnce();
});

it('registers packaged module once for simultaneous and repeated captures per context', async () => {
  const { context } = setup(false);
  vi.stubGlobal('geode', { audioCaptureWorklet: packaged });
  const captures = await Promise.all([attachAudioCapture(context as never, {} as never, vi.fn()), attachAudioCapture(context as never, {} as never, vi.fn())]);
  captures.forEach(capture => capture.disconnect());
  (await attachAudioCapture(context as never, {} as never, vi.fn())).disconnect();
  expect(context.audioWorklet.addModule).toHaveBeenCalledTimes(1);
  const other = setup(false);
  (await attachAudioCapture(other.context as never, {} as never, vi.fn())).disconnect();
  expect(other.context.audioWorklet.addModule).toHaveBeenCalledOnce();
});

it('retries rejected packaged registration and uses buffered fallback without blobs', async () => {
  const { context } = setup(true);
  vi.stubGlobal('geode', { audioCaptureWorklet: packaged });
  const createBlob = vi.spyOn(URL, 'createObjectURL');
  (await attachAudioCapture(context as never, {} as never, vi.fn())).disconnect();
  expect(context.createScriptProcessor).toHaveBeenCalledOnce();
  context.audioWorklet.addModule.mockResolvedValue(undefined);
  (await attachAudioCapture(context as never, {} as never, vi.fn())).disconnect();
  expect(context.audioWorklet.addModule).toHaveBeenCalledTimes(2);
  expect(context.createScriptProcessor).toHaveBeenCalledOnce();
  expect(createBlob).not.toHaveBeenCalled();
});

it('cleans a partially connected worklet before buffered fallback', async () => {
  const { context, worklet, source } = setup(false);
  vi.stubGlobal('geode', { audioCaptureWorklet: packaged });
  worklet.connect.mockImplementation(() => { throw new Error('connection failed'); });
  const capture = await attachAudioCapture(context as never, {} as never, vi.fn());
  expect(worklet.port.onmessage).toBeNull();
  expect(worklet.port.close).toHaveBeenCalledOnce();
  expect(worklet.disconnect).toHaveBeenCalledOnce();
  expect(source.disconnect).toHaveBeenCalled();
  expect(context.createScriptProcessor).toHaveBeenCalledOnce();
  capture.disconnect();
});

it('retains AudioWorklet capture when the host allows it', async () => {
  const { context, source, worklet } = setup(false);
  const samples = vi.fn();
  const capture = await attachAudioCapture(context as never, {} as never, samples);
  expect(context.createScriptProcessor).not.toHaveBeenCalled();
  expect(source.connect).toHaveBeenCalledWith(worklet);
  const pcm = new Float32Array([0.5]);
  worklet.port.onmessage({ data: pcm });
  expect(samples).toHaveBeenCalledWith(pcm);
  capture.disconnect();
  expect(worklet.port.close).toHaveBeenCalled();
  expect(source.disconnect).toHaveBeenCalled();
});

it('uses buffered capture when AudioWorklet is not available', async () => {
  const { context, fallback } = setup(false);
  vi.stubGlobal('AudioWorkletNode', undefined);
  const capture = await attachAudioCapture(context as never, {} as never, vi.fn());
  expect(context.audioWorklet.addModule).not.toHaveBeenCalled();
  expect(fallback.connect).toHaveBeenCalled();
  capture.disconnect();
});

it('falls back when packaged node construction fails', async () => {
  const { context, fallback } = setup(false);
  vi.stubGlobal('geode', { audioCaptureWorklet: packaged });
  vi.stubGlobal('AudioWorkletNode', class { constructor() { throw new Error('processor unavailable'); } });
  const capture = await attachAudioCapture(context as never, {} as never, vi.fn());
  expect(fallback.connect).toHaveBeenCalledWith(context.destination);
  capture.disconnect();
});

it('cleans buffered capture if the fallback cannot connect', async () => {
  const { context, fallback, source } = setup(true);
  fallback.connect.mockImplementation(() => { throw new Error('destination unavailable'); });
  await expect(attachAudioCapture(context as never, {} as never, vi.fn())).rejects.toThrow('destination unavailable');
  expect(fallback.onaudioprocess).toBeNull();
  expect(fallback.disconnect).toHaveBeenCalledOnce();
  expect(source.disconnect).toHaveBeenCalledOnce();
});

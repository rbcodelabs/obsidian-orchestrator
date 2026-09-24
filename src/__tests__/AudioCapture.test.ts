import { afterEach, expect, it, vi } from 'vitest';
import { attachAudioCapture } from '../AudioCapture';
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function setup(blocked: boolean) {
  const source = { connect: vi.fn(), disconnect: vi.fn() };
  const fallback = { connect: vi.fn(), disconnect: vi.fn(), onaudioprocess: null as any };
  const worklet = { disconnect: vi.fn(), port: { onmessage: null as any, close: vi.fn() } };
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

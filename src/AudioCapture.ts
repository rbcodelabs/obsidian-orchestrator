interface PackagedCaptureWorklet { moduleUrl: string; processorName: string }
const packagedRegistrations = new WeakMap<AudioContext, Promise<void>>();
let captureSequence = 0;

function registerPackagedWorklet(context: AudioContext, capability: PackagedCaptureWorklet): Promise<void> {
  let registration = packagedRegistrations.get(context);
  if (!registration) {
    registration = context.audioWorklet.addModule(capability.moduleUrl).catch(error => {
      packagedRegistrations.delete(context);
      throw error;
    });
    packagedRegistrations.set(context, registration);
  }
  return registration;
}

export async function attachAudioCapture(context: AudioContext, stream: MediaStream, onSamples: (samples: Float32Array) => void): Promise<{ disconnect(): void }> {
  const packaged = (globalThis as typeof globalThis & { geode?: { audioCaptureWorklet?: PackagedCaptureWorklet } }).geode?.audioCaptureWorklet;
  const processorName = packaged?.processorName ?? `wake-pcm-${Date.now()}-${++captureSequence}`;
  let workletReady = false;
  if (context.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
    let url: string | undefined;
    try {
      if (packaged) {
        await registerPackagedWorklet(context, packaged);
      } else {
        url = URL.createObjectURL(new Blob([`
class PCMCapture extends AudioWorkletProcessor {
  process(inputs, outputs) {
    for (const output of outputs) for (const channel of output) channel.fill(0);
    const channel = inputs[0]?.[0];
    if (channel?.length) this.port.postMessage(channel);
    return true;
  }
}
registerProcessor('${processorName}', PCMCapture);
`], { type: 'application/javascript' }));
        await context.audioWorklet.addModule(url);
      }
      workletReady = true;
    } catch (error) {
      // Older hosts may block blob scripts; a packaged module can also fail to
      // load. Keep capture available without weakening the host's security policy.
      console.warn('[WakeWord] AudioWorklet unavailable; using buffered PCM capture.', error);
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  }

  const source = context.createMediaStreamSource(stream);
  if (workletReady) {
    let node: AudioWorkletNode | undefined;
    const disconnect = () => {
      if (node) { node.port.onmessage = null; node.port.close(); node.disconnect(); }
      source.disconnect();
    };
    try {
      node = new AudioWorkletNode(context, processorName);
      node.port.onmessage = (event: MessageEvent<Float32Array>) => onSamples(event.data);
      source.connect(node);
      // Both processors output silence. Connect the output to keep capture pulled
      // even when there are no other active nodes in the graph.
      node.connect(context.destination);
      return { disconnect };
    } catch (error) {
      disconnect();
      console.warn('[WakeWord] AudioWorklet connection failed; using buffered PCM capture.', error);
    }
  }

  // Deprecated but still available in desktop Chromium. Unlike a worklet this
  // runs on the renderer thread; only copy PCM here, never run model inference.
  const node = context.createScriptProcessor(2048, 1, 1);
  node.onaudioprocess = event => {
    for (let channel = 0; channel < event.outputBuffer.numberOfChannels; channel++) {
      event.outputBuffer.getChannelData(channel).fill(0);
    }
    onSamples(event.inputBuffer.getChannelData(0));
  };
  const disconnect = () => { node.onaudioprocess = null; source.disconnect(); node.disconnect(); };
  try {
    source.connect(node);
    // ScriptProcessor needs a destination to be pulled. Its output is silence,
    // so this never plays the captured microphone back through the speakers.
    node.connect(context.destination);
    return { disconnect };
  } catch (error) {
    disconnect();
    throw error;
  }
}

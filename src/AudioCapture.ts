export async function attachAudioCapture(context: AudioContext, stream: MediaStream, onSamples: (samples: Float32Array) => void): Promise<{ disconnect(): void }> {
  const processorName = `wake-pcm-${Date.now()}`;
  let workletReady = false;
  if (context.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
    const url = URL.createObjectURL(new Blob([`
class PCMCapture extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel?.length) this.port.postMessage(channel);
    return true;
  }
}
registerProcessor('${processorName}', PCMCapture);
`], { type: 'application/javascript' }));
    try {
      await context.audioWorklet.addModule(url);
      workletReady = true;
    } catch (error) {
      // Geode disallows blob scripts. Fall back to its supported Web Audio API
      // without changing CSP or fetching executable code from another origin.
      console.warn('[WakeWord] AudioWorklet unavailable; using buffered PCM capture.', error);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const source = context.createMediaStreamSource(stream);
  if (workletReady) {
    const node = new AudioWorkletNode(context, processorName);
    node.port.onmessage = (event: MessageEvent<Float32Array>) => onSamples(event.data);
    source.connect(node);
    return { disconnect() { source.disconnect(); node.port.close(); node.disconnect(); } };
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
  source.connect(node);
  // ScriptProcessor needs a destination to be pulled. Its output is silence,
  // so this never plays the captured microphone back through the speakers.
  node.connect(context.destination);
  return { disconnect() { node.onaudioprocess = null; source.disconnect(); node.disconnect(); } };
}

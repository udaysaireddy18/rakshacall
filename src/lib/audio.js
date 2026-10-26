/**
 * Browser audio helpers.
 *
 * Audio is captured from the microphone, converted to 16 kHz mono and analysed
 * in memory. Nothing is uploaded, recorded to disk or sent anywhere.
 */

export const TARGET_RATE = 16000;

/** Linear-interpolation resampler with state, so chunked audio stays continuous. */
export class Resampler {
  constructor(sourceRate, targetRate = TARGET_RATE) {
    this.ratio = sourceRate / targetRate;
    this.phase = 0;
    this.carry = new Float32Array(0);
  }

  process(input) {
    if (!input || !input.length) return new Float32Array(0);
    if (Math.abs(this.ratio - 1) < 1e-9) return new Float32Array(input);

    const buf = new Float32Array(this.carry.length + input.length);
    buf.set(this.carry, 0);
    buf.set(input, this.carry.length);

    const outLen = Math.max(0, Math.floor((buf.length - 1 - this.phase) / this.ratio) + 1);
    const out = new Float32Array(outLen);
    const lastIndex = buf.length - 1;
    let pos = this.phase;

    for (let i = 0; i < outLen; i++) {
      const i0 = Math.floor(pos);
      const frac = pos - i0;
      const a = buf[Math.min(i0, lastIndex)];
      const b = buf[Math.min(i0 + 1, lastIndex)];
      out[i] = a + (b - a) * frac;
      pos += this.ratio;
    }

    const keepFrom = Math.min(Math.floor(pos), lastIndex);
    this.carry = buf.slice(keepFrom);
    this.phase = pos - keepFrom;
    return out;
  }
}

/** Resample a whole buffer (offline, used for uploaded files). */
export function resampleBuffer(samples, sourceRate, targetRate = TARGET_RATE) {
  if (sourceRate === targetRate) return Float32Array.from(samples);
  const ratio = sourceRate / targetRate;
  const outLength = Math.floor(samples.length / ratio);
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const frac = pos - i0;
    const a = samples[i0] ?? 0;
    const b = samples[i0 + 1] ?? a;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

const getAudioContext = () => {
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) throw new Error('This browser does not support the Web Audio API.');
  return new Ctor();
};

function mixToMono(audioBuffer) {
  const { numberOfChannels, length } = audioBuffer;
  const mono = new Float32Array(length);
  for (let c = 0; c < numberOfChannels; c++) {
    const channel = audioBuffer.getChannelData(c);
    for (let i = 0; i < length; i++) mono[i] += channel[i] / numberOfChannels;
  }
  return mono;
}

/** Decode an uploaded audio file (wav/mp3/m4a/ogg/webm) to 16 kHz mono. */
export async function decodeFileToMono(file) {
  const arrayBuffer = await file.arrayBuffer();
  const ctx = getAudioContext();
  try {
    const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const mono = mixToMono(decoded);
    return resampleBuffer(mono, decoded.sampleRate, TARGET_RATE);
  } finally {
    ctx.close().catch(() => {});
  }
}

/**
 * Record from the microphone until `stop()` resolves with the full 16 kHz signal.
 * Good for enrolment (5–10 seconds).
 */
export async function startMicRecording({ onLevel } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });

  const ctx = getAudioContext();
  if (ctx.state === 'suspended') await ctx.resume();

  const source = ctx.createMediaStreamSource(stream);
  const resampler = new Resampler(ctx.sampleRate, TARGET_RATE);
  const chunks = [];
  let totalSamples = 0;

  const processor = ctx.createScriptProcessor(4096, 1, 1);
  processor.onaudioprocess = (event) => {
    const input = event.inputBuffer.getChannelData(0);
    const out = resampler.process(input);
    if (out.length) {
      chunks.push(out);
      totalSamples += out.length;
    }
    if (onLevel) {
      let sum = 0;
      for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
      onLevel(Math.sqrt(sum / input.length));
    }
  };

  // a zero-gain sink keeps the processor pulling without echoing to speakers
  const sink = ctx.createGain();
  sink.gain.value = 0;
  source.connect(processor);
  processor.connect(sink);
  sink.connect(ctx.destination);

  const cleanup = () => {
    try { processor.disconnect(); } catch { /* ignore */ }
    try { source.disconnect(); } catch { /* ignore */ }
    try { sink.disconnect(); } catch { /* ignore */ }
    stream.getTracks().forEach((t) => t.stop());
    ctx.close().catch(() => {});
  };

  return {
    stop() {
      return new Promise((resolve) => {
        // let the last audio block flush
        setTimeout(() => {
          cleanup();
          const merged = new Float32Array(totalSamples);
          let offset = 0;
          for (const chunk of chunks) {
            merged.set(chunk, offset);
            offset += chunk.length;
          }
          resolve({ samples: merged, sampleRate: TARGET_RATE, durationSec: merged.length / TARGET_RATE });
        }, 120);
      });
    },
    cancel() {
      cleanup();
    },
    get durationSec() {
      return totalSamples / TARGET_RATE;
    },
  };
}

/**
 * Continuous capture with a rolling 30 s ring buffer, used by the live call screen.
 * The caller periodically grabs the last few seconds with `getWindow()`.
 */
export async function startLiveCapture({ onLevel } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });

  const ctx = getAudioContext();
  if (ctx.state === 'suspended') await ctx.resume();

  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.7;
  source.connect(analyser);

  const resampler = new Resampler(ctx.sampleRate, TARGET_RATE);
  const ringSize = TARGET_RATE * 30;
  const ring = new Float32Array(ringSize);
  let writePos = 0;
  let filled = 0;

  const processor = ctx.createScriptProcessor(4096, 1, 1);
  processor.onaudioprocess = (event) => {
    const input = event.inputBuffer.getChannelData(0);
    const out = resampler.process(input);
    for (let i = 0; i < out.length; i++) {
      ring[writePos] = out[i];
      writePos = (writePos + 1) % ringSize;
      if (filled < ringSize) filled++;
    }
    if (onLevel) {
      let sum = 0;
      for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
      onLevel(Math.sqrt(sum / input.length));
    }
  };

  const sink = ctx.createGain();
  sink.gain.value = 0;
  source.connect(processor);
  processor.connect(sink);
  sink.connect(ctx.destination);

  let stopped = false;

  return {
    analyser,
    sampleRate: TARGET_RATE,
    get filledSamples() {
      return filled;
    },
    /** last `seconds` of audio, oldest → newest */
    getWindow(seconds = 3) {
      const wanted = Math.min(filled, Math.floor(seconds * TARGET_RATE));
      const out = new Float32Array(wanted);
      if (!wanted) return out;
      const start = (writePos - wanted + ringSize) % ringSize;
      for (let i = 0; i < wanted; i++) out[i] = ring[(start + i) % ringSize];
      return out;
    },
    reset() {
      writePos = 0;
      filled = 0;
    },
    stop() {
      if (stopped) return;
      stopped = true;
      try { processor.disconnect(); } catch { /* ignore */ }
      try { source.disconnect(); } catch { /* ignore */ }
      try { sink.disconnect(); } catch { /* ignore */ }
      stream.getTracks().forEach((t) => t.stop());
      ctx.close().catch(() => {});
    },
  };
}

/** Short alert tone for high-risk moments (best effort, never throws). */
let alarmCtx = null;
export function playAlarm() {
  try {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    alarmCtx = alarmCtx || new Ctor();
    if (alarmCtx.state === 'suspended') alarmCtx.resume().catch(() => {});
    const now = alarmCtx.currentTime;
    [0, 0.28].forEach((offset, index) => {
      const osc = alarmCtx.createOscillator();
      const gain = alarmCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = index === 0 ? 880 : 660;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.18, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.22);
      osc.connect(gain);
      gain.connect(alarmCtx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.25);
    });
  } catch {
    /* audio alerts are optional */
  }
}

export function vibrate(pattern = [180, 90, 180]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/* live speech-to-text (optional, Chrome/Edge)                         */
/* ------------------------------------------------------------------ */

export function speechSupported() {
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function createSpeechRecognizer({ lang = 'en-IN', onText, onError, onStateChange } = {}) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) return null;

  const recognition = new Recognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = lang;
  recognition.maxAlternatives = 1;

  let finalText = '';
  let running = false;
  let restartTimer = null;

  const emit = () => onText?.(finalText.trim());

  recognition.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const transcript = result[0]?.transcript ?? '';
      if (result.isFinal) finalText = `${finalText} ${transcript}`.trim();
      else interim += transcript;
    }
    onText?.(`${finalText} ${interim}`.trim());
  };

  recognition.onerror = (event) => {
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      running = false;
      onError?.('Microphone or speech service permission was blocked.');
      onStateChange?.(false);
      return;
    }
    if (event.error === 'no-speech' || event.error === 'aborted') return;
    onError?.(`Speech recognition: ${event.error}`);
  };

  recognition.onend = () => {
    if (running) {
      restartTimer = setTimeout(() => {
        try { recognition.start(); } catch { /* already started */ }
      }, 400);
    } else {
      onStateChange?.(false);
    }
  };

  return {
    start() {
      running = true;
      try {
        recognition.start();
        onStateChange?.(true);
      } catch (error) {
        onError?.(String(error?.message || error));
      }
    },
    stop() {
      running = false;
      clearTimeout(restartTimer);
      try { recognition.stop(); } catch { /* ignore */ }
      onStateChange?.(false);
    },
    reset() {
      finalText = '';
      emit();
    },
    setLanguage(next) {
      recognition.lang = next;
    },
    get running() {
      return running;
    },
  };
}

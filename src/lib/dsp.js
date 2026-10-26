/**
 * Pure signal-processing helpers.
 *
 * Everything in this file is plain JavaScript with no browser APIs, so it can be
 * unit-tested in Node (`npm run test:dsp`) and reused in a worker later.
 *
 * Pipeline per frame:
 *   DC removal -> pre-emphasis (0.97) -> Hamming window -> FFT (512) -> magnitude
 *   -> mel filterbank (26) -> log -> DCT-II -> 12 MFCCs (per-frame mean normalised)
 *   plus energy, ZCR, spectral centroid, spectral flatness, HF ratio, spectral flux,
 *   F0 (normalised autocorrelation) and a harmonic-to-noise proxy.
 */

export const TARGET_SAMPLE_RATE = 16000;
export const FRAME_SIZE = 512; // 32 ms at 16 kHz
export const HOP_SIZE = 160; // 10 ms
export const NUM_MEL = 26;
export const NUM_MFCC = 12;
export const MIN_F0 = 70;
export const MAX_F0 = 400;

/* ------------------------------------------------------------------ */
/* small maths helpers                                                 */
/* ------------------------------------------------------------------ */

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function mean(arr) {
  if (!arr.length) return 0;
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return s / arr.length;
}

export function std(arr, average = mean(arr)) {
  if (arr.length < 2) return 0;
  let s = 0;
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i] - average;
    s += d * d;
  }
  return Math.sqrt(s / (arr.length - 1));
}

export function median(arr) {
  if (!arr.length) return 0;
  const s = Array.from(arr).sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function percentileSorted(sorted, p) {
  if (!sorted.length) return 0;
  const idx = clamp(Math.round((sorted.length - 1) * p), 0, sorted.length - 1);
  return sorted[idx];
}

export function percentile(arr, p) {
  return percentileSorted(Array.from(arr).sort((a, b) => a - b), p);
}

export function cosine(a, b) {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na < 1e-12 || nb < 1e-12) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/* ------------------------------------------------------------------ */
/* FFT (iterative radix-2, cached twiddles + bit-reversal)             */
/* ------------------------------------------------------------------ */

const fftPlans = new Map();

function getFftPlan(n) {
  let plan = fftPlans.get(n);
  if (plan) return plan;
  const levels = Math.round(Math.log2(n));
  if (2 ** levels !== n) throw new Error(`FFT size must be a power of two (got ${n})`);
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < levels; b++) r |= ((i >> b) & 1) << (levels - 1 - b);
    rev[i] = r;
  }
  const cos = new Float64Array(n / 2);
  const sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    cos[i] = Math.cos((2 * Math.PI * i) / n);
    sin[i] = -Math.sin((2 * Math.PI * i) / n);
  }
  plan = { n, rev, cos, sin };
  fftPlans.set(n, plan);
  return plan;
}

/** In-place complex FFT. `re`/`im` must both be length n (power of two). */
export function fftInPlace(re, im, plan = getFftPlan(re.length)) {
  const { n, rev, cos, sin } = plan;
  for (let i = 0; i < n; i++) {
    const j = rev[i];
    if (j > i) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const step = n / size;
    for (let i = 0; i < n; i += size) {
      for (let j = i, k = 0; j < i + half; j++, k += step) {
        const l = j + half;
        const tre = re[l] * cos[k] - im[l] * sin[k];
        const tim = re[l] * sin[k] + im[l] * cos[k];
        re[l] = re[j] - tre;
        im[l] = im[j] - tim;
        re[j] += tre;
        im[j] += tim;
      }
    }
  }
}

export function magnitudeSpectrum(frame, fftSize = FRAME_SIZE) {
  const re = new Float64Array(fftSize);
  const im = new Float64Array(fftSize);
  const n = Math.min(frame.length, fftSize);
  for (let i = 0; i < n; i++) re[i] = frame[i];
  fftInPlace(re, im);
  const bins = fftSize / 2 + 1;
  const mag = new Float64Array(bins);
  for (let b = 0; b < bins; b++) mag[b] = Math.hypot(re[b], im[b]);
  return mag;
}

/* ------------------------------------------------------------------ */
/* windows, mel scale, DCT                                             */
/* ------------------------------------------------------------------ */

const windowCache = new Map();

export function hamming(n) {
  let w = windowCache.get(n);
  if (w) return w;
  w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (n - 1));
  windowCache.set(n, w);
  return w;
}

const hzToMel = (f) => 2595 * Math.log10(1 + f / 700);
const melToHz = (m) => 700 * (10 ** (m / 2595) - 1);

const melCache = new Map();

/**
 * Triangular mel filters. Defaults cover 80 Hz .. 7.7 kHz at 16 kHz.
 * Higher bands are simply empty for narrowband (8 kHz) telephone audio — the
 * similarity score does not rely on them.
 */
export function melFilterbank(sampleRate = TARGET_SAMPLE_RATE, fftSize = FRAME_SIZE, numFilters = NUM_MEL) {
  const key = `${sampleRate}:${fftSize}:${numFilters}`;
  const cached = melCache.get(key);
  if (cached) return cached;

  const bins = fftSize / 2 + 1;
  const fMin = 80;
  const fMax = Math.min(7700, sampleRate / 2 - 100);
  const melMin = hzToMel(fMin);
  const melMax = hzToMel(fMax);

  const points = new Float64Array(numFilters + 2);
  for (let i = 0; i < numFilters + 2; i++) {
    points[i] = melToHz(melMin + ((melMax - melMin) * i) / (numFilters + 1));
  }

  const filters = [];
  for (let m = 1; m <= numFilters; m++) {
    const f = new Float64Array(bins);
    const left = points[m - 1];
    const center = points[m];
    const right = points[m + 1];
    for (let b = 0; b < bins; b++) {
      const hz = (b * sampleRate) / fftSize;
      let v = 0;
      if (hz >= left && hz <= center) v = (hz - left) / Math.max(1e-9, center - left);
      else if (hz > center && hz <= right) v = (right - hz) / Math.max(1e-9, right - center);
      f[b] = v;
    }
    filters.push(f);
  }

  melCache.set(key, filters);
  return filters;
}

/** DCT-II. Scaling is irrelevant for cosine similarity, so it is left unnormalised. */
export function dct2(input, numCoeffs) {
  const N = input.length;
  const out = new Float64Array(numCoeffs);
  for (let k = 0; k < numCoeffs; k++) {
    let sum = 0;
    for (let n = 0; n < N; n++) sum += input[n] * Math.cos((Math.PI * k * (n + 0.5)) / N);
    out[k] = sum;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* pitch / harmonicity                                                 */
/* ------------------------------------------------------------------ */

const minLagFor = (sr) => Math.floor(sr / MAX_F0);
const maxLagFor = (sr) => Math.floor(sr / MIN_F0);

/**
 * Normalised autocorrelation pitch estimate with parabolic interpolation.
 * Returns { f0, strength } where strength is 0..1 (periodicity).
 */
export function estimateF0(frame, sampleRate = TARGET_SAMPLE_RATE) {
  const minLag = minLagFor(sampleRate);
  const maxLag = Math.min(maxLagFor(sampleRate), frame.length - 8);
  if (maxLag <= minLag) return { f0: 0, strength: 0 };

  // Work on a fixed 320-sample analysis window to bound the cost.
  const n = Math.min(320, frame.length);
  let r0 = 0;
  for (let i = 0; i < n; i++) r0 += frame[i] * frame[i];
  if (r0 < 1e-7) return { f0: 0, strength: 0 };

  const values = new Float64Array(maxLag + 1);
  let bestLag = 0;
  let bestVal = 0;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    let e1 = 0;
    let e2 = 0;
    const limit = Math.min(n, frame.length - lag);
    for (let i = 0; i < limit; i++) {
      const a = frame[i];
      const b = frame[i + lag];
      sum += a * b;
      e1 += a * a;
      e2 += b * b;
    }
    const denom = Math.sqrt(e1 * e2) + 1e-12;
    const v = sum / denom;
    values[lag] = v;
    if (v > bestVal) {
      bestVal = v;
      bestLag = lag;
    }
  }

  if (!bestLag) return { f0: 0, strength: 0 };

  let refined = bestLag;
  if (bestLag > minLag && bestLag < maxLag) {
    const a = values[bestLag - 1];
    const b = values[bestLag];
    const c = values[bestLag + 1];
    const denom = a - 2 * b + c;
    if (Math.abs(denom) > 1e-9) refined = bestLag + (0.5 * (a - c)) / denom;
  }

  return {
    f0: sampleRate / Math.max(1e-6, refined),
    strength: clamp(bestVal, 0, 1),
  };
}

/* ------------------------------------------------------------------ */
/* frame level features                                                */
/* ------------------------------------------------------------------ */

const energyPercentile = (frames) =>
  Array.from(frames, (f) => f.logEnergy).sort((a, b) => a - b);

/**
 * Extract per-frame features + voice activity flags.
 * @param {Float32Array|number[]} samples mono PCM
 */
export function extractFrameFeatures(samples, sampleRate = TARGET_SAMPLE_RATE) {
  if (!samples || samples.length < FRAME_SIZE) {
    throw new Error('Audio is too short. Please record at least 1.5 seconds.');
  }

  const filters = melFilterbank(sampleRate);
  const win = hamming(FRAME_SIZE);
  const bins = FRAME_SIZE / 2 + 1;
  const frames = [];

  let previousMagnitude = null;

  for (let start = 0; start + FRAME_SIZE <= samples.length; start += HOP_SIZE) {
    const raw = new Float64Array(FRAME_SIZE);
    let dc = 0;
    for (let i = 0; i < FRAME_SIZE; i++) {
      raw[i] = samples[start + i];
      dc += raw[i];
    }
    dc /= FRAME_SIZE;

    let energy = 0;
    let crossings = 0;
    let previousSign = 0;

    for (let i = 0; i < FRAME_SIZE; i++) {
      raw[i] -= dc;
      energy += raw[i] * raw[i];
      const sign = raw[i] >= 0 ? 1 : -1;
      if (i > 0 && sign !== previousSign) crossings++;
      previousSign = sign;
    }

    const rms = Math.sqrt(energy / FRAME_SIZE);
    const logEnergy = 20 * Math.log10(rms + 1e-8);
    const zcr = crossings / (FRAME_SIZE - 1);

    // pre-emphasis + window, then FFT
    const re = new Float64Array(FRAME_SIZE);
    const im = new Float64Array(FRAME_SIZE);
    let previousSample = 0;
    for (let i = 0; i < FRAME_SIZE; i++) {
      const emphasised = raw[i] - 0.97 * previousSample;
      previousSample = raw[i];
      re[i] = emphasised * win[i];
    }
    fftInPlace(re, im);

    const magnitude = new Float64Array(bins);
    let magnitudeSum = 0;
    for (let b = 0; b < bins; b++) {
      magnitude[b] = Math.hypot(re[b], im[b]);
      magnitudeSum += magnitude[b];
    }

    // spectral centroid
    let centroidNum = 0;
    for (let b = 0; b < bins; b++) centroidNum += ((b * sampleRate) / FRAME_SIZE) * magnitude[b];
    const centroid = magnitudeSum > 1e-9 ? centroidNum / magnitudeSum : 0;

    // spectral flatness (power domain, bins 1.. end)
    let logPowerSum = 0;
    let powerSum = 0;
    for (let b = 1; b < bins; b++) {
      const p = magnitude[b] * magnitude[b] + 1e-12;
      logPowerSum += Math.log(p);
      powerSum += p;
    }
    const geometric = Math.exp(logPowerSum / (bins - 1));
    const flatness = powerSum > 0 ? clamp(geometric / (powerSum / (bins - 1)), 0, 1) : 0;

    // high frequency energy ratio (8 kHz sample rate: everything above 3 kHz)
    const hfCut = Math.min(5500, sampleRate / 2 - 400);
    let highEnergy = 0;
    let totalEnergy = 0;
    for (let b = 0; b < bins; b++) {
      const p = magnitude[b] * magnitude[b];
      totalEnergy += p;
      if ((b * sampleRate) / FRAME_SIZE >= hfCut) highEnergy += p;
    }
    const hfRatio = totalEnergy > 0 ? highEnergy / totalEnergy : 0;

    // spectral flux (normalised)
    let flux = 0;
    if (previousMagnitude) {
      let diff = 0;
      let energyA = 0;
      let energyB = 0;
      for (let b = 0; b < bins; b++) {
        const a = magnitude[b];
        const c = previousMagnitude[b];
        diff += (a - c) * (a - c);
        energyA += a * a;
        energyB += c * c;
      }
      flux = diff / (Math.sqrt(energyA * energyB) + 1e-9);
    }
    previousMagnitude = magnitude;

    // mel -> log -> DCT -> MFCC (skip c0, which is loudness)
    const melEnergies = new Float64Array(NUM_MEL);
    for (let m = 0; m < NUM_MEL; m++) {
      const filter = filters[m];
      let sum = 0;
      for (let b = 0; b < bins; b++) sum += filter[b] * magnitude[b] * magnitude[b];
      melEnergies[m] = Math.log(sum + 1e-10);
    }
    const cepstrum = dct2(melEnergies, NUM_MFCC + 1);
    const mfcc = new Float32Array(NUM_MFCC);
    let frameMean = 0;
    for (let k = 1; k <= NUM_MFCC; k++) {
      mfcc[k - 1] = cepstrum[k];
      frameMean += cepstrum[k];
    }
    frameMean /= NUM_MFCC;
    for (let k = 0; k < NUM_MFCC; k++) mfcc[k] -= frameMean; // cepstral mean normalisation

    const { f0, strength } = estimateF0(raw, sampleRate);
    const hnr = strength > 0 ? 20 * Math.log10(strength / (1 - strength + 1e-6)) : -10;

    frames.push({
      logEnergy,
      rms,
      zcr,
      centroid,
      flatness,
      hfRatio,
      flux,
      mfcc,
      f0,
      harmonicStrength: strength,
      hnr,
      voiced: false,
    });
  }

  // adaptive energy based voice activity detection
  const sorted = energyPercentile(frames);
  const low = percentileSorted(sorted, 0.2);
  const high = percentileSorted(sorted, 0.95);
  const thresholdDb = low + 0.3 * Math.max(6, high - low);
  for (const f of frames) {
    f.voiced = f.logEnergy > thresholdDb && f.centroid > 120 && f.zcr < 0.6;
  }

  return { frames, sampleRate, thresholdDb };
}

/* ------------------------------------------------------------------ */
/* utterance level summary ("voiceprint")                              */
/* ------------------------------------------------------------------ */

function vectorMean(frameVectors) {
  const dim = frameVectors[0].length;
  const out = new Float64Array(dim);
  for (const v of frameVectors) for (let i = 0; i < dim; i++) out[i] += v[i];
  for (let i = 0; i < dim; i++) out[i] /= frameVectors.length;
  return Float32Array.from(out);
}

function vectorStd(frameVectors, averages) {
  const dim = averages.length;
  const out = new Float64Array(dim);
  if (frameVectors.length < 2) return Float32Array.from(out);
  for (const v of frameVectors) {
    for (let i = 0; i < dim; i++) {
      const d = v[i] - averages[i];
      out[i] += d * d;
    }
  }
  for (let i = 0; i < dim; i++) out[i] = Math.sqrt(out[i] / (frameVectors.length - 1));
  return Float32Array.from(out);
}

/** Speech-only statistics used as the speaker "voiceprint". */
export function summarize(frameData) {
  const { frames, sampleRate } = frameData;
  const voiced = frames.filter((f) => f.voiced);
  if (voiced.length < 10) return null;

  const mfccMean = vectorMean(voiced.map((f) => f.mfcc));
  const mfccStd = vectorStd(voiced.map((f) => f.mfcc), mfccMean);

  const pitches = voiced.filter((f) => f.f0 >= MIN_F0 && f.f0 <= MAX_F0 && f.harmonicStrength > 0.4).map((f) => f.f0);
  const medianPitch = pitches.length >= 5 ? median(pitches) : 0;
  // discard octave errors and outliers before computing spread
  const cleanPitches =
    medianPitch > 0
      ? pitches.filter((f) => f >= medianPitch / 1.6 && f <= medianPitch * 1.6)
      : [];
  const f0Mean = cleanPitches.length ? median(cleanPitches) : 0;
  const f0Std = cleanPitches.length > 2 ? std(cleanPitches) : 0;

  const centroids = voiced.map((f) => f.centroid);
  const flatness = voiced.map((f) => f.flatness);
  const hnr = voiced.map((f) => f.hnr);
  const zcr = voiced.map((f) => f.zcr);
  const flux = voiced.map((f) => f.flux).filter((v) => v > 0);

  return {
    mfccMean: Array.from(mfccMean),
    mfccStd: Array.from(mfccStd),
    f0Mean,
    f0Std,
    centroidMean: mean(centroids),
    centroidStd: std(centroids),
    flatnessMean: mean(flatness),
    flatnessStd: std(flatness),
    hnrMean: mean(hnr),
    hnrStd: std(hnr),
    zcrMean: mean(zcr),
    zcrStd: std(zcr),
    fluxMean: flux.length ? mean(flux) : 0,
    hfRatioMean: mean(voiced.map((f) => f.hfRatio)),
    logEnergyMean: mean(voiced.map((f) => f.logEnergy)),
    voicedFrames: voiced.length,
    totalFrames: frames.length,
    speechRatio: frames.length ? voiced.length / frames.length : 0,
    durationSec: (frames.length * HOP_SIZE) / sampleRate,
    sampleRate,
  };
}

/** Convenience: samples -> summary (or null when there is not enough speech). */
export function analyseSamples(samples, sampleRate = TARGET_SAMPLE_RATE) {
  const frameData = extractFrameFeatures(samples, sampleRate);
  return { frameData, summary: summarize(frameData) };
}

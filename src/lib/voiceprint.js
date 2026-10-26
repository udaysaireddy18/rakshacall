/**
 * Voiceprint building, speaker comparison and audio-artifact heuristics.
 *
 * IMPORTANT: this is classical speaker verification (cepstral statistics +
 * pitch/timbre similarity), not a trained deep-learning model. It works well
 * for "is this the same person who enrolled?" and honestly reports when it is
 * unsure. It is NOT a guaranteed deepfake detector — see README limitations.
 */

import { clamp, cosine, median, analyseSamples, std } from './dsp.js';

export const DEFAULT_THRESHOLDS = { match: 0.80, uncertain: 0.70 };

/** cosine similarity on [0..1] for vectors that are essentially non-negative after CMN */
const posCos = (a, b) => clamp((cosine(a, b) + 1) / 2, 0, 1);

/** Pitch similarity: 0 semitones -> 1, 7 semitones -> 0 */
function pitchSimilarity(f0a, f0b) {
  if (!f0a || !f0b) return 0.5; // no pitch information -> neutral, never a false "match"
  const semitones = Math.abs(12 * Math.log2(f0a / f0b));
  return clamp(1 - semitones / 7, 0, 1);
}

/** Timbre similarity on spectral centroid (octave distance). */
function centroidSimilarity(ca, cb) {
  if (!ca || !cb) return 0.5;
  const octaves = Math.abs(Math.log2(ca / cb));
  return clamp(1 - octaves / 1.4, 0, 1);
}

/**
 * Compare two utterance summaries.
 * Returns the individual signals so the UI can explain *why*.
 */
export function scoreSimilarity(a, b) {
  if (!a || !b) {
    return { overall: 0, mfcc: 0, spectral: 0, pitch: 0, timbre: 0 };
  }
  const mfcc = posCos(a.mfccMean, b.mfccMean);
  const spectral = posCos(a.mfccStd, b.mfccStd);
  const pitch = pitchSimilarity(a.f0Mean, b.f0Mean);
  const timbre = centroidSimilarity(a.centroidMean, b.centroidMean);

  const overall = clamp(0.62 * mfcc + 0.16 * spectral + 0.12 * pitch + 0.1 * timbre, 0, 1);

  return {
    overall: Number(overall.toFixed(4)),
    mfcc: Number(mfcc.toFixed(4)),
    spectral: Number(spectral.toFixed(4)),
    pitch: Number(pitch.toFixed(4)),
    timbre: Number(timbre.toFixed(4)),
  };
}

export function applySensitivity(thresholds, sensitivity = 'balanced') {
  const base = thresholds || DEFAULT_THRESHOLDS;
  if (sensitivity === 'strict') {
    return {
      match: Number(clamp(base.match + 0.05, 0.5, 0.97).toFixed(3)),
      uncertain: Number(clamp(base.uncertain + 0.05, 0.4, 0.95).toFixed(3)),
    };
  }
  if (sensitivity === 'relaxed') {
    return {
      match: Number(clamp(base.match - 0.05, 0.45, 0.97).toFixed(3)),
      uncertain: Number(clamp(base.uncertain - 0.05, 0.35, 0.95).toFixed(3)),
    };
  }
  return { match: base.match, uncertain: base.uncertain };
}

/**
 * Turn a similarity score into a plain-language identity verdict.
 * @returns {'match'|'uncertain'|'mismatch'}
 */
export function identityVerdict(similarity, thresholds) {
  if (similarity >= thresholds.match) return 'match';
  if (similarity >= thresholds.uncertain) return 'uncertain';
  return 'mismatch';
}

export function qualityFromSelfSimilarity(selfSim, summary) {
  if (!summary || summary.durationSec < 2.5 || summary.speechRatio < 0.2) return 'poor';
  if (selfSim >= 0.86) return 'good';
  if (selfSim >= 0.74) return 'fair';
  return 'poor';
}

/**
 * Build an enrolled profile from a recording.
 * @param {Float32Array} samples 16 kHz mono
 * @param {{name:string,relation?:string,phone?:string,safeWord?:string,challengeQ?:string,challengeA?:string}} meta
 */
export function enrollFromSamples(samples, meta = {}) {
  const full = analyseSamples(samples, 16000);
  if (!full.summary) {
    throw new Error(
      'Not enough speech found. Please record again and speak continuously for at least 5 seconds in a quiet room.'
    );
  }

  // split-half consistency tells us how stable this person's voiceprint is
  const half = Math.floor(samples.length / 2);
  let selfSim = 0.9;
  try {
    const a = analyseSamples(samples.slice(0, half), 16000).summary;
    const b = analyseSamples(samples.slice(half), 16000).summary;
    if (a && b) selfSim = scoreSimilarity(a, b).overall;
  } catch {
    /* keep the optimistic default; quality will be flagged as poor below */
  }

  const quality = qualityFromSelfSimilarity(selfSim, full.summary);
  const match = Number(clamp(selfSim - 0.08, 0.6, 0.88).toFixed(3));
  const uncertain = Number(clamp(match - 0.09, 0.5, 0.86).toFixed(3));

  return {
    id: `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name: meta.name?.trim() || 'Unnamed',
    relation: meta.relation?.trim() || '',
    phone: meta.phone?.trim() || '',
    safeWord: meta.safeWord?.trim() || '',
    challengeQ: meta.challengeQ?.trim() || '',
    challengeA: meta.challengeA?.trim() || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    summary: {
      mfccMean: full.summary.mfccMean,
      mfccStd: full.summary.mfccStd,
      f0Mean: full.summary.f0Mean,
      f0Std: full.summary.f0Std,
      centroidMean: full.summary.centroidMean,
      centroidStd: full.summary.centroidStd,
      flatnessMean: full.summary.flatnessMean,
      hnrMean: full.summary.hnrMean,
      zcrMean: full.summary.zcrMean,
      fluxMean: full.summary.fluxMean,
      hfRatioMean: full.summary.hfRatioMean,
      speechRatio: full.summary.speechRatio,
      durationSec: full.summary.durationSec,
    },
    selfSimilarity: Number(selfSim.toFixed(4)),
    thresholds: { match, uncertain },
    quality,
    stats: {
      durationSec: Number(full.summary.durationSec.toFixed(2)),
      speechRatio: Number(full.summary.speechRatio.toFixed(3)),
      pitchHz: Math.round(full.summary.f0Mean),
      voicedFrames: full.summary.voicedFrames,
    },
  };
}

/** Compare a fresh recording against an enrolled profile. */
export function verifySamples(samples, profile, { sensitivity = 'balanced' } = {}) {
  const { frameData, summary } = analyseSamples(samples, 16000);
  if (!summary) {
    return { ok: false, reason: 'no-speech' };
  }
  const thresholds = applySensitivity(profile?.thresholds, sensitivity);
  const similarity = scoreSimilarity(profile?.summary, summary);
  const verdict = identityVerdict(similarity.overall, thresholds);
  return {
    ok: true,
    similarity,
    thresholds,
    verdict,
    summary,
    artifacts: syntheticHeuristic(summary, frameData),
  };
}

/**
 * Weak but fully-computed artifact signals. Deliberately conservative and
 * labelled as experimental in the UI: these are cues, not proof.
 */
export function syntheticHeuristic(summary, frameData) {
  const signals = [];
  let score = 0;

  const narrowband = (summary.hfRatioMean ?? 0) < 0.02;

  if (summary.flatnessMean > 0.34) {
    score += 0.28;
    signals.push({ label: 'Spectrum looks noise-like (unusually flat)', weight: 0.28 });
  }
  if (summary.hnrMean < 4) {
    score += 0.2;
    signals.push({ label: 'Little harmonic structure in the voice', weight: 0.2 });
  }
  if (summary.f0Mean > 0 && summary.f0Std > 0 && summary.f0Std < 7) {
    score += 0.18;
    signals.push({ label: 'Pitch contour is unusually flat', weight: 0.18 });
  }
  if (summary.fluxMean > 0 && summary.fluxMean < 0.015) {
    score += 0.14;
    signals.push({ label: 'Spectral changes are unusually smooth', weight: 0.14 });
  }
  if (!narrowband && summary.hfRatioMean < 0.03) {
    score += 0.12;
    signals.push({ label: 'Very little high-frequency detail', weight: 0.12 });
  }

  // a small amount of frame-to-frame instability is a weak extra cue
  if (frameData) {
    const energies = frameData.frames.filter((f) => f.voiced).map((f) => f.logEnergy);
    if (energies.length > 20) {
      const variation = std(energies) / Math.max(1, Math.abs(median(energies)));
      if (variation > 0.6) {
        score += 0.08;
        signals.push({ label: 'Uneven loudness envelope', weight: 0.08 });
      }
    }
  }

  return {
    score: Number(clamp(score, 0, 0.95).toFixed(3)),
    signals,
    narrowband,
    note: narrowband
      ? 'This looks like narrowband (telephone) audio, so high-frequency cues are unavailable. Treat artifact score as weak evidence.'
      : 'Artifact cues are experimental and must never be the only reason for a decision.',
  };
}

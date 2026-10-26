/**
 * Node-side sanity checks for the DSP + scoring pipeline.
 *
 * Real voice recordings are not available in CI, so this synthesises vowel-like
 * signals with different pitch/formant settings to prove that:
 *   - the pipeline runs and produces finite features
 *   - the same "speaker" scores higher than a different "speaker"
 *   - the transcript and risk rules behave as expected
 *
 * Run with: npm run test:dsp
 */

import { analyseSamples, extractFrameFeatures, summarize } from '../src/lib/dsp.js';
import { enrollFromSamples, verifySamples, scoreSimilarity, syntheticHeuristic } from '../src/lib/voiceprint.js';
import { scoreTranscript, EXAMPLE_SCRIPTS } from '../src/lib/scamPhrases.js';
import { fuseRisk } from '../src/lib/risk.js';

const SR = 16000;

/** Two-pole resonator used as a crude formant filter. */
function resonator(input, freq, bandwidth, sr) {
  const r = Math.exp((-Math.PI * bandwidth) / sr);
  const theta = (2 * Math.PI * freq) / sr;
  const a1 = 2 * r * Math.cos(theta);
  const a2 = -(r * r);
  const out = new Float32Array(input.length);
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const y = input[i] + a1 * y1 + a2 * y2;
    out[i] = y;
    y2 = y1;
    y1 = y;
  }
  return out;
}

/**
 * Crude source-filter "voice": jittered pulse train through three formants,
 * with syllable-rate amplitude modulation and a little noise.
 */
function synthVoice({ f0 = 160, formants = [700, 1220, 2600], seconds = 4, jitter = 0.012, noise = 0.015, seed = 1 }) {
  const n = Math.floor(seconds * SR);
  let state = seed * 9973;
  const rand = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };

  const glottal = new Float32Array(n);
  let phase = 0;
  let previousPhase = 0;
  for (let i = 0; i < n; i++) {
    const pitch = f0 * (1 + (rand() - 0.5) * jitter) * (1 + 0.02 * Math.sin((2 * Math.PI * 4.5 * i) / SR));
    phase += pitch / SR;
    if (phase >= 1) {
      phase -= 1;
      glottal[i] = 1;
    } else {
      glottal[i] = 0;
    }
    previousPhase = phase;
  }
  // tiny second derivative shapes the glottal pulse a bit
  for (let i = 2; i < n; i++) glottal[i] -= 0.6 * glottal[i - 1] + 0.2 * glottal[i - 2];
  void previousPhase;

  const filtered = new Float32Array(n);
  formants.forEach((freq, index) => {
    const gain = [1, 0.6, 0.3][index] ?? 0.2;
    const band = resonator(glottal, freq, 90, SR);
    for (let i = 0; i < n; i++) filtered[i] += band[i] * gain;
  });

  // syllable envelope ~3.2 Hz with random stress
  const out = new Float32Array(n);
  let peak = 1e-9;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const syllable = Math.max(0, Math.sin(2 * Math.PI * 3.2 * t + 0.7));
    const envelope = 0.25 + 0.75 * syllable * syllable;
    const sample = filtered[i] * envelope + (rand() - 0.5) * noise;
    out[i] = sample;
    peak = Math.max(peak, Math.abs(sample));
  }
  for (let i = 0; i < n; i++) out[i] *= 0.4 / peak;
  return out;
}

let failures = 0;
function check(name, condition, detail = '') {
  if (condition) {
    console.log(`  PASS  ${name}${detail ? `  (${detail})` : ''}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}

console.log('\nDSP pipeline');

const speakerA1 = synthVoice({ f0: 178, formants: [700, 1220, 2600], seed: 3 });
const speakerA2 = synthVoice({ f0: 186, formants: [730, 1180, 2550], seed: 9, noise: 0.03 });
const speakerB = synthVoice({ f0: 112, formants: [480, 1480, 2380], seed: 21 });
const speakerC = synthVoice({ f0: 238, formants: [880, 1450, 2950], seed: 33 });

const frameData = extractFrameFeatures(speakerA1, SR);
check('frames extracted', frameData.frames.length > 50, `${frameData.frames.length} frames`);

const summaryA1 = summarize(frameData);
check('summary produced', Boolean(summaryA1));
check('mfcc vector length', summaryA1.mfccMean.length === 12, `${summaryA1.mfccMean.length} coeffs`);
check(
  'all features finite',
  [
    summaryA1.f0Mean,
    summaryA1.centroidMean,
    summaryA1.flatnessMean,
    summaryA1.hnrMean,
    ...summaryA1.mfccMean,
    ...summaryA1.mfccStd,
  ].every((v) => Number.isFinite(v))
);
check('pitch in speech range', summaryA1.f0Mean > 120 && summaryA1.f0Mean < 260, `${Math.round(summaryA1.f0Mean)} Hz`);
check('voice activity detected', summaryA1.speechRatio > 0.15, `${(summaryA1.speechRatio * 100).toFixed(0)}% voiced`);

console.log('\nSpeaker similarity');

const sameSpeaker = scoreSimilarity(summaryA1, analyseSamples(speakerA2, SR).summary);
const otherSpeakerLow = scoreSimilarity(summaryA1, analyseSamples(speakerB, SR).summary);
const otherSpeakerHigh = scoreSimilarity(summaryA1, analyseSamples(speakerC, SR).summary);

console.log(`  same speaker      : ${sameSpeaker.overall}`);
console.log(`  different (male)  : ${otherSpeakerLow.overall}`);
console.log(`  different (female): ${otherSpeakerHigh.overall}`);

check('same speaker scores high', sameSpeaker.overall > 0.7, sameSpeaker.overall.toFixed(3));
check('same speaker > different male', sameSpeaker.overall > otherSpeakerLow.overall + 0.05);
check('same speaker > different female', sameSpeaker.overall > otherSpeakerHigh.overall + 0.05);

console.log('\nEnrolment + verification');

const profile = enrollFromSamples(speakerA1, {
  name: 'Test Relative',
  relation: 'Brother',
  phone: '+91 90000 00000',
  safeWord: 'mango',
});
check('profile created', profile.id.startsWith('p_'));
check(
  'thresholds ordered',
  profile.thresholds.uncertain < profile.thresholds.match && profile.thresholds.match <= 0.92,
  `u=${profile.thresholds.uncertain} m=${profile.thresholds.match}`
);
check('quality reported', ['good', 'fair', 'poor'].includes(profile.quality), profile.quality);

const verifySame = verifySamples(speakerA2, profile);
const verifyOther = verifySamples(speakerB, profile);
console.log(`  verify same  : sim=${verifySame.similarity.overall} verdict=${verifySame.verdict}`);
console.log(`  verify other : sim=${verifyOther.similarity.overall} verdict=${verifyOther.verdict}`);

check('same speaker verified', verifySame.verdict === 'match');
check('different speaker rejected', verifyOther.verdict === 'mismatch');

const artifacts = syntheticHeuristic(analyseSamples(speakerA1, SR).summary, extractFrameFeatures(speakerA1, SR));
check('artifact score in range', artifacts.score >= 0 && artifacts.score <= 1, String(artifacts.score));

console.log('\nScam transcript scoring');

const scam = scoreTranscript(EXAMPLE_SCRIPTS[0].text);
const arrest = scoreTranscript(EXAMPLE_SCRIPTS[1].text);
const normal = scoreTranscript(EXAMPLE_SCRIPTS[2].text);
console.log(`  fake relative : ${scam.score}`);
console.log(`  digital arrest: ${arrest.score}`);
console.log(`  normal call   : ${normal.score}`);

check('fake-relative script is high risk', scam.score >= 60);
check('digital-arrest script is high risk', arrest.score >= 60);
check('normal call is low risk', normal.score <= 20);
check('categories detected', scam.categories.length >= 3);
check('combo detected', scam.combos.length >= 1, scam.combos[0]);
check('empty transcript safe', scoreTranscript('').score === 0);

console.log('\nRisk fusion');

const highRisk = fuseRisk({
  identity: { claimed: true, verdict: 'mismatch', similarity: 0.41, name: 'Ramesh' },
  script: scam,
  artifacts: { score: 0.2 },
  context: { newNumber: true, moneyRequest: true, urgency: true },
});
const normalRisk = fuseRisk({
  identity: { claimed: true, verdict: 'match', similarity: 0.88, name: 'Ramesh' },
  script: normal,
  artifacts: { score: 0.1 },
  context: {},
});
const coerced = fuseRisk({
  identity: { claimed: true, verdict: 'match', similarity: 0.88, name: 'Ramesh' },
  script: scam,
  artifacts: { score: 0.2 },
  context: {},
});

console.log(`  impersonation   : ${highRisk.score} (${highRisk.band.id})`);
console.log(`  normal call     : ${normalRisk.score} (${normalRisk.band.id})`);
console.log(`  matched + scam  : ${coerced.score} (${coerced.band.id})`);

check('impersonation is high risk', highRisk.band.id === 'high');
check('normal call is low risk', normalRisk.band.id === 'low');
check('matched voice + scam script is not low risk', coerced.band.id !== 'low', coerced.band.id);
check('reasons are human readable', highRisk.reasons.every((r) => typeof r.text === 'string' && r.text.length > 10));
check('advice provided', highRisk.advice.length >= 3);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);

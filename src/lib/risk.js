/**
 * Risk fusion: combines identity verification, scam-script signals and audio
 * artifacts into one 0..100 risk score plus plain-language reasons.
 *
 * The rules are intentionally simple and explainable. In a safety product an
 * explanation the user can understand is worth more than a black-box number.
 */

import { clamp } from './dsp.js';

export const RISK_BANDS = {
  low: { id: 'low', label: 'Looks normal', color: 'green' },
  caution: { id: 'caution', label: 'Be careful', color: 'amber' },
  high: { id: 'high', label: 'High risk — do not act', color: 'red' },
};

export function bandFor(score) {
  if (score >= 65) return RISK_BANDS.high;
  if (score >= 35) return RISK_BANDS.caution;
  return RISK_BANDS.low;
}

const IDENTITY_RISK = { match: 8, uncertain: 45, mismatch: 92 };

/**
 * @param {object} input
 * @param {{claimed:boolean, verdict?:string, similarity?:number, name?:string}} input.identity
 * @param {{score:number, categories?:Array, combos?:Array}} input.script
 * @param {{score:number, signals?:Array}} input.artifacts
 * @param {{newNumber?:boolean, moneyRequest?:boolean, urgency?:boolean}} input.context
 */
export function fuseRisk({ identity = {}, script = {}, artifacts = {}, context = {} } = {}) {
  const claimsIdentity = Boolean(identity.claimed);
  const identityKnown = claimsIdentity && identity.verdict;
  const identityRisk = identityKnown ? IDENTITY_RISK[identity.verdict] ?? 50 : null;

  const scriptScore = clamp(script.score ?? 0, 0, 100);
  const artifactScore = clamp((artifacts.score ?? 0) * 100, 0, 100);

  let score;
  if (identityRisk !== null) {
    score = identityRisk * 0.55 + scriptScore * 0.3 + artifactScore * 0.15;
  } else {
    // no enrolled voice to compare against: rely on script + artifacts
    score = scriptScore * 0.68 + artifactScore * 0.32;
  }

  let contextBoost = 0;
  if (context.newNumber) contextBoost += 6;
  if (context.moneyRequest) contextBoost += 6;
  if (context.urgency) contextBoost += 3;
  score = clamp(score + Math.min(15, contextBoost), 0, 100);

  // voice matches but the request is a scam script: a real relative under
  // pressure, or a very good clone. Either way the user must verify.
  if (identityKnown && identity.verdict === 'match' && scriptScore >= 60) {
    score = Math.max(score, 66);
  }

  const rounded = Math.round(score);
  const band = bandFor(rounded);
  const reasons = [];
  const advice = [];

  const name = identity.name || 'this person';

  if (identityKnown) {
    if (identity.verdict === 'match') {
      reasons.push({
        severity: 'ok',
        text: `Voice matches ${name} (${Math.round((identity.similarity ?? 0) * 100)}% similarity).`,
      });
    } else if (identity.verdict === 'uncertain') {
      reasons.push({
        severity: 'warn',
        text: `Voice only partly matches ${name}. It could be a bad line — or someone imitating them.`,
      });
    } else {
      reasons.push({
        severity: 'danger',
        text: `Voice does NOT match ${name}. This is the strongest warning sign on this call.`,
      });
    }
  } else if (claimsIdentity) {
    reasons.push({ severity: 'warn', text: 'Caller claims to be family, but no voice sample is enrolled for comparison.' });
  }

  for (const category of script.categories?.slice(0, 5) || []) {
    reasons.push({ severity: 'warn', text: `${category.label} — heard “${category.quote || category.phrase}”.` });
  }
  for (const combo of script.combos?.slice(0, 3) || []) {
    reasons.push({ severity: 'danger', text: combo });
  }

  if (artifactScore >= 45) {
    reasons.push({
      severity: 'warn',
      text: `Audio has synthetic-voice cues (experimental score ${Math.round(artifactScore)}/100).`,
    });
  }

  if (context.newNumber) reasons.push({ severity: 'warn', text: 'Call came from a number you have not saved.' });
  if (context.moneyRequest) reasons.push({ severity: 'warn', text: 'Money or payment details were mentioned.' });
  if (context.urgency) reasons.push({ severity: 'warn', text: 'The caller is pushing you to act fast.' });

  if (identityKnown && identity.verdict === 'match' && scriptScore >= 60) {
    reasons.push({
      severity: 'danger',
      text: `The voice sounds like ${name}, but no genuine family member should ask for secret money transfers. They may be under pressure, or the voice may be replayed.`,
    });
  }

  if (band.id === 'high') {
    advice.push('Hang up now. Do not send money or share any code.');
    advice.push(`Call ${name} back on the number you already have saved.`);
    advice.push('Ask your family safe word or a private question only they know.');
    advice.push('If money was already sent, report immediately: cybercrime.gov.in or 1930 (India).');
  } else if (band.id === 'caution') {
    advice.push('Do not send money yet. Verify with a callback to the saved number.');
    advice.push('Ask a question only your family member could answer.');
    advice.push('Tell another family member about this call.');
  } else {
    advice.push('No strong warning signs — but never send money based only on a phone call.');
    advice.push('If anything feels off, hang up and call back on the saved number.');
  }

  return {
    score: rounded,
    band,
    identityKnown,
    identityRisk,
    scriptScore: Math.round(scriptScore),
    artifactScore: Math.round(artifactScore),
    reasons,
    advice,
    headline: buildHeadline({ band, identity, identityKnown, scriptScore, name }),
  };
}

function buildHeadline({ band, identity, identityKnown, scriptScore, name }) {
  if (band.id === 'high') {
    if (identityKnown && identity.verdict === 'mismatch') {
      return scriptScore >= 50
        ? `This is NOT ${name} — and it looks like a scam call`
        : `This does NOT sound like ${name}`;
    }
    if (scriptScore >= 60) return 'This call looks like a scam';
    return 'High risk — slow down and verify';
  }
  if (band.id === 'caution') {
    if (identityKnown && identity.verdict === 'uncertain') return `Not sure this is ${name}`;
    return 'Be careful — verify before you act';
  }
  if (identityKnown && identity.verdict === 'match') return `Sounds like ${name}`;
  if (!identityKnown) return 'No strong warning signs';
  return 'Looks normal';
}

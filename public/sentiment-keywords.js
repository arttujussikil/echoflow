// Keyword-based mood estimate: the fallback when the AI can't label a post, and
// the non-AI baseline in eval/sentiment-benchmark.ts. Loaded in the browser as a
// plain script and in Node via require().
(function (root) {
  'use strict';

  const POS_WORDS = new Set(`win wins won victory champion champions breakthrough launch launches launched deal
agreement approved peace ceasefire rescue rescued survive survived recover recovery growth grow grows improve improved
boost boosted rise rising gain gains increase expand upgrade advance progress success successful celebrate
celebration positive promising innovative innovation profit profits revenue invest investment funding partnership hire
hiring jobs save saved protect benefit achieve achievement solve solved solution cure vaccine effective discover
discovery love amazing awesome excellent happy bullish
voitti voitto kasvu paranee sopimus pelasti menestys investoi kehitys edistys hyväksyttiin`.split(/\s+/));

  const NEG_WORDS = new Set(`dead death deaths die dies died kill kills killed murder shooting shot attack attacks attacked
explosion bomb bombing terror terrorist war wars conflict battle riot violence violent crash crashed disaster
catastrophe crisis emergency flood earthquake hurricane wildfire fire collapse collapsed epidemic pandemic outbreak
arrest arrested charged indicted convicted sentenced prison scandal corruption fraud hack hacked breach stolen theft
abuse fail fails failed failure bankrupt bankruptcy recession decline declined drop dropped loss losses lose lost cut
cuts layoff layoffs fired resign shutdown ban banned sanction sanctions threat threats warning danger dangerous toxic
harm damage injured hurt wounded suffer bad terrible worst hate awful scam bearish halt halted halts accused accuses
suspend suspended forfeit forfeits investigation lawsuit sucks concerns protest protests
kuoli kuollut kuolema hyökkäys sota kriisi onnettomuus pidätettiin tuomittiin katastrofi tulva tulipalo räjähdys
menetys konkurssi irtisanottiin uhka varoitus vaarallinen umpikuja kiista epäonnistui pakotteet kritiikki`.split(/\s+/));

  /** 'positive' | 'neutral' | 'negative' — title words count 3x, body words 1x. */
  function keywordSentiment(post) {
    const words = s => (s || '').toLowerCase().match(/[\p{L}]+/gu) || [];
    let score = 0;
    for (const w of words(post.title)) score += (POS_WORDS.has(w) ? 3 : 0) - (NEG_WORDS.has(w) ? 3 : 0);
    for (const w of words((post.content || '').slice(0, 400))) score += (POS_WORDS.has(w) ? 1 : 0) - (NEG_WORDS.has(w) ? 1 : 0);
    return score >= 2 ? 'positive' : score <= -2 ? 'negative' : 'neutral';
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { keywordSentiment };
  else root.keywordSentiment = keywordSentiment;
})(typeof window !== 'undefined' ? window : globalThis);

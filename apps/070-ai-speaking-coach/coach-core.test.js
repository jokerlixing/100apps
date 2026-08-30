const test = require('node:test');
const assert = require('node:assert/strict');

const Core = require('./coach-core.js');

test('cleanText removes markup, controls and repeated whitespace', () => {
  assert.equal(Core.cleanText('  <b>Hello</b>\u0000   world  '), 'Hello world');
  assert.equal(Core.cleanText(null), '');
  assert.equal(Core.cleanText('x'.repeat(2200)).length, 2000);
});

test('tokenizeEnglish keeps contractions and ignores punctuation', () => {
  assert.deepEqual(
    Core.tokenizeEnglish("I'd like a coffee, please — it's for here."),
    ["i'd", 'like', 'a', 'coffee', 'please', "it's", 'for', 'here']
  );
});

test('countFillers finds single and multi-word fillers without matching substrings', () => {
  const result = Core.countFillers('Um, I mean, I actually like this. You know, it is useful.');
  assert.equal(result.total, 4);
  assert.equal(result.counts.um, 1);
  assert.equal(result.counts['i mean'], 1);
  assert.equal(Core.countFillers('This umbrella is basic.').total, 0);
});

test('calculateWordsPerMinute handles normal, short and empty turns', () => {
  assert.equal(Core.calculateWordsPerMinute('one two three four five six seven eight nine ten', 5000), 120);
  assert.equal(Core.calculateWordsPerMinute('one two', 250), 120);
  assert.equal(Core.calculateWordsPerMinute('', 5000), 0);
});

test('calculateLexicalDiversity reports the unique-token ratio', () => {
  assert.equal(Core.calculateLexicalDiversity('book a book please'), 0.75);
  assert.equal(Core.calculateLexicalDiversity(''), 0);
});

test('calculatePhraseCoverage reports matched and missing target expressions', () => {
  const result = Core.calculatePhraseCoverage(
    'Could I have a quiet room, please?',
    ['could i have', 'quiet room', 'late checkout']
  );
  assert.equal(result.matched, 2);
  assert.equal(result.total, 3);
  assert.equal(result.ratio, 0.67);
  assert.deepEqual(result.missing, ['late checkout']);
});

test('analyzeTurn produces honest metrics and actionable advice', () => {
  const analysis = Core.analyzeTurn({
    text: 'Um, I would like a quiet room because I have an early meeting, please.',
    durationMs: 6000,
    confidence: 0.82,
    targetPhrases: ['i would like', 'quiet room', 'could i have'],
    expectedKeywords: [['room', 'suite'], ['meeting', 'business']]
  });

  assert.equal(analysis.wordCount, 14);
  assert.equal(analysis.wpm, 140);
  assert.equal(analysis.fillerCount, 1);
  assert.equal(analysis.phraseCoverage.matched, 2);
  assert.equal(analysis.conceptCoverage.matched, 2);
  assert.equal(analysis.transcriptConfidence, 82);
  assert.ok(analysis.score >= 70);
  assert.ok(analysis.suggestions.some((tip) => tip.includes('Um')));
});

test('analyzeTurn does not invent a pronunciation score', () => {
  const analysis = Core.analyzeTurn({ text: 'Yes, here you are.', durationMs: 2000 });
  assert.equal('pronunciation' in analysis, false);
  assert.equal(analysis.transcriptConfidence, null);
});

test('analyzeTurn leaves speaking pace unmeasured for typed fallback answers', () => {
  const analysis = Core.analyzeTurn({ text: 'I have a reservation under the name Li.' });
  assert.equal(analysis.wpm, null);
  assert.ok(analysis.score > 0);
  assert.equal(analysis.suggestions.some((tip) => tip.includes('WPM')), false);
});

test('six immutable scenarios provide five complete prompts each', () => {
  assert.equal(Core.SCENARIOS.length, 6);
  for (const scenario of Core.SCENARIOS) {
    assert.equal(scenario.prompts.length, 5);
    assert.ok(scenario.title);
    assert.ok(scenario.goal);
    assert.ok(Object.isFrozen(scenario));
    assert.ok(Object.isFrozen(scenario.prompts));
  }
});

test('advanceLocalScenario moves forward and closes the fifth turn', () => {
  const first = Core.advanceLocalScenario('hotel', 0, { score: 78 });
  assert.equal(first.completed, false);
  assert.equal(first.nextStep, 1);
  assert.match(first.coachReply, /Good|Nice|clear/i);
  assert.equal(first.nextPrompt, Core.getScenario('hotel').prompts[1].coach);

  const last = Core.advanceLocalScenario('hotel', 4, { score: 80 });
  assert.equal(last.completed, true);
  assert.equal(last.nextPrompt, null);
});

test('normalizeEndpoint accepts HTTPS and local HTTP but rejects unsafe endpoints', () => {
  assert.equal(Core.normalizeEndpoint('https://api.example.com/v1/'), 'https://api.example.com/v1');
  assert.equal(Core.normalizeEndpoint('http://127.0.0.1:11434/v1/chat/completions'), 'http://127.0.0.1:11434/v1');
  assert.throws(() => Core.normalizeEndpoint('http://api.example.com/v1'), /HTTPS/);
  assert.throws(() => Core.normalizeEndpoint('javascript:alert(1)'), /HTTPS/);
  assert.throws(() => Core.normalizeEndpoint('https://user:pass@example.com/v1'), /凭据/);
});

test('buildAIRequest bounds history and never serializes a key', () => {
  const turns = Array.from({ length: 12 }, (_, index) => ({
    coach: `Question ${index}`,
    user: `Answer ${index}`
  }));
  const request = Core.buildAIRequest({
    endpoint: 'https://api.example.com/v1',
    model: 'coach-model',
    scenario: Core.getScenario('hotel'),
    turns,
    analysis: { score: 72, wpm: 143, fillerCount: 1 }
  });

  assert.equal(request.url, 'https://api.example.com/v1/chat/completions');
  assert.equal(request.body.model, 'coach-model');
  assert.ok(request.body.messages.length <= 8);
  assert.equal(JSON.stringify(request).includes('apiKey'), false);
});

test('sanitizeAIReply accepts bounded JSON and rejects malformed content', () => {
  const result = Core.sanitizeAIReply('```json\n{"coachReply":"<b>Good recovery.</b>","rewrite":"I would like a quieter room, please.","tips":["Slow down slightly","Use a reason","x"]}\n```');
  assert.deepEqual(result, {
    coachReply: 'Good recovery.',
    rewrite: 'I would like a quieter room, please.',
    tips: ['Slow down slightly', 'Use a reason', 'x']
  });
  assert.equal(Core.sanitizeAIReply('{"coachReply":"","rewrite":"ok","tips":[]}'), null);
  assert.equal(Core.sanitizeAIReply('not json'), null);
});

test('sanitizeSession removes invalid turns, reports and secrets', () => {
  const session = Core.sanitizeSession({
    version: 1,
    scenarioId: 'hotel',
    stepIndex: 99,
    turns: [
      { coach: 'Welcome.', user: 'Hello.', durationMs: 1200, analysis: { score: 70, wpm: 100, fillerCount: 0 } },
      { coach: '', user: '<script>bad</script>' }
    ],
    settings: { level: 'B1', autoSpeak: true, endpoint: 'https://api.example.com/v1', model: 'm', apiKey: 'secret' },
    reports: [{ scenarioTitle: 'Hotel', completedAt: '2026-08-31T00:00:00.000Z', score: 80 }]
  });

  assert.equal(session.stepIndex, 4);
  assert.equal(session.turns.length, 1);
  assert.equal(session.settings.apiKey, undefined);
  assert.equal(JSON.stringify(session).includes('secret'), false);
  assert.equal(session.reports.length, 1);
});

test('summarizeSession aggregates user turns and chooses next goals', () => {
  const report = Core.summarizeSession({
    scenarioId: 'hotel',
    startedAt: '2026-08-31T00:00:00.000Z',
    turns: [
      { user: 'Um hello', durationMs: 3000, analysis: { score: 60, wpm: 80, fillerCount: 1, phraseCoverage: { matched: 0 } } },
      { user: 'I would like a quiet room please', durationMs: 4000, analysis: { score: 84, wpm: 120, fillerCount: 0, phraseCoverage: { matched: 2 } } }
    ]
  });

  assert.equal(report.turnCount, 2);
  assert.equal(report.averageScore, 72);
  assert.equal(report.averageWpm, 100);
  assert.equal(report.totalFillers, 1);
  assert.equal(report.targetPhrasesUsed, 2);
  assert.ok(report.goals.length > 0);
});

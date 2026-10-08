import { describe, expect, it } from 'vitest';

import { enrichAnswers, getConfidence } from '../nodes/Decisions/confidence';

describe('getConfidence', () => {
	it.each([
		[0.95, 0.9],
		[0.5, 0],
		[0.08, 0.84],
		[0.62, 0.24],
	])('derives %s as %s for Noul', (noul, expected) => {
		expect(getConfidence({ noul })).toBeCloseTo(expected as number, 10);
	});

	it('returns the confidence of Choice and Score', () => {
		expect(getConfidence({ choice: 'a', confidence: 0.81 })).toBe(0.81);
		expect(getConfidence({ score: 1.2, confidence: 0.71 })).toBe(0.71);
	});

	it('derives confidence for predicate answers like Noul', () => {
		expect(getConfidence({ probability: 0.95 })).toBeCloseTo(0.9, 10);
	});

	it('returns 0 for a refusal', () => {
		expect(getConfidence({ type: 'refusal' })).toBe(0);
	});

	it('returns undefined when there is no confidence source', () => {
		expect(getConfidence({})).toBeUndefined();
		expect(getConfidence({ type: 'choice', choice: 'a' })).toBeUndefined();
		expect(getConfidence({ type: 'score', score: 1 })).toBeUndefined();
		expect(getConfidence(null)).toBeUndefined();
		expect(getConfidence(undefined)).toBeUndefined();
	});

	it('rounds float noise so 0.55 derives exactly 0.1', () => {
		expect(getConfidence({ noul: 0.55 })).toBe(0.1);
		expect(getConfidence({ probability: 0.55 })).toBe(0.1);
	});
});

describe('enrichAnswers thresholds', () => {
	it('does not mark confidence exactly on the threshold', () => {
		const { answers, lowConfidenceQuestions } = enrichAnswers(
			{ q: { choice: 'a', confidence: 0.7 } },
			'bestGuess',
			0.7,
		);
		expect(answers.q.lowConfidence).toBe(false);
		expect(lowConfidenceQuestions).toEqual([]);
	});

	it('marks below the threshold', () => {
		const { answers, lowConfidenceQuestions } = enrichAnswers(
			{ q: { choice: 'a', confidence: 0.69 } },
			'bestGuess',
			0.7,
		);
		expect(answers.q.lowConfidence).toBe(true);
		expect(lowConfidenceQuestions).toEqual(['q']);
	});
});

describe('enrichAnswers Best Guess Noul values', () => {
	it.each([
		[0.49, false],
		[0.5, false],
		[0.51, true],
	])('resolves Noul %s to value %s', (noul, value) => {
		const { answers } = enrichAnswers({ q: { noul } }, 'bestGuess', 0.7);
		expect(answers.q.value).toBe(value);
	});

	it('marks Noul 0.5 as low confidence', () => {
		const { answers } = enrichAnswers({ q: { noul: 0.5 } }, 'bestGuess', 0.7);
		expect(answers.q).toMatchObject({ value: false, lowConfidence: true, confidence: 0 });
	});

	it('keeps value false but reliable with threshold 0 and Noul 0.5', () => {
		const { answers } = enrichAnswers({ q: { noul: 0.5 } }, 'bestGuess', 0);
		expect(answers.q).toMatchObject({ value: false, lowConfidence: false, confidence: 0 });
	});

	it('keeps Choice and Score values as the best option', () => {
		const { answers } = enrichAnswers(
			{
				c: { choice: 'billing', confidence: 0.4 },
				s: { score: 1.3, confidence: 0.9 },
			},
			'bestGuess',
			0.7,
		);
		expect(answers.c).toMatchObject({ choice: 'billing', confidence: 0.4, lowConfidence: true });
		expect(answers.s).toMatchObject({ score: 1.3, confidence: 0.9, lowConfidence: false });
		expect(answers.c).not.toHaveProperty('value');
	});

	it('never modifies the raw values', () => {
		const { answers } = enrichAnswers({ q: { noul: 0.95 } }, 'bestGuess', 0.7);
		expect(answers.q.noul).toBe(0.95);
	});
});

describe('enrichAnswers Low Confidence Output', () => {
	it('only lists the doubtful question', () => {
		const { answers, lowConfidenceQuestions } = enrichAnswers(
			{
				doubtful: { noul: 0.55 },
				sure_choice: { choice: 'a', confidence: 0.95 },
				sure_score: { score: 1, confidence: 0.9 },
			},
			'lowConfidenceOutput',
			0.7,
		);
		expect(lowConfidenceQuestions).toEqual(['doubtful']);
		expect(answers.doubtful.lowConfidence).toBe(true);
		expect(answers.sure_choice.lowConfidence).toBe(false);
		expect(answers.sure_score.lowConfidence).toBe(false);
	});

	it('does not resolve a value', () => {
		const { answers } = enrichAnswers({ q: { noul: 0.5 } }, 'lowConfidenceOutput', 0.7);
		expect(answers.q).not.toHaveProperty('value');
		expect(answers.q.lowConfidence).toBe(true);
	});
});

describe('enrichAnswers without confidence', () => {
	it('does not mark an answer without a confidence source', () => {
		const { answers, lowConfidenceQuestions } = enrichAnswers(
			{ q: { score: 1 } },
			'bestGuess',
			0.7,
		);
		expect(answers.q.lowConfidence).toBe(false);
		expect(answers.q).not.toHaveProperty('confidence');
		expect(lowConfidenceQuestions).toEqual([]);
	});
});

describe('enrichAnswers refusal', () => {
	it('marks a refusal as low confidence with confidence 0 and no value', () => {
		for (const mode of ['bestGuess', 'lowConfidenceOutput'] as const) {
			const { answers, lowConfidenceQuestions } = enrichAnswers(
				{ q: { type: 'refusal' } },
				mode,
				0.7,
			);
			expect(answers.q).toMatchObject({ confidence: 0, lowConfidence: true });
			expect(answers.q).not.toHaveProperty('value');
			expect(lowConfidenceQuestions).toEqual(['q']);
		}
	});

	it('marks a refusal as low confidence even with threshold 0', () => {
		const { answers } = enrichAnswers({ q: { type: 'refusal' } }, 'bestGuess', 0);
		expect(answers.q.lowConfidence).toBe(true);
	});
});

describe('enrichAnswers stale value', () => {
	it('drops a stale value for Choice and Score in Best Guess', () => {
		const { answers } = enrichAnswers(
			{
				c: { choice: 'a', confidence: 0.4, value: true },
				s: { score: 1, confidence: 0.9, value: false },
			},
			'bestGuess',
			0.7,
		);
		expect(answers.c).not.toHaveProperty('value');
		expect(answers.s).not.toHaveProperty('value');
	});

	it('drops value in Low Confidence Output mode', () => {
		const { answers } = enrichAnswers({ q: { noul: 0.9, value: true } }, 'lowConfidenceOutput', 0.7);
		expect(answers.q).not.toHaveProperty('value');
	});
});

describe('enrichAnswers disabled', () => {
	it('returns the input unchanged', () => {
		const input = { q: { noul: 0.5 } };
		const { answers, lowConfidenceQuestions } = enrichAnswers(input, 'disabled', 0.7);
		expect(answers).toBe(input);
		expect(lowConfidenceQuestions).toEqual([]);
	});
});

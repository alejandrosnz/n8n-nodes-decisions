import { describe, expect, it } from 'vitest';

import { fromOpenAiResponse, toOpenAiRequest } from '../nodes/Decisions/openai';

function baseBody(questions: unknown, state: unknown = 'I was charged twice for my order.') {
	return { state, model: 'gpt-6-luna', questions };
}

describe('toOpenAiRequest', () => {
	it('sends a text state as input and drops the state key', () => {
		const result = toOpenAiRequest(baseBody({}));
		expect(result.input).toBe('I was charged twice for my order.');
		expect(result).not.toHaveProperty('state');
		expect(result.model).toBe('gpt-6-luna');
	});

	it('stringifies an object state', () => {
		const state = { ticket: 1 };
		const result = toOpenAiRequest(baseBody({}, state));
		expect(result.input).toBe(JSON.stringify(state));
	});

	it('leaves a noul without criteria unchanged apart from the type', () => {
		const result = toOpenAiRequest(
			baseBody({ is_urgent: { type: 'noul', instructions: 'Is it urgent?' } }),
		);
		expect(result.questions).toEqual([
			{ type: 'predicate', name: 'is_urgent', instructions: 'Is it urgent?' },
		]);
	});

	it('appends both meanings to a noul', () => {
		const result = toOpenAiRequest(
			baseBody({
				is_urgent: {
					type: 'noul',
					instructions: 'Is it urgent?',
					criteria: { true: 'Needs action today', false: 'Can wait' },
				},
			}),
		);
		const [question] = result.questions as Array<{ instructions: string }>;
		expect(question.instructions.endsWith('\n\nA yes means: Needs action today\nA no means: Can wait')).toBe(
			true,
		);
	});

	it('appends only the no meaning when just false exists', () => {
		const result = toOpenAiRequest(
			baseBody({
				is_urgent: {
					type: 'noul',
					instructions: 'Is it urgent?',
					criteria: { false: 'Can wait' },
				},
			}),
		);
		const [question] = result.questions as Array<{ instructions: string }>;
		expect(question.instructions.endsWith('\n\nA no means: Can wait')).toBe(true);
	});

	it('omits the description of a choice with a null description', () => {
		const result = toOpenAiRequest(
			baseBody({
				department: {
					type: 'choice',
					instructions: 'Which department?',
					criteria: { billing: 'Payments', technical: null },
				},
			}),
		);
		expect(result.questions).toEqual([
			{
				type: 'choice',
				name: 'department',
				instructions: 'Which department?',
				choices: [{ value: 'billing', description: 'Payments' }, { value: 'technical' }],
			},
		]);
	});

	it('sends score levels in the same order', () => {
		const result = toOpenAiRequest(
			baseBody({
				severity: {
					type: 'score',
					instructions: 'How severe?',
					criteria: ['Cosmetic', 'Workaround available', 'Blocking'],
				},
			}),
		);
		expect(result.questions).toEqual([
			{
				type: 'score',
				name: 'severity',
				instructions: 'How severe?',
				levels: [{ label: 'Cosmetic' }, { label: 'Workaround available' }, { label: 'Blocking' }],
			},
		]);
	});

	it('preserves question order', () => {
		const result = toOpenAiRequest(
			baseBody({
				is_urgent: { type: 'noul', instructions: 'Is it urgent?' },
				department: { type: 'choice', instructions: 'Which department?', criteria: {} },
				severity: { type: 'score', instructions: 'How severe?', criteria: [] },
			}),
		);
		expect((result.questions as Array<{ name: string }>).map((q) => q.name)).toEqual([
			'is_urgent',
			'department',
			'severity',
		]);
	});

	it('passes an array of questions through unchanged', () => {
		const questions = [{ type: 'predicate', name: 'is_urgent', instructions: 'Is it urgent?' }];
		const result = toOpenAiRequest(baseBody(questions));
		expect(result.questions).toEqual(questions);
	});

	it('returns exactly model, input and questions', () => {
		expect(Object.keys(toOpenAiRequest(baseBody({})))).toEqual(['model', 'input', 'questions']);
	});
});

describe('fromOpenAiResponse', () => {
	it('keys array answers by name, without the name inside each answer', () => {
		const response = fromOpenAiResponse(
			{
				answers: [
					{ type: 'predicate', name: 'is_urgent', probability: 0.95 },
					{ type: 'choice', name: 'department', choice: 'billing', confidence: 0.81 },
				],
			},
			'gpt-6-luna',
		);
		expect(response.answers).toEqual({
			is_urgent: { type: 'predicate', probability: 0.95 },
			department: { type: 'choice', choice: 'billing', confidence: 0.81 },
		});
	});

	it('falls back to the requested model when none is reported', () => {
		expect(fromOpenAiResponse({ answers: [] }, 'gpt-6-luna').model).toBe('gpt-6-luna');
	});

	it('uses the reported model when present', () => {
		expect(
			fromOpenAiResponse({ model: 'gpt-6-luna-2026', answers: [] }, 'gpt-6-luna').model,
		).toBe('gpt-6-luna-2026');
	});

	it('passes usage through when present and omits it otherwise', () => {
		const usage = { input_tokens: 1, output_tokens: 1 };
		expect(fromOpenAiResponse({ answers: [], usage }, 'gpt-6-luna').usage).toEqual(usage);
		expect('usage' in fromOpenAiResponse({ answers: [] }, 'gpt-6-luna')).toBe(false);
	});

	it('keeps a refusal answer', () => {
		const response = fromOpenAiResponse(
			{ answers: [{ type: 'refusal', name: 'something' }] },
			'gpt-6-luna',
		);
		expect(response.answers).toEqual({ something: { type: 'refusal' } });
	});
});

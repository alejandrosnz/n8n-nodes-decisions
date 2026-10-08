import type { IExecuteFunctions, INode, INodeExecutionData } from 'n8n-workflow';
import { describe, expect, it, vi } from 'vitest';

import { Decisions } from '../nodes/Decisions/Decisions.node';
import { configuredOutputs } from '../nodes/Decisions/helpers';

const node: INode = {
	id: 'a',
	name: 'Decisions',
	type: 'decisions',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

const items: INodeExecutionData[] = [{ json: { ticket: 1 } }];

function createFunctions(
	parameters: Record<string, unknown>,
	respond: (body: unknown) => unknown,
) {
	const request = vi.fn(async () => respond(undefined));
	return {
		request,
		functions: {
			getInputData: () => items,
			getNode: () => node,
			continueOnFail: () => false,
			getCredentials: async () => ({ provider: 'typesafe', apiKey: 'k', baseUrl: '' }),
			getNodeParameter: (name: string, _itemIndex: number, fallback?: unknown) => {
				return name in parameters ? parameters[name] : fallback;
			},
			helpers: { httpRequestWithAuthentication: request },
		} as unknown as IExecuteFunctions,
	};
}

const baseEvaluate: Record<string, unknown> = {
	operation: 'evaluate',
	model: 'jev-latest',
	stateFormat: 'text',
	stateText: 'Charged twice',
	questionsFormat: 'fields',
	'questions.question': [{ id: 'is_urgent', instructions: 'Urgent?', type: 'noul' }],
};

const noulAnswer = (noul: number) => () => ({
	statusCode: 200,
	body: {
		model: 'jev-1.13.0',
		answers: { is_urgent: { type: 'noul', noul } },
		usage: { input_tokens: 1, output_tokens: 1 },
	},
});

describe('Evaluate fallbackMode outputs', () => {
	it('keeps a single output when disabled', () => {
		expect(configuredOutputs({ operation: 'evaluate' })).toEqual([{ type: 'main' }]);
		expect(configuredOutputs({ operation: 'evaluate', fallbackMode: 'disabled' })).toEqual([
			{ type: 'main' },
		]);
		expect(configuredOutputs({ operation: 'evaluate', fallbackMode: 'bestGuess' })).toEqual([
			{ type: 'main' },
		]);
	});

	it('has Confident and Low Confidence outputs in lowConfidenceOutput mode', () => {
		expect(
			configuredOutputs({ operation: 'evaluate', fallbackMode: 'lowConfidenceOutput' }),
		).toEqual([
			{ type: 'main', displayName: 'Confident' },
			{ type: 'main', displayName: 'Low Confidence' },
		]);
	});
});

describe('Evaluate fallback execution', () => {
	it('is identical to before with Disabled', async () => {
		const { functions } = createFunctions(baseEvaluate, noulAnswer(0.85));
		const outputs = await Decisions.prototype.execute.call(functions);
		expect(outputs).toHaveLength(1);
		expect(outputs[0][0].json).toEqual({
			ticket: 1,
			answers: { is_urgent: { noul: 0.85 } },
			model: 'jev-1.13.0',
		});
		expect(outputs[0][0].pairedItem).toEqual({ item: 0 });
	});

	it('adds value and lowConfidence in Best Guess', async () => {
		const { functions } = createFunctions(
			{ ...baseEvaluate, fallbackMode: 'bestGuess', confidenceThreshold: 0.7 },
			noulAnswer(0.85),
		);
		const outputs = await Decisions.prototype.execute.call(functions);
		expect(outputs).toHaveLength(1);
		expect(outputs[0][0].json).toEqual({
			ticket: 1,
			answers: { is_urgent: { noul: 0.85, confidence: 0.7, lowConfidence: false, value: true } },
			model: 'jev-1.13.0',
		});
	});

	it('resolves Noul 0.5 to false in Best Guess', async () => {
		const { functions } = createFunctions(
			{ ...baseEvaluate, fallbackMode: 'bestGuess', confidenceThreshold: 0.7 },
			noulAnswer(0.5),
		);
		const outputs = await Decisions.prototype.execute.call(functions);
		expect(outputs[0][0].json).toMatchObject({
			answers: { is_urgent: { noul: 0.5, value: false, lowConfidence: true } },
		});
	});

	it('routes Noul 0.5 to Low Confidence output', async () => {
		const { functions } = createFunctions(
			{ ...baseEvaluate, fallbackMode: 'lowConfidenceOutput', confidenceThreshold: 0.7 },
			noulAnswer(0.5),
		);
		const outputs = await Decisions.prototype.execute.call(functions);
		expect(outputs).toHaveLength(2);
		expect(outputs[0]).toHaveLength(0);
		expect(outputs[1]).toHaveLength(1);
		expect(outputs[1][0].json).toMatchObject({
			answers: { is_urgent: { noul: 0.5, lowConfidence: true } },
			lowConfidence: true,
			lowConfidenceQuestions: ['is_urgent'],
		});
		expect(outputs[1][0].json).not.toHaveProperty('answers.is_urgent.value');
		expect(outputs[1][0].pairedItem).toEqual({ item: 0 });
	});

	it('routes confident items to Confident output', async () => {
		const { functions } = createFunctions(
			{ ...baseEvaluate, fallbackMode: 'lowConfidenceOutput', confidenceThreshold: 0.7 },
			noulAnswer(0.95),
		);
		const outputs = await Decisions.prototype.execute.call(functions);
		expect(outputs).toHaveLength(2);
		expect(outputs[0]).toHaveLength(1);
		expect(outputs[1]).toHaveLength(0);
		expect(outputs[0][0].json).toMatchObject({
			lowConfidence: false,
			lowConfidenceQuestions: [],
		});
	});

	it('produces the same result from Raw JSON and fields', async () => {
		const rawParameters = {
			...baseEvaluate,
			questionsFormat: 'json',
			questionsJson: JSON.stringify({ is_urgent: { type: 'noul', instructions: 'Urgent?' } }),
			fallbackMode: 'bestGuess',
			confidenceThreshold: 0.7,
		};
		const fieldsFunctions = createFunctions(
			{ ...baseEvaluate, fallbackMode: 'bestGuess', confidenceThreshold: 0.7 },
			noulAnswer(0.62),
		);
		const rawFunctions = createFunctions(rawParameters, noulAnswer(0.62));
		const [fieldsOutputs, rawOutputs] = await Promise.all([
			Decisions.prototype.execute.call(fieldsFunctions.functions),
			Decisions.prototype.execute.call(rawFunctions.functions),
		]);
		expect(rawOutputs[0][0].json).toEqual(fieldsOutputs[0][0].json);
	});
});

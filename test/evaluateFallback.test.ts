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

const singleItem: INodeExecutionData[] = [{ json: { ticket: 1 } }];

interface MockOptions {
	items?: INodeExecutionData[];
	nodeVersion?: number;
	continueOnFail?: boolean;
}

function createFunctions(
	parameters: Record<string, unknown>,
	respond: (body: unknown) => unknown,
	options: MockOptions = {},
) {
	const items = options.items ?? singleItem;
	const request = vi.fn(async (_credential: unknown, requestOptions: { body: unknown }) =>
		respond(requestOptions.body),
	);
	return {
		request,
		functions: {
			getInputData: () => items,
			getNode: () => ({ ...node, typeVersion: options.nodeVersion ?? 1 }),
			continueOnFail: () => options.continueOnFail ?? false,
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

	it('passes the whole $parameter (including fallbackMode) to the outputs expression', () => {
		// The node description builds its outputs as `={{ (${configuredOutputs})($parameter) }}`.
		// Evaluating that template with the real $parameter is what n8n does, so the
		// wiring holds as long as the expression forwards $parameter untouched and the
		// function behind it honors fallbackMode (covered above and below).
		const outputsExpression = new Decisions().description.outputs as string;
		expect(outputsExpression).toContain('($parameter)');
		expect(outputsExpression).toContain('fallbackMode');
		expect(
			configuredOutputs({ operation: 'evaluate', fallbackMode: 'lowConfidenceOutput' }),
		).toEqual([
			{ type: 'main', displayName: 'Confident' },
			{ type: 'main', displayName: 'Low Confidence' },
		]);
		expect(
			configuredOutputs({
				operation: 'route',
				routeQuestionType: 'noul',
				confidenceHandling: 'separateOutput',
			}),
		).toEqual([
			{ type: 'main', displayName: 'True' },
			{ type: 'main', displayName: 'False' },
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

	it('keeps a confidence exactly on the threshold on the Confident output', async () => {
		const { functions } = createFunctions(
			{ ...baseEvaluate, fallbackMode: 'lowConfidenceOutput', confidenceThreshold: 0.7 },
			noulAnswer(0.85),
		);
		const outputs = await Decisions.prototype.execute.call(functions);
		expect(outputs[0]).toHaveLength(1);
		expect(outputs[1]).toHaveLength(0);
		expect(outputs[0][0].json).toMatchObject({
			answers: { is_urgent: { confidence: 0.7, lowConfidence: false } },
		});
	});

	it('sends the same questions payload from Raw JSON and fields', async () => {
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
		const fieldsBody = (
			fieldsFunctions.request.mock.calls[0] as unknown as [unknown, { body: Record<string, unknown> }]
		)[1].body;
		const rawBody = (
			rawFunctions.request.mock.calls[0] as unknown as [unknown, { body: Record<string, unknown> }]
		)[1].body;
		expect(rawBody.questions).toEqual(fieldsBody.questions);
		expect(rawOutputs[0][0].json).toEqual(fieldsOutputs[0][0].json);
	});

	it('enriches the raw answer shape when Simplify is off', async () => {
		const { functions } = createFunctions(
			{
				...baseEvaluate,
				fallbackMode: 'lowConfidenceOutput',
				confidenceThreshold: 0.7,
				'options.simplify': false,
			},
			noulAnswer(0.5),
		);
		const outputs = await Decisions.prototype.execute.call(functions);
		expect(outputs).toHaveLength(2);
		expect(outputs[1][0].json).toMatchObject({
			answers: { is_urgent: { type: 'noul', noul: 0.5, confidence: 0, lowConfidence: true } },
			lowConfidence: true,
			lowConfidenceQuestions: ['is_urgent'],
		});
		expect(outputs[1][0].json).toHaveProperty('usage');
		expect(outputs[1][0].json).not.toHaveProperty('answers.is_urgent.value');
	});

	it('routes mixed items to their own output in one run', async () => {
		const items = [{ json: { ticket: 1 } }, { json: { ticket: 2 } }];
		const probabilities = [0.95, 0.5];
		const { functions } = createFunctions(
			{ ...baseEvaluate, fallbackMode: 'lowConfidenceOutput', confidenceThreshold: 0.7 },
			() => noulAnswer(probabilities.shift() ?? 0.5)(),
			{ items },
		);
		const outputs = await Decisions.prototype.execute.call(functions);
		expect(outputs).toHaveLength(2);
		expect(outputs[0]).toHaveLength(1);
		expect(outputs[1]).toHaveLength(1);
		expect(outputs[0][0].json).toMatchObject({ ticket: 1, lowConfidence: false });
		expect(outputs[1][0].json).toMatchObject({ ticket: 2, lowConfidence: true });
		expect(outputs[0][0].pairedItem).toEqual({ item: 0 });
		expect(outputs[1][0].pairedItem).toEqual({ item: 1 });
	});

	it('sends a failing item to Low Confidence when continuing on fail', async () => {
		const { functions } = createFunctions(
			{ ...baseEvaluate, fallbackMode: 'lowConfidenceOutput', confidenceThreshold: 0.7 },
			() => ({ statusCode: 500, body: { detail: 'Server exploded' } }),
			{ continueOnFail: true },
		);
		const outputs = await Decisions.prototype.execute.call(functions);
		expect(outputs).toHaveLength(2);
		expect(outputs[0]).toHaveLength(0);
		expect(outputs[1]).toHaveLength(1);
		expect(outputs[1][0].json).toMatchObject({ ticket: 1, error: 'Server exploded' });
		expect(outputs[1][0].error?.message).toBe('Server exploded');
	});

	it('rejects a Fallback Mode that differs between items', async () => {
		const items = [{ json: { ticket: 1 } }, { json: { ticket: 2 } }];
		let call = 0;
		const functions = {
			getInputData: () => items,
			getNode: () => node,
			continueOnFail: () => false,
			getCredentials: async () => ({ provider: 'typesafe', apiKey: 'k', baseUrl: '' }),
			getNodeParameter: (name: string, itemIndex: number, fallback?: unknown) => {
				if (name === 'fallbackMode') {
					return itemIndex === 0 ? 'bestGuess' : 'lowConfidenceOutput';
				}
				if (name === 'operation') return 'evaluate';
				if (name === 'model') return 'jev-latest';
				if (name === 'stateFormat') return 'text';
				if (name === 'stateText') return 'Charged twice';
				if (name === 'questionsFormat') return 'fields';
				if (name === 'questions.question') {
					return [{ id: 'is_urgent', instructions: 'Urgent?', type: 'noul' }];
				}
				return fallback;
			},
			helpers: {
				httpRequestWithAuthentication: vi.fn(async () => {
					call++;
					return noulAnswer(0.9)(undefined);
				}),
			},
		} as unknown as IExecuteFunctions;
		await expect(Decisions.prototype.execute.call(functions)).rejects.toThrow(
			/'Fallback Mode' must be the same for every item/,
		);
		expect(call).toBe(0);
	});

	it.each([[Number.NaN], [-1], [2], ['high']])(
		'rejects a Confidence Threshold of %s',
		async (threshold) => {
			const { functions } = createFunctions(
				{ ...baseEvaluate, fallbackMode: 'bestGuess', confidenceThreshold: threshold },
				noulAnswer(0.9),
			);
			await expect(Decisions.prototype.execute.call(functions)).rejects.toThrow(
				/'Confidence Threshold'/,
			);
		},
	);

	it('routes a refusal to Low Confidence with confidence 0 and no value', async () => {
		const { functions } = createFunctions(
			{ ...baseEvaluate, fallbackMode: 'lowConfidenceOutput', confidenceThreshold: 0.7 },
			() => ({
				statusCode: 200,
				body: {
					model: 'jev-1.13.0',
					answers: { is_urgent: { type: 'refusal' } },
					usage: { input_tokens: 1, output_tokens: 1 },
				},
			}),
		);
		const outputs = await Decisions.prototype.execute.call(functions);
		expect(outputs).toHaveLength(2);
		expect(outputs[0]).toHaveLength(0);
		expect(outputs[1][0].json).toMatchObject({
			answers: { is_urgent: { confidence: 0, lowConfidence: true } },
			lowConfidence: true,
			lowConfidenceQuestions: ['is_urgent'],
		});
		expect(outputs[1][0].json).not.toHaveProperty('answers.is_urgent.value');
	});

	it('derives exactly 0.1 confidence for Noul 0.55 without float noise', async () => {
		const { functions } = createFunctions(
			{ ...baseEvaluate, fallbackMode: 'bestGuess', confidenceThreshold: 0.7 },
			noulAnswer(0.55),
		);
		const outputs = await Decisions.prototype.execute.call(functions);
		expect(outputs[0][0].json).toMatchObject({
			answers: { is_urgent: { noul: 0.55, confidence: 0.1, lowConfidence: true } },
		});
	});

	it('returns empty outputs for empty input', async () => {
		const { functions, request } = createFunctions(
			{ ...baseEvaluate, fallbackMode: 'lowConfidenceOutput', confidenceThreshold: 0.7 },
			noulAnswer(0.9),
			{ items: [] },
		);
		const outputs = await Decisions.prototype.execute.call(functions);
		expect(outputs).toEqual([[], []]);
		expect(request).not.toHaveBeenCalled();
	});
});

describe('Evaluate fallback with OpenAI predicates', () => {
	const openAiCredentials = { provider: 'openai', apiKey: 'k', baseUrl: '' };

	function openAiFunctions(
		parameters: Record<string, unknown>,
		probability: number,
		items: INodeExecutionData[] = singleItem,
	) {
		const request = vi.fn(async () => ({
			statusCode: 200,
			body: { answers: [{ type: 'predicate', name: 'is_urgent', probability }] },
		}));
		return {
			functions: {
				getInputData: () => items,
				getNode: () => ({ ...node, typeVersion: 2 }),
				continueOnFail: () => false,
				getCredentials: async () => openAiCredentials,
				getNodeParameter: (name: string, _itemIndex: number, fallback?: unknown) => {
					return name in parameters ? parameters[name] : fallback;
				},
				helpers: { httpRequestWithAuthentication: request },
			} as unknown as IExecuteFunctions,
		};
	}

	const predicateEvaluate: Record<string, unknown> = {
		operation: 'evaluate',
		model: 'gpt-6-luna',
		stateFormat: 'text',
		stateText: 'I was charged twice for my order.',
		questionsFormat: 'fields',
		'questions.question': [{ id: 'is_urgent', instructions: 'Is it urgent?', type: 'noul' }],
	};

	it('resolves value and confidence end to end in Best Guess', async () => {
		const { functions } = openAiFunctions(
			{ ...predicateEvaluate, fallbackMode: 'bestGuess', confidenceThreshold: 0.7 },
			0.9,
		);
		const outputs = await Decisions.prototype.execute.call(functions);
		expect(outputs[0][0].json).toMatchObject({
			answers: { is_urgent: { probability: 0.9, confidence: 0.8, lowConfidence: false, value: true } },
		});
	});

	it('routes a doubtful predicate to Low Confidence end to end', async () => {
		const { functions } = openAiFunctions(
			{ ...predicateEvaluate, fallbackMode: 'lowConfidenceOutput', confidenceThreshold: 0.7 },
			0.55,
		);
		const outputs = await Decisions.prototype.execute.call(functions);
		expect(outputs).toHaveLength(2);
		expect(outputs[0]).toHaveLength(0);
		expect(outputs[1][0].json).toMatchObject({
			answers: { is_urgent: { probability: 0.55, confidence: 0.1, lowConfidence: true } },
			lowConfidence: true,
			lowConfidenceQuestions: ['is_urgent'],
		});
	});
});

import type { IExecuteFunctions, INode, INodeExecutionData } from 'n8n-workflow';
import { describe, expect, it, vi } from 'vitest';

import { Decisions } from '../nodes/Decisions/Decisions.node';

const baseNode: INode = {
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
	nodeVersion = 2,
	continueOnFail = false,
) {
	const request = vi.fn(async (_credential: unknown, requestOptions: { body: unknown }) =>
		respond(requestOptions.body),
	);
	return {
		request,
		functions: {
			getInputData: () => items,
			getNode: () => ({ ...baseNode, typeVersion: nodeVersion }),
			continueOnFail: () => continueOnFail,
			getCredentials: async () => ({ provider: 'typesafe', apiKey: 'k', baseUrl: '' }),
			getNodeParameter: (name: string, _itemIndex: number, fallback?: unknown) => {
				return name in parameters ? parameters[name] : fallback;
			},
			helpers: { httpRequestWithAuthentication: request },
		} as unknown as IExecuteFunctions,
	};
}

const noulResponse = (noul: number) => () => ({
	statusCode: 200,
	body: {
		model: 'jev-1.13.0',
		answers: { route: { type: 'noul', noul } },
		usage: { input_tokens: 1, output_tokens: 1 },
	},
});

const noulV2Parameters: Record<string, unknown> = {
	operation: 'route',
	routeQuestionType: 'noul',
	model: 'jev-latest',
	stateFormat: 'inputItem',
	routeInstructions: 'Is this ticket urgent?',
	confidenceHandling: 'separateOutput',
	confidenceThreshold: 0.7,
};

async function routeNoul(
	noul: number,
	parameters: Record<string, unknown> = noulV2Parameters,
	nodeVersion = 2,
	continueOnFail = false,
) {
	const { functions } = createFunctions(parameters, noulResponse(noul), nodeVersion, continueOnFail);
	return Decisions.prototype.execute.call(functions);
}

describe('Route Noul v2', () => {
	it('sends a high probability to True', async () => {
		const outputs = await routeNoul(0.9);
		expect(outputs).toHaveLength(3);
		expect(outputs[0][0].json.route).toEqual({ noul: 0.9 });
		expect(outputs[1]).toHaveLength(0);
		expect(outputs[2]).toHaveLength(0);
	});

	it('sends a low probability to False', async () => {
		const outputs = await routeNoul(0.1);
		expect(outputs[1][0].json.route).toEqual({ noul: 0.1 });
	});

	it('sends an unsure probability to Low Confidence', async () => {
		const outputs = await routeNoul(0.5);
		expect(outputs[0]).toHaveLength(0);
		expect(outputs[1]).toHaveLength(0);
		expect(outputs[2][0].json.route).toEqual({ noul: 0.5 });
	});

	it('keeps a confidence exactly on the threshold out of Low Confidence', async () => {
		const outputs = await routeNoul(0.85);
		expect(outputs[0][0].json.route).toEqual({ noul: 0.85 });
		expect(outputs[2]).toHaveLength(0);
	});

	it('routes by p > 0.5 without a separate output', async () => {
		const parameters = { ...noulV2Parameters, confidenceHandling: 'bestOption' };
		const confident = await routeNoul(0.6, parameters);
		expect(confident).toHaveLength(2);
		expect(confident[0][0].json.route).toEqual({ noul: 0.6 });
		const doubtful = await routeNoul(0.4, parameters);
		expect(doubtful[1][0].json.route).toEqual({ noul: 0.4 });
	});

	it('ignores the v1 thresholds when a separate output is enabled', async () => {
		const outputs = await routeNoul(0.5, {
			...noulV2Parameters,
			trueThreshold: 0.8,
			falseThreshold: 0.2,
		});
		expect(outputs).toHaveLength(3);
		expect(outputs[2][0].json.route).toEqual({ noul: 0.5 });
	});

	it('follows p > 0.5 without a separate output even with v1 thresholds saved', async () => {
		const parameters = {
			...noulV2Parameters,
			confidenceHandling: 'bestOption',
			trueThreshold: 0.8,
			falseThreshold: 0.2,
		};
		const aboveHalf = await routeNoul(0.6, parameters);
		expect(aboveHalf).toHaveLength(2);
		expect(aboveHalf[0][0].json.route).toEqual({ noul: 0.6 });
		const belowHalf = await routeNoul(0.4, parameters);
		expect(belowHalf[1][0].json.route).toEqual({ noul: 0.4 });
	});

	it('rejects a non-finite threshold', async () => {
		await expect(
			routeNoul(0.9, { ...noulV2Parameters, confidenceThreshold: Number.NaN }),
		).rejects.toThrow(/'Confidence Threshold'/);
	});

	it.each([[-1], [2]])('rejects a threshold of %s outside 0-1', async (threshold) => {
		await expect(
			routeNoul(0.9, { ...noulV2Parameters, confidenceThreshold: threshold }),
		).rejects.toThrow(/'Confidence Threshold'.*outside 0–1/);
	});

	it('sends a failing item to Low Confidence when continuing on fail', async () => {
		const { functions } = createFunctions(
			noulV2Parameters,
			() => ({ statusCode: 500, body: { detail: 'Server exploded' } }),
			2,
			true,
		);
		const outputs = await Decisions.prototype.execute.call(functions);
		expect(outputs[0]).toHaveLength(0);
		expect(outputs[1]).toHaveLength(0);
		expect(outputs[2][0].json).toMatchObject({ ticket: 1, error: 'Server exploded' });
	});

	it('sends a failing item to False without a separate output when continuing on fail', async () => {
		const { functions } = createFunctions(
			{ ...noulV2Parameters, confidenceHandling: 'bestOption' },
			() => ({ statusCode: 500, body: { detail: 'Server exploded' } }),
			2,
			true,
		);
		const outputs = await Decisions.prototype.execute.call(functions);
		expect(outputs).toHaveLength(2);
		expect(outputs[1][0].json).toMatchObject({ ticket: 1, error: 'Server exploded' });
	});
});

describe('Route Choice and Score share the v2 threshold', () => {
	const choiceResponse = (choice: string, confidence: number) => () => ({
		statusCode: 200,
		body: {
			model: 'jev-1.13.0',
			answers: { route: { type: 'choice', choice, confidence } },
			usage: { input_tokens: 1, output_tokens: 1 },
		},
	});

	const choiceV2: Record<string, unknown> = {
		operation: 'route',
		routeQuestionType: 'choice',
		model: 'jev-latest',
		stateFormat: 'inputItem',
		routeInstructions: 'Which department should handle this?',
		'routes.route': [{ name: 'billing' }, { name: 'technical' }],
		confidenceHandling: 'separateOutput',
		confidenceThreshold: 0.7,
	};

	it('uses the same threshold for Choice', async () => {
		const { functions } = createFunctions(choiceV2, choiceResponse('billing', 0.6));
		const outputs = await Decisions.prototype.execute.call(functions);
		expect(outputs).toHaveLength(3);
		expect(outputs[2][0].json.route).toEqual({ choice: 'billing', confidence: 0.6 });
		const { functions: confident } = createFunctions(choiceV2, choiceResponse('billing', 0.7));
		const confidentOutputs = await Decisions.prototype.execute.call(confident);
		expect(confidentOutputs[0][0].json.route).toEqual({ choice: 'billing', confidence: 0.7 });
	});

	it('defaults the v2 threshold to 0.7', async () => {
		const withoutThreshold = { ...choiceV2 };
		delete withoutThreshold.confidenceThreshold;
		const { functions } = createFunctions(withoutThreshold, choiceResponse('billing', 0.6));
		const outputs = await Decisions.prototype.execute.call(functions);
		expect(outputs[2]).toHaveLength(1);
	});

	const scoreV2: Record<string, unknown> = {
		operation: 'route',
		routeQuestionType: 'score',
		model: 'jev-latest',
		stateFormat: 'inputItem',
		routeInstructions: 'How frustrated is the customer?',
		'routeLevels.level': [{ level: 'Calm' }, { level: 'Frustrated' }, { level: 'Furious' }],
		confidenceHandling: 'separateOutput',
		confidenceThreshold: 0.5,
	};

	const scoreResponse = (score: number, confidence: number) => () => ({
		statusCode: 200,
		body: {
			model: 'jev-1.13.0',
			answers: { route: { type: 'score', score, confidence } },
			usage: { input_tokens: 1, output_tokens: 1 },
		},
	});

	it('sends a low-confidence score to Low Confidence', async () => {
		const { functions } = createFunctions(scoreV2, scoreResponse(1.3, 0.4));
		const outputs = await Decisions.prototype.execute.call(functions);
		expect(outputs).toHaveLength(4);
		expect(outputs[3][0].json.route).toEqual({ score: 1.3, confidence: 0.4 });
	});

	it('sends a confident score to its level', async () => {
		const { functions } = createFunctions(scoreV2, scoreResponse(1.3, 0.9));
		const outputs = await Decisions.prototype.execute.call(functions);
		expect(outputs[1][0].json.route).toEqual({ score: 1.3, confidence: 0.9 });
		expect(outputs[3]).toHaveLength(0);
	});

	it('routes scores without a separate output as before', async () => {
		const { functions } = createFunctions(
			{ ...scoreV2, confidenceHandling: 'bestOption' },
			scoreResponse(1.3, 0.1),
		);
		const outputs = await Decisions.prototype.execute.call(functions);
		expect(outputs).toHaveLength(3);
		expect(outputs[1][0].json.route).toEqual({ score: 1.3, confidence: 0.1 });
	});
});

describe('Route v1 workflows keep working', () => {
	const noulV1: Record<string, unknown> = {
		operation: 'route',
		routeQuestionType: 'noul',
		model: 'jev-latest',
		stateFormat: 'inputItem',
		routeInstructions: 'Is this ticket urgent?',
		trueThreshold: 0.8,
		falseThreshold: 0.2,
	};

	it('still routes through the Uncertain output by thresholds', async () => {
		const outputs = await routeNoul(0.5, noulV1, 1);
		expect(outputs).toHaveLength(3);
		expect(outputs[2][0].json.route).toEqual({ noul: 0.5 });
		const high = await routeNoul(0.9, noulV1, 1);
		expect(high[0][0].json.route).toEqual({ noul: 0.9 });
		const low = await routeNoul(0.1, noulV1, 1);
		expect(low[1][0].json.route).toEqual({ noul: 0.1 });
	});

	it('still rejects overlapping thresholds', async () => {
		await expect(
			routeNoul(0.5, { ...noulV1, trueThreshold: 0.3, falseThreshold: 0.7 }, 1),
		).rejects.toThrow(/'True Probability Threshold'/);
	});

	it('uses the unified 0.7 default threshold in v1 Choice too', async () => {
		const { functions } = createFunctions(
			{
				operation: 'route',
				model: 'jev-latest',
				stateFormat: 'inputItem',
				routeInstructions: 'Which department should handle this?',
				'routes.route': [{ name: 'billing' }, { name: 'technical' }],
				confidenceHandling: 'separateOutput',
			},
			() => ({
				statusCode: 200,
				body: {
					model: 'jev-1.13.0',
					answers: { route: { type: 'choice', choice: 'billing', confidence: 0.6 } },
					usage: { input_tokens: 1, output_tokens: 1 },
				},
			}),
			1,
		);
		const outputs = await Decisions.prototype.execute.call(functions);
		expect(outputs[2][0].json.route).toEqual({ choice: 'billing', confidence: 0.6 });
	});
});

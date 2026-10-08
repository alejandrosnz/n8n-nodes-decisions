import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import type {
	Answer,
	ChoiceAnswer,
	DecisionsCredentials,
	NoulAnswer,
	PredicateAnswer,
	RefusalAnswer,
	ScoreAnswer,
} from './api';
import { CREDENTIAL_NAME, evaluateState, usesOpenAiFormat } from './api';
import type { EvaluateFallbackMode } from './confidence';
import { enrichAnswers, getConfidence } from './confidence';
import { decisionsProperties } from './descriptions';
import type { CriteriaEntry, ItemContext, LevelEntry, QuestionEntry } from './helpers';
import {
	buildCriteriaMap,
	buildLevels,
	buildNoulQuestion,
	buildOutputItem,
	buildQuestionsFromEntries,
	configuredOutputs,
	fail,
	nearestLevel,
	parseJsonParameter,
	parseQuestionsJson,
	ROUTE_QUESTION_ID,
	simplifyAnswer,
	simplifyAnswers,
} from './helpers';

function buildState(
	functions: IExecuteFunctions,
	context: ItemContext,
	item: INodeExecutionData,
): unknown {
	const { itemIndex } = context;
	const format = functions.getNodeParameter('stateFormat', itemIndex) as string;
	if (format === 'inputItem') {
		return item.json;
	}
	if (format === 'json') {
		const parsed = parseJsonParameter(
			context,
			functions.getNodeParameter('stateJson', itemIndex),
			'State',
		);
		if (typeof parsed !== 'object' || parsed === null) {
			fail(context, "'State' must be a JSON object or array");
		}
		return parsed;
	}
	const text = functions.getNodeParameter('stateText', itemIndex);
	if (typeof text === 'object' && text !== null) {
		return text;
	}
	// An expression can resolve to a number or boolean, which is sent as text
	if (typeof text === 'number' || typeof text === 'boolean') {
		return String(text);
	}
	if (typeof text !== 'string' || text.trim() === '') {
		fail(context, "'State' is empty", 'Enter the content to evaluate');
	}
	return text;
}

function readModel(functions: IExecuteFunctions, context: ItemContext): string {
	const model = functions.getNodeParameter('model', context.itemIndex, '') as string;
	if (typeof model !== 'string' || model.trim() === '') {
		fail(context, "'Model' is empty", 'Enter the model ID to evaluate with');
	}
	return model.trim();
}

function isNoulRoute(functions: IExecuteFunctions, itemIndex: number): boolean {
	return functions.getNodeParameter('routeQuestionType', itemIndex, 'choice') === 'noul';
}

function isScoreRoute(functions: IExecuteFunctions, itemIndex: number): boolean {
	return functions.getNodeParameter('routeQuestionType', itemIndex, 'choice') === 'score';
}

/** The two probability thresholds, checked so that they cannot overlap.
 * Only used by node version 1; version 2 routes Noul by confidence. */
function readThresholds(
	functions: IExecuteFunctions,
	context: ItemContext,
): { trueThreshold: number; falseThreshold: number } {
	const trueThreshold = functions.getNodeParameter(
		'trueThreshold',
		context.itemIndex,
		0.5,
	) as number;
	const falseThreshold = functions.getNodeParameter(
		'falseThreshold',
		context.itemIndex,
		0.5,
	) as number;
	if (trueThreshold < falseThreshold) {
		fail(
			context,
			`'True Probability Threshold' (${trueThreshold}) is below 'False Probability Threshold' (${falseThreshold})`,
			"Set 'True Probability Threshold' at or above 'False Probability Threshold'",
		);
	}
	return { trueThreshold, falseThreshold };
}

/** A confidence threshold in [0, 1]. An expression can resolve to anything,
 * so a non-finite number or a value outside the range is an error rather than
 * silently disabling the filter. */
function readConfidenceThreshold(
	functions: IExecuteFunctions,
	context: ItemContext,
	defaultValue: number,
): number {
	const threshold = functions.getNodeParameter(
		'confidenceThreshold',
		context.itemIndex,
		defaultValue,
	) as number;
	if (typeof threshold !== 'number' || !Number.isFinite(threshold)) {
		fail(
			context,
			`'Confidence Threshold' (${String(threshold)}) is not a number`,
			'Set it to a number between 0 and 1',
		);
	}
	if (threshold < 0 || threshold > 1) {
		fail(
			context,
			`'Confidence Threshold' (${threshold}) is outside 0–1`,
			'Set it to a number between 0 and 1',
		);
	}
	return threshold;
}

/** The index of the output a Choice answer routes to.
 * An answer without a confidence source is treated as reliable, like Evaluate. */
function resolveChoiceRoute(
	context: ItemContext,
	answer: ChoiceAnswer | RefusalAnswer | undefined,
	routeNames: string[],
	separateLowConfidence: boolean,
	threshold: number,
): number {
	if (answer?.type === 'refusal') {
		fail(context, 'The model refused to answer the route question');
	}
	const chosen = String(answer?.choice ?? '');
	const targetIndex = routeNames.indexOf(chosen);
	if (targetIndex === -1) {
		fail(context, `The model answered "${chosen}", which is not one of the configured routes`);
	}
	const confidence = answer?.type === 'choice' ? answer.confidence : undefined;
	const lowConfidence =
		separateLowConfidence &&
		confidence !== undefined &&
		Number.isFinite(confidence) &&
		confidence < threshold;
	return lowConfidence ? routeNames.length : targetIndex;
}

/** The index of the output a Noul answer routes to in version 1:
 * True, False, then Uncertain */
function resolveNoulRoute(
	functions: IExecuteFunctions,
	context: ItemContext,
	answer: NoulAnswer | PredicateAnswer | RefusalAnswer | undefined,
	hasUncertain: boolean,
): number {
	if (answer === undefined) {
		fail(context, 'The model returned no answer for this route');
	}
	if (answer.type === 'refusal') {
		fail(context, 'The model refused to answer the route question');
	}
	const probability = answer.type === 'predicate' ? answer.probability : answer.noul;
	const { trueThreshold, falseThreshold } = readThresholds(functions, context);
	if (probability >= trueThreshold) {
		return 0;
	}
	if (probability <= falseThreshold) {
		return 1;
	}
	return hasUncertain ? 2 : 1;
}

/** The index of the output a Noul answer routes to in version 2: True or
 * False, or Low Confidence when the answer is unsure. Confidence is
 * |p − 0.5| × 2, so confidence ≥ c means p ≥ 0.5 + c/2 (true) or
 * p ≤ 0.5 − c/2 (false). A confidence exactly on the threshold is not low. */
function resolveNoulRouteV2(
	context: ItemContext,
	answer: NoulAnswer | PredicateAnswer | RefusalAnswer | undefined,
	separateLowConfidence: boolean,
	threshold: number,
): number {
	if (answer === undefined) {
		fail(context, 'The model returned no answer for this route');
	}
	if (answer.type === 'refusal') {
		fail(context, 'The model refused to answer the route question');
	}
	const probability = answer.type === 'predicate' ? answer.probability : answer.noul;
	if (typeof probability !== 'number' || !Number.isFinite(probability)) {
		fail(context, 'The model returned a probability that is not a number');
	}
	const confidence = getConfidence(
		answer.type === 'predicate' ? { probability } : { noul: probability },
	);
	if (separateLowConfidence && (confidence ?? 0) < threshold) {
		return 2;
	}
	return probability > 0.5 ? 0 : 1;
}

/** The index of the output a Score answer routes to: its nearest level.
 * With `rejectOutOfRange` a score outside the levels is an error instead of
 * going to the nearest end, so an unverified score scale cannot misroute.
 * In version 2 a separate low-confidence output appends last, after the levels.
 * An answer without a confidence source is treated as reliable, like Evaluate. */
function resolveScoreRoute(
	context: ItemContext,
	answer: ScoreAnswer | RefusalAnswer | undefined,
	levelCount: number,
	rejectOutOfRange: boolean,
	separateLowConfidence: boolean,
	threshold: number,
): number {
	if (answer === undefined) {
		fail(context, 'The model returned no answer for this route');
	}
	if (answer.type === 'refusal') {
		fail(context, 'The model refused to answer the route question');
	}
	const score = answer.score;
	if (typeof score !== 'number' || !Number.isFinite(score)) {
		fail(context, 'The model returned a score that is not a number');
	}
	if (rejectOutOfRange && (score < -0.5 || score > levelCount - 0.5)) {
		fail(
			context,
			`The model returned score ${score} for ${levelCount} levels`,
			`Scores run from level 0 to level ${levelCount - 1}. This score falls outside that range, so the node stops instead of routing to the nearest end.`,
		);
	}
	if (separateLowConfidence) {
		const confidence = answer.type === 'score' ? answer.confidence : undefined;
		if (
			confidence !== undefined &&
			Number.isFinite(confidence) &&
			confidence < threshold
		) {
			return levelCount;
		}
	}
	return nearestLevel(score, levelCount);
}

function buildQuestions(
	functions: IExecuteFunctions,
	context: ItemContext,
	operation: string,
	allowArray: boolean,
): IDataObject | IDataObject[] {
	const { itemIndex } = context;
	if (operation === 'route') {
		const instructions = (
			functions.getNodeParameter('routeInstructions', itemIndex) as string
		).trim();
		if (instructions === '') {
			fail(
				context,
				"'Instructions' is empty",
				'Enter the question the model answers to route the item',
			);
		}
		if (isNoulRoute(functions, itemIndex)) {
			if ((functions.getNode().typeVersion ?? 1) < 2) {
				readThresholds(functions, context);
			}
			return {
				[ROUTE_QUESTION_ID]: buildNoulQuestion(
					instructions,
					functions.getNodeParameter('routeTrueMeans', itemIndex, ''),
					functions.getNodeParameter('routeFalseMeans', itemIndex, ''),
				),
			};
		}
		if (isScoreRoute(functions, itemIndex)) {
			const levels = functions.getNodeParameter('routeLevels.level', itemIndex, []) as LevelEntry[];
			return {
				[ROUTE_QUESTION_ID]: {
					type: 'score',
					instructions,
					criteria: buildLevels(context, levels, "'Levels'"),
				},
			};
		}
		const routes = functions.getNodeParameter('routes.route', itemIndex, []) as CriteriaEntry[];
		return {
			[ROUTE_QUESTION_ID]: {
				type: 'choice',
				instructions,
				criteria: buildCriteriaMap(context, routes, 'route', "'Routes'"),
			},
		};
	}
	if ((functions.getNodeParameter('questionsFormat', itemIndex) as string) === 'json') {
		return parseQuestionsJson(
			context,
			functions.getNodeParameter('questionsJson', itemIndex),
			allowArray,
		);
	}
	return buildQuestionsFromEntries(
		context,
		functions.getNodeParameter('questions.question', itemIndex, []) as QuestionEntry[],
	);
}

export class Decisions implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Decisions',
		name: 'decisions',
		icon: { light: 'file:decisions.svg', dark: 'file:decisions.dark.svg' },
		group: ['transform'],
		version: [1, 2],
		defaultVersion: 2,
		subtitle: '={{ $parameter["operation"] }}',
		description: 'Ask Decisions API typed questions and get calibrated probabilities',
		defaults: { name: 'Decisions' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: `={{ (${configuredOutputs})($parameter, $nodeVersion) }}`,
		credentials: [{ name: CREDENTIAL_NAME, required: true }],
		properties: decisionsProperties,
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const node = this.getNode();
		const nodeVersion = node.typeVersion ?? 1;
		const isV2 = nodeVersion >= 2;
		const operation = this.getNodeParameter('operation', 0) as string;
		const isRoute = operation === 'route';
		const isNoul = isRoute && isNoulRoute(this, 0);
		const isScore = isRoute && isScoreRoute(this, 0);
		const levelCount = (this.getNodeParameter('routeLevels.level', 0, []) as LevelEntry[]).length;
		const routeNames = (this.getNodeParameter('routes.route', 0, []) as CriteriaEntry[])
			.map(({ name }) => (name ?? '').trim())
			.filter(Boolean);
		// One confidence threshold everywhere, defaulting to 0.7.
		const routeDefaultThreshold = 0.7;
		const separateLowConfidence =
			isRoute &&
			(isV2 || (!isNoul && !isScore)) &&
			this.getNodeParameter('confidenceHandling', 0) === 'separateOutput';
		// Route outputs, in order: the routes then Fallback, True, False and
		// Uncertain (v1 only), or one per level. Uncertain exists only when the
		// v1 thresholds leave a gap. In v2 Noul and Score append Low Confidence
		// instead when a separate output is enabled.
		const hasUncertain =
			!isV2 &&
			isNoul &&
			(this.getNodeParameter('trueThreshold', 0, 0.5) as number) >
				(this.getNodeParameter('falseThreshold', 0, 0.5) as number);
		// The output count is resolved before the run, so it cannot depend on a
		// per-item expression value. The mode is read once and every item must
		// agree with it.
		let evaluateMode: EvaluateFallbackMode = 'disabled';
		if (!isRoute) {
			evaluateMode = this.getNodeParameter('fallbackMode', 0, 'disabled') as EvaluateFallbackMode;
			for (let scanIndex = 1; scanIndex < items.length; scanIndex++) {
				const mode = this.getNodeParameter(
					'fallbackMode',
					scanIndex,
					'disabled',
				) as EvaluateFallbackMode;
				if (mode !== evaluateMode) {
					throw new NodeOperationError(
						node,
						`'Fallback Mode' must be the same for every item, but item 0 uses '${evaluateMode}' and item ${scanIndex} uses '${mode}'`,
						{ itemIndex: scanIndex },
					);
				}
			}
		}
		const evaluateTwoOutputs = evaluateMode === 'lowConfidenceOutput';
		// The runtime output count is the editor output count by construction:
		// the same function and the same parameter snapshot decide both.
		const outputCount = configuredOutputs(
			{
				operation,
				routeQuestionType: isRoute
					? (this.getNodeParameter('routeQuestionType', 0, 'choice') as string)
					: undefined,
				routes: {
					route: this.getNodeParameter('routes.route', 0, []) as Array<{ name?: string }>,
				},
				routeLevels: {
					level: this.getNodeParameter('routeLevels.level', 0, []) as Array<{ level?: string }>,
				},
				confidenceHandling: this.getNodeParameter(
					'confidenceHandling',
					0,
					'bestOption',
				) as string,
				routeTrueMeans: this.getNodeParameter('routeTrueMeans', 0, '') as string,
				routeFalseMeans: this.getNodeParameter('routeFalseMeans', 0, '') as string,
				trueThreshold: this.getNodeParameter('trueThreshold', 0, 0.5) as number,
				falseThreshold: this.getNodeParameter('falseThreshold', 0, 0.5) as number,
				fallbackMode: evaluateMode,
			},
			nodeVersion,
		).length;
		const outputs: INodeExecutionData[][] = Array.from(
			{ length: Math.max(outputCount, 1) },
			() => [],
		);

		const credentials = (await this.getCredentials(CREDENTIAL_NAME)) as DecisionsCredentials;
		const isOpenAi = usesOpenAiFormat(credentials);

		const processItem = async (itemIndex: number, includeOtherFields: boolean): Promise<void> => {
			const item = items[itemIndex];
			const context: ItemContext = { node, itemIndex };

			// Validate the threshold before the API call so a bad value fails
			// fast without spending a request. Only paths using confidence read it.
			const usesConfidence =
				(!isRoute && evaluateMode !== 'disabled') ||
				(isRoute &&
					((!isNoul && !isScore) || (isNoul && isV2) || (isScore && isV2 && separateLowConfidence)));
			const threshold = usesConfidence
				? readConfidenceThreshold(this, context, routeDefaultThreshold)
				: routeDefaultThreshold;

			const response = await evaluateState(
				this,
				itemIndex,
				{
					state: buildState(this, context, item),
					model: readModel(this, context),
					questions: buildQuestions(this, context, operation, isOpenAi),
				} as IDataObject,
				this.getNodeParameter('options.timeout', itemIndex, 5000) as number,
			);

			if (!isRoute) {
				const answers: Record<string, Answer> = response.answers ?? {};
				const simplify = this.getNodeParameter('options.simplify', itemIndex, true) as boolean;
				// The pre-scan guarantees every item shares this mode, so it is
				// read once up front instead of per item.
				const fallbackMode = evaluateMode;
				if (fallbackMode !== 'bestGuess' && fallbackMode !== 'lowConfidenceOutput') {
					const fields: IDataObject = simplify
						? { answers: simplifyAnswers(answers), model: response.model }
						: { answers, model: response.model, usage: response.usage };
					outputs[0].push(buildOutputItem(item, fields, includeOtherFields, itemIndex));
					return;
				}
				const base: Record<string, IDataObject> = simplify
					? (simplifyAnswers(answers) as Record<string, IDataObject>)
					: Object.fromEntries(
							Object.entries(answers).map(([id, answer]) => [
								id,
								{ ...(answer as unknown as IDataObject) },
							]),
						);
				// Confidence is assessed on the raw API answers, before Simplify,
				// so refusal detection never depends on the simplified shape.
				const { answers: enriched, lowConfidenceQuestions } = enrichAnswers(
					base,
					fallbackMode,
					threshold,
					answers,
				);
				if (fallbackMode === 'bestGuess') {
					const fields: IDataObject = simplify
						? { answers: enriched, model: response.model }
						: { answers: enriched, model: response.model, usage: response.usage };
					outputs[0].push(buildOutputItem(item, fields, includeOtherFields, itemIndex));
					return;
				}
				const isLow = lowConfidenceQuestions.length > 0;
				const fields: IDataObject = simplify
					? {
							answers: enriched,
							model: response.model,
							lowConfidence: isLow,
							lowConfidenceQuestions,
						}
					: {
							answers: enriched,
							model: response.model,
							usage: response.usage,
							lowConfidence: isLow,
							lowConfidenceQuestions,
						};
				const target = isLow ? 1 : 0;
				if (target >= outputs.length) {
					fail(
						context,
						`'Fallback Mode' is 'Low Confidence Output' but the node has ${outputs.length} output(s)`,
						'Reconnect the node so both the Confident and Low Confidence outputs exist',
					);
				}
				outputs[target].push(
					buildOutputItem(item, fields, includeOtherFields, itemIndex),
				);
				return;
			}

			// The route object is the answer exactly as Evaluate would emit it for
			// the current Simplify setting. The output it leaves from is the decision.
			const answer = response.answers?.[ROUTE_QUESTION_ID];
			const simplify = this.getNodeParameter('options.simplify', itemIndex, true) as boolean;
			const answerFields =
				answer === undefined
					? {}
					: simplify
						? simplifyAnswer(answer)
						: (answer as unknown as IDataObject);
			const targetIndex = isNoul
				? isV2
					? resolveNoulRouteV2(
							context,
							answer as NoulAnswer | PredicateAnswer | RefusalAnswer | undefined,
							separateLowConfidence,
							threshold,
						)
					: resolveNoulRoute(
							this,
							context,
							answer as NoulAnswer | PredicateAnswer | RefusalAnswer | undefined,
							hasUncertain,
						)
				: isScore
					? resolveScoreRoute(
							context,
							answer as ScoreAnswer | RefusalAnswer | undefined,
							levelCount,
							isOpenAi,
							isV2 && separateLowConfidence,
							threshold,
						)
					: resolveChoiceRoute(
							context,
							answer as ChoiceAnswer | RefusalAnswer | undefined,
							routeNames,
							separateLowConfidence,
							threshold,
						);
			const fields: IDataObject = {
				route: answerFields,
				model: response.model,
			};
			if (!simplify) {
				fields.usage = response.usage;
			}
			outputs[targetIndex].push(buildOutputItem(item, fields, includeOtherFields, itemIndex));
		};

		const continueOnFail = this.continueOnFail();
		// A failure is not a routing decision, so it goes to the low-confidence
		// output where one exists. In Noul v1 mode that is always the last
		// output. A Score without one goes to the first output.
		const errorOutputIndex = !isRoute
			? evaluateTwoOutputs
				? 1
				: 0
			: isNoul
				? outputs.length - 1
				: separateLowConfidence
					? outputs.length - 1
					: 0;
		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			const includeOtherFields = this.getNodeParameter(
				'options.includeOtherFields',
				itemIndex,
				true,
			) as boolean;
			if (!continueOnFail) {
				await processItem(itemIndex, includeOtherFields);
				continue;
			}
			try {
				await processItem(itemIndex, includeOtherFields);
			} catch (error) {
				// n8n moves an item carrying `error` to the error output when On Error
				// is set to use one, whatever else the item holds
				const failure =
					error instanceof NodeApiError || error instanceof NodeOperationError
						? error
						: new NodeOperationError(node, error as Error, { itemIndex });
				outputs[errorOutputIndex].push({
					...buildOutputItem(
						items[itemIndex],
						{ error: (error as Error).message },
						includeOtherFields,
						itemIndex,
					),
					error: failure,
				});
			}
		}

		return outputs;
	}
}

import type { IDataObject } from 'n8n-workflow';

export type EvaluateFallbackMode = 'disabled' | 'bestGuess' | 'lowConfidenceOutput';

type ConfidenceSource = {
	type?: unknown;
	confidence?: unknown;
	noul?: unknown;
	probability?: unknown;
};

/** Round to 1e-9 so binary float noise never flips a threshold comparison */
function roundConfidence(value: number): number {
	return Math.round(value * 1e9) / 1e9;
}

/** Normalized confidence of an answer, from 0 to 1.
 * Choice and Score use their own `confidence`. Noul and predicate derive it
 * as |p − 0.5| × 2. A refusal has confidence 0. Answers without a confidence
 * source return undefined and are treated as reliable. */
export function getConfidence(answer: ConfidenceSource | null | undefined): number | undefined {
	if (answer === null || answer === undefined) {
		return undefined;
	}
	if (answer.type === 'refusal') {
		return 0;
	}
	if (typeof answer.confidence === 'number' && Number.isFinite(answer.confidence)) {
		return answer.confidence;
	}
	if (typeof answer.noul === 'number' && Number.isFinite(answer.noul)) {
		return roundConfidence(Math.abs(answer.noul - 0.5) * 2);
	}
	if (typeof answer.probability === 'number' && Number.isFinite(answer.probability)) {
		return roundConfidence(Math.abs(answer.probability - 0.5) * 2);
	}
	return undefined;
}

export interface EnrichedAnswers {
	answers: Record<string, IDataObject>;
	lowConfidenceQuestions: string[];
}

/** Enrich already-built answers (simplified or raw) with confidence handling.
 * The raw `noul`, `choice`, `score` and `probability` values are never modified.
 * In `disabled` mode the input map is returned unchanged.
 *
 * Confidence is assessed on `confidenceSource` when given — the raw API
 * answers — and on the answers themselves otherwise. Assessing the raw
 * answers keeps refusal detection working even when simplifying drops `type`.
 *
 * A refusal always counts as low confidence (confidence 0, no `value`).
 * Chaining two Decisions nodes recomputes these fields, overwriting any
 * `lowConfidence` / `lowConfidenceQuestions` / `value` the input already had. */
export function enrichAnswers(
	answers: Record<string, IDataObject>,
	mode: EvaluateFallbackMode,
	threshold: number,
	confidenceSource?: Record<string, ConfidenceSource>,
): EnrichedAnswers {
	if (mode === 'disabled') {
		return { answers, lowConfidenceQuestions: [] };
	}
	const enriched: Record<string, IDataObject> = Object.create(null);
	const lowConfidenceQuestions: string[] = [];
	for (const [id, answer] of Object.entries(answers)) {
		const source = confidenceSource?.[id] ?? (answer as ConfidenceSource);
		const isRefusal = source.type === 'refusal';
		const confidence = getConfidence(source);
		const lowConfidence = isRefusal
			? true
			: confidence !== undefined && confidence < threshold;
		if (lowConfidence) {
			lowConfidenceQuestions.push(id);
		}
		const next: IDataObject = { ...answer };
		if (confidence !== undefined) {
			next.confidence = confidence;
		}
		next.lowConfidence = lowConfidence;
		if (mode === 'bestGuess') {
			if (isRefusal) {
				delete next.value;
			} else if (typeof (answer as IDataObject).noul === 'number') {
				next.value = ((answer as IDataObject).noul as number) > 0.5;
			} else if (
				typeof (answer as IDataObject).probability === 'number' &&
				typeof (answer as IDataObject).choice !== 'string' &&
				typeof (answer as IDataObject).score !== 'number'
			) {
				next.value = ((answer as IDataObject).probability as number) > 0.5;
			} else {
				delete next.value;
			}
		} else {
			delete next.value;
		}
		enriched[id] = next;
	}
	return { answers: enriched, lowConfidenceQuestions };
}

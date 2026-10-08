import type { IDataObject } from 'n8n-workflow';

export type EvaluateFallbackMode = 'disabled' | 'bestGuess' | 'lowConfidenceOutput';

type ConfidenceSource = {
	confidence?: unknown;
	noul?: unknown;
	probability?: unknown;
};

/** Normalized confidence of an answer, from 0 to 1.
 * Choice and Score use their own `confidence`. Noul and predicate derive it
 * as |p − 0.5| × 2. Answers without a confidence source return undefined and
 * are treated as reliable. */
export function getConfidence(answer: ConfidenceSource | null | undefined): number | undefined {
	if (answer === null || answer === undefined) {
		return undefined;
	}
	if (typeof answer.confidence === 'number' && Number.isFinite(answer.confidence)) {
		return answer.confidence;
	}
	if (typeof answer.noul === 'number' && Number.isFinite(answer.noul)) {
		return Math.abs(answer.noul - 0.5) * 2;
	}
	if (typeof answer.probability === 'number' && Number.isFinite(answer.probability)) {
		return Math.abs(answer.probability - 0.5) * 2;
	}
	return undefined;
}

export interface EnrichedAnswers {
	answers: Record<string, IDataObject>;
	lowConfidenceQuestions: string[];
}

/** Enrich already-built answers (simplified or raw) with confidence handling.
 * The raw `noul`, `choice`, `score` and `probability` values are never modified.
 * In `disabled` mode the input map is returned unchanged. */
export function enrichAnswers(
	answers: Record<string, IDataObject>,
	mode: EvaluateFallbackMode,
	threshold: number,
): EnrichedAnswers {
	if (mode === 'disabled') {
		return { answers, lowConfidenceQuestions: [] };
	}
	const enriched: Record<string, IDataObject> = Object.create(null);
	const lowConfidenceQuestions: string[] = [];
	for (const [id, answer] of Object.entries(answers)) {
		const confidence = getConfidence(answer as ConfidenceSource);
		const lowConfidence = confidence !== undefined && confidence < threshold;
		if (lowConfidence) {
			lowConfidenceQuestions.push(id);
		}
		const next: IDataObject = { ...answer };
		if (confidence !== undefined) {
			next.confidence = confidence;
		}
		next.lowConfidence = lowConfidence;
		if (mode === 'bestGuess') {
			if (typeof (answer as IDataObject).noul === 'number') {
				next.value = ((answer as IDataObject).noul as number) > 0.5;
			} else if (
				typeof (answer as IDataObject).probability === 'number' &&
				typeof (answer as IDataObject).choice !== 'string' &&
				typeof (answer as IDataObject).score !== 'number'
			) {
				next.value = ((answer as IDataObject).probability as number) > 0.5;
			}
		}
		enriched[id] = next;
	}
	return { answers: enriched, lowConfidenceQuestions };
}

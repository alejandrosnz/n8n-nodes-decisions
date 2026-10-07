import type { IDataObject } from 'n8n-workflow';

import type { Answer, DecisionsResponse } from './api';

function instructionsOf(question: IDataObject): string {
	return typeof question.instructions === 'string' ? question.instructions : '';
}

function toOpenAiQuestion(name: string, question: IDataObject): IDataObject {
	const instructions = instructionsOf(question);
	if (instructions.trim() === '') {
		throw new Error(`'Instructions' is empty for question '${name}'`);
	}
	const type = question.type;
	if (type === 'noul') {
		const criteria = (question.criteria ?? {}) as IDataObject;
		const yesMeans = criteria.true;
		const noMeans = criteria.false;
		let full = instructions;
		if (
			typeof yesMeans === 'string' &&
			yesMeans !== '' &&
			typeof noMeans === 'string' &&
			noMeans !== ''
		) {
			full = `${full}\n\nA yes means: ${yesMeans}\nA no means: ${noMeans}`;
		} else if (typeof yesMeans === 'string' && yesMeans !== '') {
			full = `${full}\n\nA yes means: ${yesMeans}`;
		} else if (typeof noMeans === 'string' && noMeans !== '') {
			full = `${full}\n\nA no means: ${noMeans}`;
		}
		return { type: 'predicate', name, instructions: full };
	}
	if (type === 'choice') {
		const criteria = (question.criteria ?? {}) as IDataObject as Record<string, unknown>;
		const choices = Object.entries(criteria).map(([value, description]) =>
			description == null ? { value } : { value, description },
		);
		return { type: 'choice', name, instructions: instructionsOf(question), choices };
	}
	if (type === 'score') {
		const criteria = (question.criteria ?? []) as unknown[] as string[];
		const levels = criteria.map((label) => ({ label }));
		return { type: 'score', name, instructions: instructionsOf(question), levels };
	}
	return { name, ...question };
}

const OPENAI_ROLES = ['system', 'developer', 'user', 'assistant', 'tool'];

/** An OpenAI message: the shape users paste when they want multimodal input */
function looksLikeMessage(value: unknown): boolean {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return false;
	}
	const item = value as IDataObject;
	return typeof item.role === 'string' && OPENAI_ROLES.includes(item.role) && 'content' in item;
}

/** An OpenAI message array is not usable input: its images would go over as text */
function isMessageArray(state: unknown): boolean {
	return Array.isArray(state) && state.length > 0 && state.every(looksLikeMessage);
}

/** A raw array is sent as-is, so missing or duplicated names must fail before the call */
function assertNamedQuestions(questions: IDataObject[]): void {
	const names = questions.map((question) => (question as IDataObject | null)?.name);
	if (names.some((name) => typeof name !== 'string' || name.trim() === '')) {
		throw new Error("Every question in a raw array needs a 'name'");
	}
	if (new Set(names).size !== names.length) {
		throw new Error('Question names in a raw array must be unique');
	}
}

/** Turns the node's request body into OpenAI's Decisions request body */
export function toOpenAiRequest(body: IDataObject): IDataObject {
	const state = body.state;
	if (isMessageArray(state) || looksLikeMessage(state)) {
		throw new Error(
			"'State' looks like OpenAI messages, which the node does not support. Send the content as text or JSON instead.",
		);
	}
	const input = typeof state === 'string' ? state : JSON.stringify(state);
	const questions = body.questions;
	if (Array.isArray(questions)) {
		assertNamedQuestions(questions as IDataObject[]);
		return { model: body.model, input, questions };
	}
	const converted = Object.entries((questions ?? {}) as IDataObject).map(([name, question]) =>
		toOpenAiQuestion(name, question as IDataObject),
	);
	return { model: body.model, input, questions: converted };
}

/** Turns OpenAI's Decisions response into the response shape the node works with.
 * `sentNames` are the question names in the order they were sent. An answer
 * without a `name` falls back to the question at its position; a missing
 * name, a duplicated name, or a count that does not match is an error. */
export function fromOpenAiResponse(
	body: unknown,
	requestedModel: string,
	sentNames: Array<string | null> = [],
): DecisionsResponse {
	const raw = (body ?? {}) as { answers?: unknown; model?: unknown; usage?: unknown };
	let answers: Record<string, Answer>;
	if (Array.isArray(raw.answers)) {
		if (sentNames.length > 0 && raw.answers.length !== sentNames.length) {
			throw new Error(
				`OpenAI returned ${raw.answers.length} answers for ${sentNames.length} questions`,
			);
		}
		answers = Object.create(null) as Record<string, Answer>;
		raw.answers.forEach((entry, i) => {
			if (typeof entry !== 'object' || entry === null) {
				throw new Error(`OpenAI answer #${i} is not an object`);
			}
			const { name, ...rest } = entry as IDataObject & { name?: unknown };
			const resolved = typeof name === 'string' ? name : (sentNames[i] ?? null);
			if (resolved == null) {
				throw new Error(`OpenAI answer #${i} has no name`);
			}
			if (resolved in answers) {
				throw new Error(`Duplicate answer name '${resolved}'`);
			}
			answers[resolved] = rest as unknown as Answer;
		});
	} else if (typeof raw.answers === 'object' && raw.answers !== null) {
		answers = raw.answers as Record<string, Answer>;
	} else {
		answers = Object.create(null) as Record<string, Answer>;
	}
	const model = typeof raw.model === 'string' && raw.model !== '' ? raw.model : requestedModel;
	const response: DecisionsResponse = { model, answers };
	if (typeof raw.usage === 'object' && raw.usage !== null) {
		response.usage = raw.usage as IDataObject;
	}
	return response;
}

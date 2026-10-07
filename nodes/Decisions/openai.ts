import type { IDataObject } from 'n8n-workflow';

import type { Answer, DecisionsResponse } from './api';

function toOpenAiQuestion(name: string, question: IDataObject): IDataObject {
	const type = question.type;
	if (type === 'noul') {
		const criteria = (question.criteria ?? {}) as IDataObject;
		const yesMeans = criteria.true;
		const noMeans = criteria.false;
		let instructions = question.instructions as string;
		if (typeof yesMeans === 'string' && yesMeans !== '' && typeof noMeans === 'string' && noMeans !== '') {
			instructions = `${instructions}\n\nA yes means: ${yesMeans}\nA no means: ${noMeans}`;
		} else if (typeof yesMeans === 'string' && yesMeans !== '') {
			instructions = `${instructions}\n\nA yes means: ${yesMeans}`;
		} else if (typeof noMeans === 'string' && noMeans !== '') {
			instructions = `${instructions}\n\nA no means: ${noMeans}`;
		}
		return { type: 'predicate', name, instructions };
	}
	if (type === 'choice') {
		const criteria = ((question.criteria ?? {}) as IDataObject) as Record<string, unknown>;
		const choices = Object.entries(criteria).map(([value, description]) =>
			description == null ? { value } : { value, description },
		);
		return { type: 'choice', name, instructions: question.instructions, choices };
	}
	if (type === 'score') {
		const criteria = ((question.criteria ?? []) as unknown[]) as string[];
		const levels = criteria.map((label) => ({ label }));
		return { type: 'score', name, instructions: question.instructions, levels };
	}
	return { name, ...question };
}

/** Turns the node's request body into OpenAI's Decisions request body */
export function toOpenAiRequest(body: IDataObject): IDataObject {
	const state = body.state;
	const input = typeof state === 'string' ? state : JSON.stringify(state);
	const questions = body.questions;
	if (Array.isArray(questions)) {
		return { model: body.model, input, questions };
	}
	const converted = Object.entries((questions ?? {}) as IDataObject).map(([name, question]) =>
		toOpenAiQuestion(name, question as IDataObject),
	);
	return { model: body.model, input, questions: converted };
}

/** Turns OpenAI's Decisions response into the response shape the node works with */
export function fromOpenAiResponse(body: unknown, requestedModel: string): DecisionsResponse {
	const raw = (body ?? {}) as { answers?: unknown; model?: unknown; usage?: unknown };
	let answers: Record<string, Answer>;
	if (Array.isArray(raw.answers)) {
		answers = Object.create(null) as Record<string, Answer>;
		for (const entry of raw.answers) {
			if (typeof entry !== 'object' || entry === null) continue;
			const { name, ...rest } = entry as IDataObject & { name?: unknown };
			if (typeof name !== 'string') continue;
			answers[name] = rest as unknown as Answer;
		}
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

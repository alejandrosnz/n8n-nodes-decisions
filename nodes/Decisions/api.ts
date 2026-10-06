import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

export const CREDENTIAL_NAME = 'decisionsApi';
export const DEFAULT_BASE_URL = 'https://api.typesafe.ai';
export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export const DEFAULT_SYSTEMONE_PATH = '/v1/systemone';
export const DEFAULT_DECISIONS_PATH = '/api/alpha/decisions';

export type DecisionsProvider = 'typesafe' | 'openrouter' | 'custom';

export interface DecisionsCredentials {
	provider?: unknown;
	apiKey?: unknown;
	baseUrl?: unknown;
}

/** Limits the API itself imposes on a question's criteria */
export const OPTION_BOUNDS = { min: 2, max: 255 };
export const LEVEL_BOUNDS = { min: 2, max: 10 };

function normalizeProvider(raw: unknown): DecisionsProvider {
	if (raw === 'openrouter' || raw === 'custom' || raw === 'typesafe') {
		return raw;
	}
	return 'typesafe';
}

function stripTrailingSlashes(value: string): string {
	return value.replace(/\/+$/, '');
}

export function resolveBaseUrl(credentials: DecisionsCredentials = {}): string {
	const provider = normalizeProvider(credentials.provider);
	if (provider === 'openrouter') {
		const custom = typeof credentials.baseUrl === 'string' ? credentials.baseUrl.trim() : '';
		if (custom !== '') {
			return stripTrailingSlashes(custom);
		}
		return OPENROUTER_BASE_URL;
	}
	if (provider === 'custom') {
		const custom = typeof credentials.baseUrl === 'string' ? credentials.baseUrl.trim() : '';
		if (custom === '') {
			throw new Error("'Base URL' is empty. Set the base URL of your custom provider.");
		}
		return stripTrailingSlashes(custom);
	}
	const custom = typeof credentials.baseUrl === 'string' ? credentials.baseUrl.trim() : '';
	if (custom !== '') {
		return stripTrailingSlashes(custom);
	}
	return DEFAULT_BASE_URL;
}

/** Empty means the default for the provider: Decisions path on OpenRouter, SystemOne otherwise. */
export function resolveEndpointPath(providerRaw: unknown, raw: unknown): string {
	if (typeof raw === 'string' && raw.trim() !== '') {
		const path = raw.trim();
		return path.startsWith('/') ? path : `/${path}`;
	}
	return normalizeProvider(providerRaw) === 'openrouter'
		? DEFAULT_DECISIONS_PATH
		: DEFAULT_SYSTEMONE_PATH;
}

/** The same base URL resolution as resolveBaseUrl, for the declarative credential test */
export const BASE_URL_EXPRESSION = `={{ $credentials.baseUrl || ($credentials.provider === 'openrouter' ? '${OPENROUTER_BASE_URL}' : '${DEFAULT_BASE_URL}') }}`;

export type QuestionType = 'choice' | 'noul' | 'score';

export interface ChoiceAnswer {
	type: 'choice';
	choice: string;
	confidence?: number;
	probabilities?: Record<string, number>;
}

export interface NoulAnswer {
	type: 'noul';
	noul: number;
}

export interface ScoreAnswer {
	type: 'score';
	score: number;
	confidence?: number;
	legend?: Record<string, string>;
	probabilities?: Record<string, number>;
}

export type Answer = ChoiceAnswer | NoulAnswer | ScoreAnswer;

export interface DecisionsResponse {
	model: string;
	answers: Record<string, Answer>;
	usage?: IDataObject;
}

function describeValidationIssue(issue: unknown): string {
	const { loc, msg } = (issue ?? {}) as { loc?: unknown[]; msg?: unknown };
	const field = Array.isArray(loc) ? loc.filter((part) => part !== 'body').join('.') : '';
	const message = typeof msg === 'string' ? msg : 'is invalid';
	return field === '' ? message : `${field}: ${message}`;
}

export function describeApiError(body: unknown, statusCode: number): string {
	const detail = (body as { detail?: unknown } | null | undefined)?.detail;
	if (Array.isArray(detail) && detail.length > 0) {
		return detail.map(describeValidationIssue).join('; ');
	}
	if (typeof detail === 'string' && detail !== '') {
		return detail;
	}
	const message = (detail as { message?: unknown } | null | undefined)?.message;
	if (typeof message === 'string' && message !== '') {
		return message;
	}
	if (typeof body === 'string' && body.trim() !== '' && !body.trimStart().startsWith('<')) {
		return body.trim();
	}
	return `The Decisions API returned status ${statusCode}`;
}

async function apiRequest(
	context: IExecuteFunctions,
	options: { method: IHttpRequestMethods; path: string; body?: IDataObject; timeout?: number },
	itemIndex?: number,
): Promise<unknown> {
	const credentials = (await context.getCredentials(CREDENTIAL_NAME)) as DecisionsCredentials;
	const response = await context.helpers.httpRequestWithAuthentication.call(
		context,
		CREDENTIAL_NAME,
		{
			method: options.method,
			url: `${resolveBaseUrl(credentials)}${options.path}`,
			body: options.body,
			timeout: options.timeout,
			json: true,
			returnFullResponse: true,
			ignoreHttpStatusErrors: true,
			// Keep the API key on the API host if a response redirects elsewhere
			sendCredentialsOnCrossOriginRedirect: false,
		},
	);
	const { statusCode, body } = response as { statusCode: number; body: unknown };
	if (statusCode >= 300) {
		throw new NodeApiError(context.getNode(), (body ?? {}) as JsonObject, {
			message: describeApiError(body, statusCode),
			httpCode: String(statusCode),
			itemIndex,
		});
	}
	return body;
}

export async function evaluateState(
	context: IExecuteFunctions,
	itemIndex: number,
	body: IDataObject,
	timeout: number,
	endpointPath?: unknown,
): Promise<DecisionsResponse> {
	const credentials = (await context.getCredentials(CREDENTIAL_NAME)) as DecisionsCredentials;
	const response = await apiRequest(
		context,
		{
			method: 'POST',
			path: resolveEndpointPath(credentials.provider, endpointPath),
			body,
			timeout,
		},
		itemIndex,
	);
	return response as DecisionsResponse;
}

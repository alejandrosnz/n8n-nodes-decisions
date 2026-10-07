import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

import { fromOpenAiResponse, toOpenAiRequest } from './openai';

export const CREDENTIAL_NAME = 'decisionsApi';
export const DEFAULT_BASE_URL = 'https://api.typesafe.ai';
export const OPENROUTER_BASE_URL = 'https://openrouter.ai';
export const OPENAI_BASE_URL = 'https://api.openai.com';

export const DEFAULT_SYSTEMONE_PATH = '/v1/systemone';
export const DEFAULT_DECISIONS_PATH = '/api/alpha/decisions';
export const DEFAULT_OPENAI_DECISIONS_PATH = '/v1/decisions';

export type DecisionsProvider = 'typesafe' | 'openrouter' | 'openai' | 'custom';

export interface DecisionsCredentials {
	provider?: unknown;
	apiKey?: unknown;
	baseUrl?: unknown;
	endpointPath?: unknown;
	apiStyle?: unknown;
}

export type DecisionsApiStyle = 'systemone' | 'openai';

/** Whether requests use OpenAI's Decisions format: the OpenAI provider, or a custom provider with the OpenAI style. */
export function usesOpenAiFormat(credentials: DecisionsCredentials = {}): boolean {
	const provider = normalizeProvider(credentials.provider);
	if (provider === 'openai') {
		return true;
	}
	if (provider === 'custom') {
		return credentials.apiStyle === 'openai';
	}
	return false;
}

/** Limits the API itself imposes on a question's criteria */
export const OPTION_BOUNDS = { min: 2, max: 255 };
export const LEVEL_BOUNDS = { min: 2, max: 10 };

function normalizeProvider(raw: unknown): DecisionsProvider {
	if (raw === 'openrouter' || raw === 'custom' || raw === 'typesafe' || raw === 'openai') {
		return raw;
	}
	return 'typesafe';
}

function stripTrailingSlashes(value: string): string {
	return value.replace(/\/+$/, '');
}

function isLocalhost(hostname: string): boolean {
	return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function parseBaseUrl(stripped: string): URL | null {
	try {
		return new URL(stripped);
	} catch {
		return null;
	}
}

/** A base URL must be an https URL, except for local development over http on localhost. */
function normalizeBaseUrl(raw: unknown): string {
	const trimmed = typeof raw === 'string' ? raw.trim() : '';
	if (trimmed === '') {
		throw new Error("'Base URL' is empty. Set the base URL of your custom provider.");
	}
	const stripped = stripTrailingSlashes(trimmed);
	const parsed = parseBaseUrl(stripped);
	if (parsed === null) {
		throw new Error("'Base URL' is not a valid URL. Use an https URL such as https://api.custom.com/v1.");
	}
	if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLocalhost(parsed.hostname))) {
		throw new Error("'Base URL' must use https. Use an https URL such as https://api.custom.com/v1.");
	}
	return stripped;
}

export function resolveBaseUrl(credentials: DecisionsCredentials = {}): string {
	const provider = normalizeProvider(credentials.provider);
	if (provider === 'openrouter') {
		const custom = typeof credentials.baseUrl === 'string' ? credentials.baseUrl.trim() : '';
		if (custom !== '') {
			return normalizeBaseUrl(custom);
		}
		return OPENROUTER_BASE_URL;
	}
	if (provider === 'openai') {
		const custom = typeof credentials.baseUrl === 'string' ? credentials.baseUrl.trim() : '';
		if (custom !== '') {
			return normalizeBaseUrl(custom);
		}
		return OPENAI_BASE_URL;
	}
	if (provider === 'custom') {
		return normalizeBaseUrl(credentials.baseUrl);
	}
	const custom = typeof credentials.baseUrl === 'string' ? credentials.baseUrl.trim() : '';
	if (custom !== '') {
		return normalizeBaseUrl(custom);
	}
	return DEFAULT_BASE_URL;
}

/** Empty means the default for the provider: Decisions path on OpenRouter, SystemOne otherwise. */
export function resolveEndpointPath(credentials: DecisionsCredentials = {}): string {
	const raw = credentials.endpointPath;
	if (typeof raw === 'string' && raw.trim() !== '') {
		const path = raw.trim();
		if (path.includes('://') || path.includes('\\')) {
			throw new Error("'Endpoint Path' must be a path such as /v1/systemone, not a URL.");
		}
		const normalized = path.startsWith('/') ? path : `/${path}`;
		if (normalized.includes('?') || normalized.includes('#')) {
			throw new Error("'Endpoint Path' must be a path such as /v1/systemone, without query or fragment.");
		}
		const segments = normalized.split('/').filter((segment) => segment !== '');
		if (segments.length === 0 || segments.includes('..') || segments.includes('.')) {
			throw new Error("'Endpoint Path' must be a path such as /v1/systemone.");
		}
		return `/${segments.join('/')}`;
	}
	const provider = normalizeProvider(credentials.provider);
	if (provider === 'openrouter') {
		return DEFAULT_DECISIONS_PATH;
	}
	if (usesOpenAiFormat(credentials)) {
		return DEFAULT_OPENAI_DECISIONS_PATH;
	}
	return DEFAULT_SYSTEMONE_PATH;
}

/** The same base URL resolution as resolveBaseUrl, for the declarative credential test */
export const BASE_URL_EXPRESSION = `={{ $credentials.baseUrl || ($credentials.provider === 'openrouter' ? '${OPENROUTER_BASE_URL}' : $credentials.provider === 'openai' ? '${OPENAI_BASE_URL}' : '${DEFAULT_BASE_URL}') }}`;

export type QuestionType = 'choice' | 'noul' | 'score';

export interface ChoiceAnswer {
	type: 'choice';
	choice: string;
	confidence?: number;
	probabilities?: Record<string, number> | IDataObject[];
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
	probabilities?: Record<string, number> | IDataObject[];
}

export interface PredicateAnswer {
	type: 'predicate';
	probability: number;
}

export interface RefusalAnswer {
	type: 'refusal';
}

export type Answer = ChoiceAnswer | NoulAnswer | ScoreAnswer | PredicateAnswer | RefusalAnswer;

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
	const errorMessage = (body as { error?: { message?: unknown } } | null | undefined)?.error
		?.message;
	if (typeof errorMessage === 'string' && errorMessage !== '') {
		return errorMessage;
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
): Promise<DecisionsResponse> {
	const credentials = (await context.getCredentials(CREDENTIAL_NAME)) as DecisionsCredentials;
	const isOpenAi = usesOpenAiFormat(credentials);
	const response = await apiRequest(
		context,
		{
			method: 'POST',
			path: resolveEndpointPath(credentials),
			body: isOpenAi ? toOpenAiRequest(body) : body,
			timeout,
		},
		itemIndex,
	);
	return isOpenAi
		? fromOpenAiResponse(response, String(body.model ?? ''))
		: (response as DecisionsResponse);
}

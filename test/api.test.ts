import { describe, expect, it } from 'vitest';

import {
	BASE_URL_EXPRESSION,
	DEFAULT_BASE_URL,
	DEFAULT_DECISIONS_PATH,
	DEFAULT_OPENAI_DECISIONS_PATH,
	DEFAULT_SYSTEMONE_PATH,
	describeApiError,
	OPENAI_BASE_URL,
	OPENROUTER_BASE_URL,
	resolveBaseUrl,
	resolveEndpointPath,
	usesOpenAiFormat,
} from '../nodes/Decisions/api';

describe('resolveBaseUrl', () => {
	it.each([
		[{}, 'https://api.typesafe.ai'],
		[{ provider: 'typesafe' }, 'https://api.typesafe.ai'],
		[{ provider: 'typesafe', baseUrl: '' }, 'https://api.typesafe.ai'],
		[{ provider: 'typesafe', baseUrl: '  https://eu.example.com///  ' }, 'https://eu.example.com'],
		[{ provider: 'openrouter' }, 'https://openrouter.ai'],
		[{ provider: 'openrouter', baseUrl: '' }, 'https://openrouter.ai'],
		[{ provider: 'openai' }, 'https://api.openai.com'],
		[{ provider: 'openai', baseUrl: '' }, 'https://api.openai.com'],
		[{ provider: 'openai', baseUrl: 'https://eu.api.openai.com/' }, 'https://eu.api.openai.com'],
		[{ provider: 'custom', baseUrl: 'https://api.custom.com/v1/' }, 'https://api.custom.com/v1'],
	])('resolves %j', (credentials, expected) => {
		expect(resolveBaseUrl(credentials)).toBe(expected);
	});

	it('rejects a custom provider without a base URL', () => {
		expect(() => resolveBaseUrl({ provider: 'custom', baseUrl: '  ' })).toThrow(
			/'Base URL' is empty/,
		);
	});

	it('rejects non-https base URLs', () => {
		expect(() =>
			resolveBaseUrl({ provider: 'custom', baseUrl: 'http://api.custom.com/v1' }),
		).toThrow(/must use https/);
		expect(() =>
			resolveBaseUrl({ provider: 'typesafe', baseUrl: 'http://eu.example.com' }),
		).toThrow(/must use https/);
	});

	it('rejects base URLs that are not valid URLs', () => {
		expect(() => resolveBaseUrl({ provider: 'custom', baseUrl: 'not a url' })).toThrow(
			/not a valid URL/,
		);
	});

	it('allows http for local development', () => {
		expect(resolveBaseUrl({ provider: 'custom', baseUrl: 'http://localhost:3000/v1/' })).toBe(
			'http://localhost:3000/v1',
		);
	});
});

describe('resolveEndpointPath', () => {
	it('uses the SystemOne path by default for TypeSafe AI and custom providers', () => {
		expect(resolveEndpointPath({ provider: 'typesafe', endpointPath: '' })).toBe(
			DEFAULT_SYSTEMONE_PATH,
		);
		expect(resolveEndpointPath({ provider: 'custom', endpointPath: undefined })).toBe(
			DEFAULT_SYSTEMONE_PATH,
		);
		expect(resolveEndpointPath({})).toBe(DEFAULT_SYSTEMONE_PATH);
	});

	it('uses the Decisions path by default for OpenRouter', () => {
		expect(resolveEndpointPath({ provider: 'openrouter', endpointPath: '' })).toBe(
			DEFAULT_DECISIONS_PATH,
		);
	});

	it.each([
		[{ provider: 'openai', endpointPath: '' }, '/v1/decisions'],
		[{ provider: 'openai', endpointPath: '/v2/x' }, '/v2/x'],
	])('resolves OpenAI endpoint path %j', (credentials, expected) => {
		expect(resolveEndpointPath(credentials)).toBe(expected);
	});

	it('uses the OpenAI default path constant', () => {
		expect(DEFAULT_OPENAI_DECISIONS_PATH).toBe('/v1/decisions');
		expect(resolveEndpointPath({ provider: 'openai', endpointPath: '' })).toBe(
			DEFAULT_OPENAI_DECISIONS_PATH,
		);
	});

	it.each([
		[
			{ provider: 'custom', baseUrl: 'https://api.custom.com', apiStyle: 'openai' },
			'/v1/decisions',
		],
		[
			{ provider: 'custom', baseUrl: 'https://api.custom.com', apiStyle: 'systemone' },
			'/v1/systemone',
		],
		[{ provider: 'custom', baseUrl: 'https://api.custom.com' }, '/v1/systemone'],
	])('resolves a custom endpoint path default of %j to %s', (credentials, expected) => {
		expect(resolveEndpointPath({ ...credentials, endpointPath: '' })).toBe(expected);
	});

	it('uses a custom path when one is given', () => {
		expect(resolveEndpointPath({ provider: 'openrouter', endpointPath: 'custom/path' })).toBe(
			'/custom/path',
		);
		expect(
			resolveEndpointPath({ provider: 'typesafe', endpointPath: '/api/alpha/decisions' }),
		).toBe('/api/alpha/decisions');
	});

	it('collapses duplicate slashes so the host cannot change', () => {
		expect(resolveEndpointPath({ provider: 'typesafe', endpointPath: '//evil.com/x' })).toBe(
			'/evil.com/x',
		);
	});

	it.each([
		'https://evil.com/x',
		'http://evil.com/x',
		'/a/../b',
		'/a/./b',
		'/path?query=1',
		'/path#fragment',
		'\\windows\\path',
		'/',
	])('rejects a hostile endpoint path %s', (path) => {
		expect(() => resolveEndpointPath({ provider: 'typesafe', endpointPath: path })).toThrow(
			/'Endpoint Path'/,
		);
	});
});

describe('usesOpenAiFormat', () => {
	it.each([
		[{ provider: 'openai' }, true],
		[{ provider: 'custom', apiStyle: 'openai' }, true],
		[{ provider: 'custom', apiStyle: 'systemone' }, false],
		[{ provider: 'custom' }, false],
		[{ provider: 'typesafe' }, false],
		[{ provider: 'openrouter' }, false],
		[{}, false],
	])('reports %j as %s', (credentials, expected) => {
		expect(usesOpenAiFormat(credentials)).toBe(expected);
	});
});

describe('BASE_URL_EXPRESSION', () => {
	it('interpolates the default hosts rather than shipping a placeholder', () => {
		expect(BASE_URL_EXPRESSION).not.toContain('${');
		expect(BASE_URL_EXPRESSION).toContain(DEFAULT_BASE_URL);
		expect(BASE_URL_EXPRESSION).toContain(OPENROUTER_BASE_URL);
		expect(BASE_URL_EXPRESSION).toContain(OPENAI_BASE_URL);
		expect(BASE_URL_EXPRESSION).toContain('https://api.openai.com');
	});
});

describe('describeApiError', () => {
	it('flattens a 422 detail list into one sentence', () => {
		const body = {
			detail: [
				{ loc: ['body', 'questions', 'q', 'choice', 'criteria'], msg: 'Field required' },
				{ loc: ['body', 'model'], msg: 'Input should be a valid string' },
			],
		};
		expect(describeApiError(body, 422)).toBe(
			'questions.q.choice.criteria: Field required; model: Input should be a valid string',
		);
	});

	it('uses the message of a detail object', () => {
		const body = { detail: { error_type: 'api_usage_error', message: 'Unknown model: jev-9.9.9' } };
		expect(describeApiError(body, 400)).toBe('Unknown model: jev-9.9.9');
	});

	it('uses a plain text body that did not parse as JSON', () => {
		expect(describeApiError('  Upstream connect error  ', 502)).toBe('Upstream connect error');
	});

	it('uses the OpenAI error message', () => {
		expect(describeApiError({ error: { message: 'Invalid API key' } }, 401)).toBe(
			'Invalid API key',
		);
	});

	it.each([undefined, '', '   ', '<html><body>502 Bad Gateway</body></html>'])(
		'falls back to the status code given %s',
		(body) => {
			expect(describeApiError(body, 502)).toBe('The Decisions API returned status 502');
		},
	);
});

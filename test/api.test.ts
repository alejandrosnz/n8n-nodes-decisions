import { describe, expect, it } from 'vitest';

import {
	BASE_URL_EXPRESSION,
	DEFAULT_BASE_URL,
	DEFAULT_DECISIONS_PATH,
	DEFAULT_SYSTEMONE_PATH,
	describeApiError,
	OPENROUTER_BASE_URL,
	resolveBaseUrl,
	resolveEndpointPath,
} from '../nodes/Decisions/api';

describe('resolveBaseUrl', () => {
	it.each([
		[{}, 'https://api.typesafe.ai'],
		[{ provider: 'typesafe' }, 'https://api.typesafe.ai'],
		[{ provider: 'typesafe', baseUrl: '' }, 'https://api.typesafe.ai'],
		[{ provider: 'typesafe', baseUrl: '  https://eu.example.com///  ' }, 'https://eu.example.com'],
		[{ provider: 'openrouter' }, 'https://openrouter.ai/api/v1'],
		[{ provider: 'openrouter', baseUrl: '' }, 'https://openrouter.ai/api/v1'],
		[{ provider: 'custom', baseUrl: 'https://api.custom.com/v1/' }, 'https://api.custom.com/v1'],
	])('resolves %j', (credentials, expected) => {
		expect(resolveBaseUrl(credentials)).toBe(expected);
	});

	it('rejects a custom provider without a base URL', () => {
		expect(() => resolveBaseUrl({ provider: 'custom', baseUrl: '  ' })).toThrow(/'Base URL' is empty/);
	});
});

describe('resolveEndpointPath', () => {
	it('uses the SystemOne path by default for TypeSafe AI and custom providers', () => {
		expect(resolveEndpointPath('typesafe', '')).toBe(DEFAULT_SYSTEMONE_PATH);
		expect(resolveEndpointPath('custom', undefined)).toBe(DEFAULT_SYSTEMONE_PATH);
		expect(resolveEndpointPath(undefined, '')).toBe(DEFAULT_SYSTEMONE_PATH);
	});

	it('uses the Decisions path by default for OpenRouter', () => {
		expect(resolveEndpointPath('openrouter', '')).toBe(DEFAULT_DECISIONS_PATH);
	});

	it('uses a custom path when one is given', () => {
		expect(resolveEndpointPath('openrouter', 'custom/path')).toBe('/custom/path');
		expect(resolveEndpointPath('typesafe', '/api/alpha/decisions')).toBe('/api/alpha/decisions');
	});
});

describe('BASE_URL_EXPRESSION', () => {
	it('interpolates the default hosts rather than shipping a placeholder', () => {
		expect(BASE_URL_EXPRESSION).not.toContain('${');
		expect(BASE_URL_EXPRESSION).toContain(DEFAULT_BASE_URL);
		expect(BASE_URL_EXPRESSION).toContain(OPENROUTER_BASE_URL);
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

	it.each([undefined, '', '   ', '<html><body>502 Bad Gateway</body></html>'])(
		'falls back to the status code given %s',
		(body) => {
			expect(describeApiError(body, 502)).toBe('The Decisions API returned status 502');
		},
	);
});

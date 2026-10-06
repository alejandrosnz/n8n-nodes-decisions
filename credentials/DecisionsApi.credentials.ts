import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	Icon,
	INodeProperties,
} from 'n8n-workflow';

import { BASE_URL_EXPRESSION } from '../nodes/Decisions/api';

export class DecisionsApi implements ICredentialType {
	name = 'decisionsApi';

	displayName = 'Decisions API';

	documentationUrl = 'https://docs.typesafe.ai';

	icon: Icon = {
		light: 'file:../nodes/Decisions/decisions.svg',
		dark: 'file:../nodes/Decisions/decisions.dark.svg',
	};

	properties: INodeProperties[] = [
		{
			displayName: 'Provider',
			name: 'provider',
			type: 'options',
			options: [
				{ name: 'TypeSafe AI', value: 'typesafe' },
				{ name: 'OpenRouter', value: 'openrouter' },
				{ name: 'Custom (Decisions Compatible)', value: 'custom' },
			],
			default: 'typesafe',
			required: true,
			description:
				'Select the Decisions API provider. Choose Custom if your provider is not listed.',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description: 'Create one in the TypeSafe AI console or in your provider dashboard',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: '',
			required: true,
			placeholder: 'e.g. https://api.custom.com/v1',
			description:
				'The base URL of your Decisions-compatible API. Obtain it from your provider documentation.',
			displayOptions: { show: { provider: ['custom'] } },
		},
		{
			displayName: 'Endpoint Path',
			name: 'endpointPath',
			type: 'string',
			default: '',
			placeholder: 'e.g. /api/alpha/decisions',
			description:
				"Leave blank to use the default for your provider: '/v1/systemone' for TypeSafe AI and custom, '/api/alpha/decisions' for OpenRouter",
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: BASE_URL_EXPRESSION,
			url: "={{ $credentials.provider === 'openrouter' ? '/models' : '/v1/models' }}",
			method: 'GET',
		},
	};
}

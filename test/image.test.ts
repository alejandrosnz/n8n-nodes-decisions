import type { IExecuteFunctions, INode } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';

import {
	buildImagePart,
	detectMimeTypeFromBase64,
	detectMimeTypeFromExtension,
	isImageParts,
	isValidBase64,
	toOpenAiMessages,
} from '../nodes/Decisions/image';

const node: INode = {
	id: 'a',
	name: 'Decisions',
	type: 'decisions',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

const context = { node, itemIndex: 0 };

// A minimal header followed by a filler byte, so the size is off the boundary
function imageBytes(magic: number[]): Buffer {
	return Buffer.concat([Buffer.from(magic), Buffer.alloc(11, 1)]);
}

function base64Of(magic: number[]): string {
	return imageBytes(magic).toString('base64');
}

type Parameters = Record<string, unknown>;

interface HttpResponse {
	statusCode?: number;
	headers?: Record<string, unknown>;
	body?: unknown;
}

const defaultHttpResponse = (): HttpResponse => ({
	statusCode: 200,
	headers: { 'content-type': 'image/jpeg' },
	body: imageBytes([0xff, 0xd8, 0xff]),
});

function createFunctions(
	parameters: Parameters = {},
	buffer: Buffer | Error | undefined = imageBytes([0x89, 0x50, 0x4e, 0x47]),
	binaryProperties: Record<string, unknown> = { data: { mimeType: 'image/png', fileName: undefined } },
	httpResponse: HttpResponse | Error = defaultHttpResponse(),
) {
	return {
		getNode: () => node,
		getNodeParameter: (name: string, _itemIndex: number, fallback?: unknown) =>
			name in parameters ? parameters[name] : fallback,
		getInputData: () => [{ json: {}, binary: binaryProperties }],
		helpers: {
			getBinaryDataBuffer: async () => {
				if (buffer instanceof Error) {
					throw buffer;
				}
				return buffer;
			},
			request: async () => {
				if (httpResponse instanceof Error) {
					throw httpResponse;
				}
				return httpResponse;
			},
		},
	} as unknown as IExecuteFunctions;
}

describe('detectMimeTypeFromExtension', () => {
	it('maps common extensions to their MIME type', () => {
		expect(detectMimeTypeFromExtension('photo.jpeg')).toBe('image/jpeg');
		expect(detectMimeTypeFromExtension('screen.PNG')).toBe('image/png');
		expect(detectMimeTypeFromExtension('anim.webp')).toBe('image/webp');
		expect(detectMimeTypeFromExtension('icon.gif')).toBe('image/gif');
	});

	it('returns null for an unknown extension', () => {
		expect(detectMimeTypeFromExtension('photo.bmp')).toBeNull();
		expect(detectMimeTypeFromExtension('')).toBeNull();
	});
});

describe('detectMimeTypeFromBase64', () => {
	it('detects each supported format from its magic bytes', () => {
		expect(detectMimeTypeFromBase64(base64Of([0xff, 0xd8, 0xff]))).toBe('image/jpeg');
		expect(detectMimeTypeFromBase64(base64Of([0x89, 0x50, 0x4e, 0x47]))).toBe('image/png');
		expect(detectMimeTypeFromBase64(base64Of([0x52, 0x49, 0x46, 0x46]))).toBe('image/webp');
		expect(detectMimeTypeFromBase64(base64Of([0x47, 0x49, 0x46]))).toBe('image/gif');
	});

	it('returns null for data that is not a supported image', () => {
		expect(detectMimeTypeFromBase64(Buffer.from('x', 'utf8').toString('base64'))).toBeNull();
	});
});

describe('isValidBase64', () => {
	it('accepts plain base64 with padding and rejects a data URI or whitespace-free violation', () => {
		expect(isValidBase64(base64Of([0x89, 0x50, 0x4e, 0x47]))).toBe(true);
		expect(isValidBase64('data:image/png;base64,AAAA')).toBe(false);
	});
});

describe('isImageParts', () => {
	it('matches a text and image part pair', () => {
		const state = ['Inspect.', { type: 'image_url', image_url: { url: 'https://example.com/a.png' } }];
		expect(isImageParts(state)).toBe(true);
	});

	it('leaves scalars, message arrays and other arrays alone', () => {
		expect(isImageParts('text')).toBe(false);
		expect(isImageParts({ ticket: 1 })).toBe(false);
		expect(isImageParts([{ role: 'user', content: 'Hi' }])).toBe(false);
		expect(isImageParts([1, { type: 'image_url', image_url: { url: 'x' } }])).toBe(false);
		expect(isImageParts(['text', { type: 'other' }])).toBe(false);
		expect(isImageParts(['text', { type: 'image_url', image_url: { url: '' } }])).toBe(false);
	});
});

describe('toOpenAiMessages', () => {
	it('keeps the text and moves the URL into an input_image string', () => {
		const state = ['Inspect.', { type: 'image_url', image_url: { url: 'data:image/png;base64,AA==' } }];
		expect(toOpenAiMessages(state)).toEqual([
			{
				role: 'user',
				content: [
					{ type: 'input_text', text: 'Inspect.' },
					{ type: 'input_image', image_url: 'data:image/png;base64,AA==' },
				],
			},
		]);
	});
});

describe('buildImagePart from binary data', () => {
	it('builds a data URI part, detecting the format from the magic bytes', async () => {
		const buffer = imageBytes([0xff, 0xd8, 0xff]);
		const functions = createFunctions({ binaryPropertyName: 'data' }, buffer);
		const part = await buildImagePart(functions, context);

		expect(part).toEqual({
			type: 'image_url',
			image_url: { url: `data:image/jpeg;base64,${buffer.toString('base64')}` },
		});
	});

	it('detects the format from the binary metadata when the bytes say nothing', async () => {
		const buffer = Buffer.from('x', 'utf8');
		const functions = createFunctions(
			{},
			buffer,
			{ data: { mimeType: 'image/gif', fileName: undefined } },
		);
		const part = await buildImagePart(functions, context);

		expect(part.image_url.url).toContain('data:image/gif;base64,');
	});

	it('prefers the Filename field over the binary metadata', async () => {
		const buffer = Buffer.from('x', 'utf8');
		const functions = createFunctions(
			{ fileName: 'shot.png' },
			buffer,
			{ data: { mimeType: 'image/gif', fileName: undefined } },
		);
		const part = await buildImagePart(functions, context);

		expect(part.image_url.url).toContain('data:image/png;base64,');
	});

	it('rejects a binary property that has no data', async () => {
		const functions = createFunctions({}, undefined, {});
		await expect(buildImagePart(functions, context)).rejects.toThrow(
			/The binary property 'data' has no data/,
		);
	});

	it('rejects a property that cannot be read', async () => {
		const functions = createFunctions({}, new Error('storage unavailable'));
		await expect(buildImagePart(functions, context)).rejects.toThrow(
			/Failed to read the binary property 'data'/,
		);
	});

	it('reports the available binary properties', async () => {
		const functions = createFunctions(
			{ binaryPropertyName: 'img' },
			undefined,
			{ data: { mimeType: 'image/png' } },
		);
		await expect(buildImagePart(functions, context)).rejects.toMatchObject({
			message: "The binary property 'img' has no data",
			description: expect.stringContaining('[data]'),
		} as Partial<NodeOperationError>);
	});

	it('rejects an unsupported format', async () => {
		const functions = createFunctions(
			{},
			Buffer.from('x', 'utf8'),
			{ data: { mimeType: 'image/bmp', fileName: undefined } },
		);
		await expect(buildImagePart(functions, context)).rejects.toThrow(
			/The image format 'image\/bmp' is not supported/,
		);
	});

	it('rejects an image over the 20MB limit', async () => {
		const functions = createFunctions({}, Buffer.alloc(21 * 1024 * 1024, 7));
		await expect(buildImagePart(functions, context)).rejects.toThrow(
			/The image is 21.00MB, above the 20MB limit/,
		);
	});
});

describe('buildImagePart from base64', () => {
	it('builds a data URI part from base64 with an explicit format', async () => {
		const base64Data = base64Of([0x89, 0x50, 0x4e, 0x47]);
		const functions = createFunctions(
			{ imageSource: 'base64', imageBase64: base64Data, imageMimeType: 'image/png' },
		);
		const part = await buildImagePart(functions, context);

		expect(part).toEqual({
			type: 'image_url',
			image_url: { url: `data:image/png;base64,${base64Data}` },
		});
	});

	it('strips whitespace from the base64 data', async () => {
		const base64Data = base64Of([0x89, 0x50, 0x4e, 0x47]);
		const functions = createFunctions({
			imageSource: 'base64',
			imageBase64: base64Data.slice(0, 20) + ' ' + base64Data.slice(20),
		});
		const part = await buildImagePart(functions, context);

		expect(part.image_url.url).toBe(`data:image/png;base64,${base64Data}`);
	});

	it('rejects an empty value', async () => {
		const functions = createFunctions({ imageSource: 'base64', imageBase64: '   ' });
		await expect(buildImagePart(functions, context)).rejects.toThrow(/'Base64 Image' is empty/);
	});

	it('rejects a data URI prefix', async () => {
		const functions = createFunctions({
			imageSource: 'base64',
			imageBase64: `data:image/png;base64,${base64Of([0x89, 0x50, 0x4e, 0x47])}`,
		});
		await expect(buildImagePart(functions, context)).rejects.toThrow(
			/'Base64 Image' is not valid base64/,
		);
	});

	it('rejects base64 whose format cannot be detected', async () => {
		const functions = createFunctions({
			imageSource: 'base64',
			imageBase64: Buffer.from('x', 'utf8').toString('base64'),
		});
		await expect(buildImagePart(functions, context)).rejects.toThrow(
			/The image format could not be detected/,
		);
	});
});

describe('buildImagePart from URL', () => {
	const urlParameters = { imageSource: 'url', imageUrl: 'https://example.com/a.jpg' };

	it('downloads the image and sends it as a data URI part', async () => {
		const jpegBytes = imageBytes([0xff, 0xd8, 0xff]);
		const functions = createFunctions(urlParameters, undefined, undefined, {
			statusCode: 200,
			headers: { 'content-type': 'image/jpeg; charset=binary' },
			body: jpegBytes,
		});
		const part = await buildImagePart(functions, context);

		expect(part).toEqual({
			type: 'image_url',
			image_url: { url: `data:image/jpeg;base64,${jpegBytes.toString('base64')}` },
		});
	});

	it('detects the format from the bytes when the content-type is silent', async () => {
		const functions = createFunctions(urlParameters, undefined, undefined, {
			statusCode: 200,
			headers: { 'content-type': 'application/octet-stream' },
			body: imageBytes([0x89, 0x50, 0x4e, 0x47]),
		});
		const part = await buildImagePart(functions, context);

		expect(part.image_url.url).toContain('data:image/png;base64,');
	});

	it('rejects a download that fails', async () => {
		const functions = createFunctions(
			urlParameters,
			undefined,
			undefined,
			new Error('ENOTFOUND example.com'),
		);
		await expect(buildImagePart(functions, context)).rejects.toThrow(
			/The image at 'https:\/\/example\.com\/a\.jpg' could not be downloaded/,
		);
	});

	it('rejects a non-2xx answer', async () => {
		const functions = createFunctions(urlParameters, undefined, undefined, {
			statusCode: 404,
			body: imageBytes([0xff, 0xd8, 0xff]),
		});
		await expect(buildImagePart(functions, context)).rejects.toMatchObject({
			message: "The image at 'https://example.com/a.jpg' could not be downloaded",
			description: expect.stringContaining('status 404'),
		} as Partial<NodeOperationError>);
	});

	it('rejects an empty download', async () => {
		const functions = createFunctions(urlParameters, undefined, undefined, {
			statusCode: 200,
			headers: { 'content-type': 'image/jpeg' },
			body: Buffer.alloc(0),
		});
		await expect(buildImagePart(functions, context)).rejects.toThrow(/The image is empty/);
	});

	it('rejects downloaded bytes in an unsupported format', async () => {
		const functions = createFunctions(urlParameters, undefined, undefined, {
			statusCode: 200,
			headers: { 'content-type': 'image/bmp' },
			body: Buffer.from('x', 'utf8'),
		});
		await expect(buildImagePart(functions, context)).rejects.toThrow(
			/The image format could not be detected/,
		);
	});

	it('rejects a download over the 20MB limit', async () => {
		const functions = createFunctions(urlParameters, undefined, undefined, {
			statusCode: 200,
			headers: { 'content-type': 'image/jpeg' },
			body: Buffer.alloc(21 * 1024 * 1024, 7),
		});
		await expect(buildImagePart(functions, context)).rejects.toThrow(
			/The image is 21.00MB, above the 20MB limit/,
		);
	});

	it.each([
		['ftp://example.com/a.png', /'Image URL' must start with http/],
		['javascript:alert(1)', /'Image URL' must start with http/],
		['not a url', /is not a valid URL/],
		['', /'Image URL' is empty/],
	])('rejects %s without downloading', async (imageUrl, message) => {
		const functions = createFunctions({ imageSource: 'url', imageUrl });
		await expect(buildImagePart(functions, context)).rejects.toThrow(
			message as unknown as RegExp,
		);
	});
});

describe('buildImagePart with an unknown source', () => {
	it('rejects an Image Source outside its options', async () => {
		const functions = createFunctions({ imageSource: 'telepathy' });
		await expect(buildImagePart(functions, context)).rejects.toThrow(
			/'Image Source' \(telepathy\) is not one of its options/,
		);
	});
});

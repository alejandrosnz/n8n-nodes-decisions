import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';

import { fail, type ItemContext } from './helpers';

export const IMAGE_SIZE_LIMIT_MB = 20;
export const IMAGE_SIZE_LIMIT_BYTES = IMAGE_SIZE_LIMIT_MB * 1024 * 1024;
export const BASE64_REGEX = /^[A-Za-z0-9+/]*={0,2}$/;

/** What a supported image format looks like, for extension and magic-byte detection */
interface ImageFormatConfig {
	extension: string;
	mimeType: string;
	magicBytes: number[];
}

/** The image formats the API accepts, with their magic bytes for detection */
export const SUPPORTED_IMAGE_FORMATS: Record<string, ImageFormatConfig> = {
	jpeg: { extension: 'jpg|jpeg', mimeType: 'image/jpeg', magicBytes: [0xff, 0xd8, 0xff] },
	png: { extension: 'png', mimeType: 'image/png', magicBytes: [0x89, 0x50, 0x4e, 0x47] },
	webp: { extension: 'webp', mimeType: 'image/webp', magicBytes: [0x52, 0x49, 0x46, 0x46] },
	gif: { extension: 'gif', mimeType: 'image/gif', magicBytes: [0x47, 0x49, 0x46] },
};

export function supportedMimeTypes(): string[] {
	return Object.values(SUPPORTED_IMAGE_FORMATS).map((format) => format.mimeType);
}

export function detectMimeTypeFromExtension(filename: string): string | null {
	const extension = filename.toLowerCase().split('.').pop();
	if (!extension) {
		return null;
	}
	for (const format of Object.values(SUPPORTED_IMAGE_FORMATS)) {
		if (format.extension.split('|').includes(extension)) {
			return format.mimeType;
		}
	}
	return null;
}

export function detectMimeTypeFromBytes(bytes: Buffer): string | null {
	for (const format of Object.values(SUPPORTED_IMAGE_FORMATS)) {
		if (bytes.subarray(0, format.magicBytes.length).equals(Buffer.from(format.magicBytes))) {
			return format.mimeType;
		}
	}
	return null;
}

export function detectMimeTypeFromBase64(base64Data: string): string | null {
	try {
		return detectMimeTypeFromBytes(Buffer.from(base64Data, 'base64'));
	} catch {
		// Invalid base64 falls through to no detection
	}
	return null;
}

export function isValidBase64(data: string): boolean {
	return BASE64_REGEX.test(data);
}

/** One image part in a state array. This is OpenRouter's shape; openai.ts
 * translates it for OpenAI's Decisions format. */
export interface ImagePart {
	type: 'image_url';
	image_url: { url: string };
}

export type StateParts = [string, ImagePart];

function looksLikeImagePart(value: unknown): value is ImagePart {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return false;
	}
	const item = value as Record<string, unknown>;
	if (item.type !== 'image_url') {
		return false;
	}
	const url = (item.image_url as Record<string, unknown> | undefined)?.url;
	return typeof url === 'string' && url !== '';
}

/** Whether a state is the parts array Text + Image mode builds: text first, then the image */
export function isImageParts(state: unknown): state is StateParts {
	return (
		Array.isArray(state) &&
		state.length === 2 &&
		typeof state[0] === 'string' &&
		looksLikeImagePart(state[1])
	);
}

/** OpenAI's Decisions format carries a parts state as one user message with
 * input_text and input_image parts, and holds the image URL as a plain string. */
export function toOpenAiMessages(state: StateParts): unknown[] {
	return [
		{
			role: 'user',
			content: [
				{ type: 'input_text', text: state[0] },
				{ type: 'input_image', image_url: state[1].image_url.url },
			],
		},
	];
}

function imagePart(url: string): ImagePart {
	return { type: 'image_url', image_url: { url } };
}

function rejectTooLarge(context: ItemContext, sizeBytes: number): never {
	fail(
		context,
		`The image is ${(sizeBytes / 1024 / 1024).toFixed(2)}MB, above the ${IMAGE_SIZE_LIMIT_MB}MB limit`,
		'Compress the image or use a smaller resolution.',
	);
}

function rejectOutOfBandSize(context: ItemContext, bytes: Buffer): void {
	if (bytes.length === 0) {
		fail(context, 'The image is empty');
	}
	if (bytes.length > IMAGE_SIZE_LIMIT_BYTES) {
		rejectTooLarge(context, bytes.length);
	}
}

function rejectUnsupported(context: ItemContext, mimeType: string | null): never {
	fail(
		context,
		mimeType
			? `The image format '${mimeType}' is not supported`
			: 'The image format could not be detected',
		`Supported image formats: ${supportedMimeTypes().join(', ')}. Detection reads the image's own bytes, so a renamed file still works; a format outside the list, such as BMP, cannot be sent.`,
	);
}

function isUnknownFormat(mimeType: string | null | undefined): boolean {
	return !mimeType || !supportedMimeTypes().includes(mimeType);
}

async function fromBinary(functions: IExecuteFunctions, context: ItemContext): Promise<ImagePart> {
	const { itemIndex } = context;
	const propertyName = (
		(functions.getNodeParameter('binaryPropertyName', itemIndex, 'data') as string) || 'data'
	).trim();
	const binary = functions.getInputData()[itemIndex]?.binary ?? {};
	const binaryMeta = binary[propertyName];
	if (!binaryMeta) {
		const available = Object.keys(binary).join(', ') || 'none';
		fail(
			context,
			`The binary property '${propertyName}' has no data`,
			`This item's binary properties: [${available}]. Point 'Binary Property' at the image the previous node outputs.`,
		);
	}
	let bytes: Buffer;
	try {
		bytes = (await functions.helpers.getBinaryDataBuffer(itemIndex, propertyName)) as Buffer;
	} catch (error) {
		fail(context, `Failed to read the binary property '${propertyName}'`, (error as Error).message);
	}
	rejectOutOfBandSize(context, bytes);
	const base64Data = bytes.toString('base64');
	const paramFilename = ((functions.getNodeParameter('fileName', itemIndex, '') as string) ?? '')
		.trim();
	const filename = paramFilename || binaryMeta?.fileName || '';
	// Magic bytes are the most reliable signal; the filename and the metadata's
	// own mimeType only fill in when the bytes say nothing.
	const mimeType =
		detectMimeTypeFromBase64(base64Data) ??
		detectMimeTypeFromExtension(filename) ??
		binaryMeta?.mimeType;
	if (isUnknownFormat(mimeType)) {
		rejectUnsupported(context, mimeType ?? null);
	}
	return imagePart(`data:${mimeType};base64,${base64Data}`);
}

function fromBase64(functions: IExecuteFunctions, context: ItemContext): ImagePart {
	const { itemIndex } = context;
	const raw = (functions.getNodeParameter('imageBase64', itemIndex, '') as string) ?? '';
	const base64Data = raw.replace(/\s/g, '');
	if (base64Data === '') {
		fail(
			context,
			"'Base64 Image' is empty",
			"Enter the image's base64 data, without the 'data:' prefix",
		);
	}
	if (!isValidBase64(base64Data)) {
		fail(
			context,
			"'Base64 Image' is not valid base64",
			"Enter only base64 characters, without the 'data:' prefix.",
		);
	}
	const bytes = Buffer.from(base64Data, 'base64');
	rejectOutOfBandSize(context, bytes);
	const chosen = (functions.getNodeParameter('imageMimeType', itemIndex, 'auto') as string) ?? 'auto';
	const mimeType = chosen === 'auto' ? detectMimeTypeFromBase64(base64Data) : chosen;
	if (isUnknownFormat(mimeType)) {
		rejectUnsupported(context, mimeType ?? null);
	}
	return imagePart(`data:${mimeType};base64,${base64Data}`);
}

function declareServerContentType(headerValue: unknown): string | null {
	if (typeof headerValue !== 'string') {
		return null;
	}
	const declared = headerValue.split(';')[0].trim();
	return isUnknownFormat(declared) ? null : declared;
}

/** The download response as bytes, whatever shape the helper returned */
function toBuffer(body: unknown): Buffer {
	if (Buffer.isBuffer(body)) {
		return body;
	}
	if (body instanceof ArrayBuffer) {
		return Buffer.from(new Uint8Array(body));
	}
	if (typeof body === 'string') {
		return Buffer.from(body, 'utf8');
	}
	return Buffer.alloc(0);
}

/** A Public URL image is downloaded and sent as its `data:` URL: the Decisions
 * APIs accept inline data URLs, not a URL to fetch on their own. */
async function fromUrl(functions: IExecuteFunctions, context: ItemContext): Promise<ImagePart> {
	const { itemIndex } = context;
	const url = ((functions.getNodeParameter('imageUrl', itemIndex, '') as string) ?? '').trim();
	if (url === '') {
		fail(context, "'Image URL' is empty", 'Enter the HTTP(S) URL of the image');
	}
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		fail(context, `'${url}' is not a valid URL`, "Set 'Image URL' to an HTTP(S) URL");
	}
	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		fail(context, "'Image URL' must start with http:// or https://");
	}
	const lowered = url.toLowerCase();
	if (lowered.includes('<script') || lowered.includes('javascript:')) {
		fail(context, "'Image URL' contains script code", 'Use a plain HTTP(S) URL to the image.');
	}
	const timeout = functions.getNodeParameter('options.timeout', itemIndex, 5000) as number;
	let response: { statusCode?: number; headers?: IDataObject; body?: unknown };
	try {
		response = (await functions.helpers.request({
			method: 'GET',
			url,
			// The body must arrive as raw bytes: the node detects the format from
			// the image's own bytes
			encoding: null,
			simple: false,
			resolveWithFullResponse: true,
			timeout,
		})) as { statusCode?: number; headers?: IDataObject; body?: unknown };
	} catch (error) {
		fail(
			context,
			`The image at '${url}' could not be downloaded`,
			(error as Error).message,
		);
	}
	const status = (response.statusCode ?? 0) as number;
	if (status < 200 || status >= 300) {
		fail(
			context,
			`The image at '${url}' could not be downloaded`,
			`The server answered status ${status}.`,
		);
	}
	const bytes = toBuffer(response.body);
	rejectOutOfBandSize(context, bytes);
	// Magic bytes are the most reliable signal; the server's own content-type
	// only fills in when the bytes say nothing.
	const mimeType =
		detectMimeTypeFromBytes(bytes) ?? declareServerContentType(response.headers?.['content-type']);
	if (isUnknownFormat(mimeType)) {
		rejectUnsupported(context, mimeType ?? null);
	}
	return imagePart(`data:${mimeType};base64,${bytes.toString('base64')}`);
}

/** Reads the item's image parameters, loads the image, validates it and
 * returns the part to append to the state array. */
export async function buildImagePart(
	functions: IExecuteFunctions,
	context: ItemContext,
): Promise<ImagePart> {
	const source = functions.getNodeParameter('imageSource', context.itemIndex, 'binary') as string;
	if (source === 'url') {
		return fromUrl(functions, context);
	}
	if (source === 'base64') {
		return fromBase64(functions, context);
	}
	if (source === 'binary') {
		return fromBinary(functions, context);
	}
	fail(
		context,
		`'Image Source' (${source}) is not one of its options`,
		'Set Image Source to Binary Data, Public URL or Base64.',
	);
}

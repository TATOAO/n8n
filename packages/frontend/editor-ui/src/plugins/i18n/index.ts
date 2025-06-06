import axios from 'axios';
import { createI18n } from 'vue-i18n';
import { locale } from '@n8n/design-system';
import type { INodeProperties, INodePropertyCollection, INodePropertyOptions } from 'n8n-workflow';

import type { INodeTranslationHeaders } from '@/Interface';
import { useUIStore } from '@/stores/ui.store';
import { useNDVStore } from '@/stores/ndv.store';
import { useRootStore } from '@n8n/stores/useRootStore';
import englishBaseText from './locales/en.json';
import {
	deriveMiddleKey,
	isNestedInCollectionLike,
	normalize,
	insertOptionsAndValues,
} from './utils';

export const i18nInstance = createI18n({
	locale: 'en',
	fallbackLocale: 'en',
	messages: { en: englishBaseText },
	warnHtmlInMessage: 'off',
});

type BaseTextOptions = {
	adjustToNumber?: number;
	interpolate?: Record<string, string | number>;
};

export class I18nClass {
	private baseTextCache = new Map<string, string>();

	private get i18n() {
		return i18nInstance.global;
	}

	// ----------------------------------
	//         helper methods
	// ----------------------------------

	exists(key: string) {
		return this.i18n.te(key);
	}

	shortNodeType(longNodeType: string) {
		return longNodeType.replace('n8n-nodes-base.', '');
	}

	get locale() {
		return i18nInstance.global.locale;
	}

	// ----------------------------------
	//        render methods
	// ----------------------------------

	/**
	 * Render a string of base text, i.e. a string with a fixed path to the localized value. Optionally allows for [interpolation](https://kazupon.github.io/vue-i18n/guide/formatting.html#named-formatting) when the localized value contains a string between curly braces.
	 */
	baseText(key: BaseTextKey, options?: BaseTextOptions): string {
		// Create a unique cache key
		const cacheKey = `${key}-${JSON.stringify(options)}`;

		// Check if the result is already cached
		if (this.baseTextCache.has(cacheKey)) {
			return this.baseTextCache.get(cacheKey) ?? key;
		}

		const interpolate = { ...options?.interpolate };
		let result: string;
		if (options?.adjustToNumber !== undefined) {
			result = this.i18n.t(key, interpolate, options.adjustToNumber).toString();
		} else {
			result = this.i18n.t(key, interpolate).toString();
		}

		// Store the result in the cache
		this.baseTextCache.set(cacheKey, result);

		return result;
	}

	/**
	 * Render a string of dynamic text, i.e. a string with a constructed path to the localized value.
	 */
	private dynamicRender({ key, fallback }: { key: string; fallback?: string }) {
		return this.i18n.te(key) ? this.i18n.t(key).toString() : (fallback ?? '');
	}

	displayTimer(msPassed: number, showMs = false): string {
		if (msPassed < 60000) {
			if (!showMs) {
				return `${Math.floor(msPassed / 1000)}${this.baseText('genericHelpers.secShort')}`;
			}

			if (msPassed > 0 && msPassed < 1000) {
				return `${msPassed}${this.baseText('genericHelpers.millis')}`;
			}

			return `${msPassed / 1000}${this.baseText('genericHelpers.secShort')}`;
		}

		const secondsPassed = Math.floor(msPassed / 1000);
		const minutesPassed = Math.floor(secondsPassed / 60);
		const secondsLeft = (secondsPassed - minutesPassed * 60).toString().padStart(2, '0');

		return `${minutesPassed}:${secondsLeft}${this.baseText('genericHelpers.minShort')}`;
	}

	/**
	 * Render a string of header text (a node's name and description),
	 * used variously in the nodes panel, under the node icon, etc.
	 */
	headerText(arg: { key: string; fallback: string }) {
		return this.dynamicRender(arg);
	}

	/**
	 * Namespace for methods to render text in the credentials details modal.
	 */
	credText() {
		const uiStore = useUIStore();
		const credentialType = uiStore.activeCredentialType;
		const credentialPrefix = `n8n-nodes-base.credentials.${credentialType}`;
		const context = this;

		return {
			/**
			 * Display name for a top-level param.
			 */
			inputLabelDisplayName({ name: parameterName, displayName }: INodeProperties) {
				if (['clientId', 'clientSecret'].includes(parameterName)) {
					return context.dynamicRender({
						key: `_reusableDynamicText.oauth2.${parameterName}`,
						fallback: displayName,
					});
				}

				return context.dynamicRender({
					key: `${credentialPrefix}.${parameterName}.displayName`,
					fallback: displayName,
				});
			},

			/**
			 * Hint for a top-level param.
			 */
			hint({ name: parameterName, hint }: INodeProperties) {
				return context.dynamicRender({
					key: `${credentialPrefix}.${parameterName}.hint`,
					fallback: hint,
				});
			},

			/**
			 * Description (tooltip text) for an input label param.
			 */
			inputLabelDescription({ name: parameterName, description }: INodeProperties) {
				return context.dynamicRender({
					key: `${credentialPrefix}.${parameterName}.description`,
					fallback: description,
				});
			},

			/**
			 * Display name for an option inside an `options` or `multiOptions` param.
			 */
			optionsOptionDisplayName(
				{ name: parameterName }: INodeProperties,
				{ value: optionName, name: displayName }: INodePropertyOptions,
			) {
				return context.dynamicRender({
					key: `${credentialPrefix}.${parameterName}.options.${optionName}.displayName`,
					fallback: displayName,
				});
			},

			/**
			 * Description for an option inside an `options` or `multiOptions` param.
			 */
			optionsOptionDescription(
				{ name: parameterName }: INodeProperties,
				{ value: optionName, description }: INodePropertyOptions,
			) {
				return context.dynamicRender({
					key: `${credentialPrefix}.${parameterName}.options.${optionName}.description`,
					fallback: description,
				});
			},

			/**
			 * Placeholder for a `string` param.
			 */
			placeholder({ name: parameterName, placeholder }: INodeProperties) {
				return context.dynamicRender({
					key: `${credentialPrefix}.${parameterName}.placeholder`,
					fallback: placeholder,
				});
			},
		};
	}

	/**
	 * Namespace for methods to render text in the node details view,
	 * except for `eventTriggerDescription`.
	 */
	nodeText() {
		const ndvStore = useNDVStore();
		const activeNode = ndvStore.activeNode;
		const nodeType = activeNode ? this.shortNodeType(activeNode.type) : ''; // unused in eventTriggerDescription
		const initialKey = `n8n-nodes-base.nodes.${nodeType}.nodeView`;
		const context = this;

		return {
			/**
			 * Display name for an input label, whether top-level or nested.
			 */
			inputLabelDisplayName(parameter: INodeProperties | INodePropertyCollection, path: string) {
				const middleKey = deriveMiddleKey(path, parameter);

				return context.dynamicRender({
					key: `${initialKey}.${middleKey}.displayName`,
					fallback: parameter.displayName,
				});
			},

			/**
			 * Description (tooltip text) for an input label, whether top-level or nested.
			 */
			inputLabelDescription(parameter: INodeProperties, path: string) {
				const middleKey = deriveMiddleKey(path, parameter);

				return context.dynamicRender({
					key: `${initialKey}.${middleKey}.description`,
					fallback: parameter.description,
				});
			},

			/**
			 * Hint for an input, whether top-level or nested.
			 */
			hint(parameter: INodeProperties, path: string) {
				const middleKey = deriveMiddleKey(path, parameter);

				return context.dynamicRender({
					key: `${initialKey}.${middleKey}.hint`,
					fallback: parameter.hint,
				});
			},

			/**
			 * Placeholder for an input label or `collection` or `fixedCollection` param,
			 * whether top-level or nested.
			 * - For an input label, the placeholder is unselectable greyed-out sample text.
			 * - For a `collection` or `fixedCollection`, the placeholder is the button text.
			 */
			placeholder(parameter: INodeProperties, path: string) {
				let middleKey = parameter.name;

				if (isNestedInCollectionLike(path)) {
					const pathSegments = normalize(path).split('.');
					middleKey = insertOptionsAndValues(pathSegments).join('.');
				}

				return context.dynamicRender({
					key: `${initialKey}.${middleKey}.placeholder`,
					fallback: parameter.placeholder,
				});
			},

			/**
			 * Display name for an option inside an `options` or `multiOptions` param,
			 * whether top-level or nested.
			 */
			optionsOptionDisplayName(
				parameter: INodeProperties,
				{ value: optionName, name: displayName }: INodePropertyOptions,
				path: string,
			) {
				let middleKey = parameter.name;

				if (isNestedInCollectionLike(path)) {
					const pathSegments = normalize(path).split('.');
					middleKey = insertOptionsAndValues(pathSegments).join('.');
				}

				return context.dynamicRender({
					key: `${initialKey}.${middleKey}.options.${optionName}.displayName`,
					fallback: displayName,
				});
			},

			/**
			 * Description for an option inside an `options` or `multiOptions` param,
			 * whether top-level or nested.
			 */
			optionsOptionDescription(
				parameter: INodeProperties,
				{ value: optionName, description }: INodePropertyOptions,
				path: string,
			) {
				let middleKey = parameter.name;

				if (isNestedInCollectionLike(path)) {
					const pathSegments = normalize(path).split('.');
					middleKey = insertOptionsAndValues(pathSegments).join('.');
				}

				return context.dynamicRender({
					key: `${initialKey}.${middleKey}.options.${optionName}.description`,
					fallback: description,
				});
			},

			/**
			 * Display name for an option in the dropdown menu of a `collection` or
			 * fixedCollection` param. No nesting support since `collection` cannot
			 * be nested in a `collection` or in a `fixedCollection`.
			 */
			collectionOptionDisplayName(
				parameter: INodeProperties,
				{ name: optionName, displayName }: INodePropertyCollection,
				path: string,
			) {
				let middleKey = parameter.name;

				if (isNestedInCollectionLike(path)) {
					const pathSegments = normalize(path).split('.');
					middleKey = insertOptionsAndValues(pathSegments).join('.');
				}

				return context.dynamicRender({
					key: `${initialKey}.${middleKey}.options.${optionName}.displayName`,
					fallback: displayName,
				});
			},

			/**
			 * Text for a button to add another option inside a `collection` or
			 * `fixedCollection` param having `multipleValues: true`.
			 */
			multipleValueButtonText({ name: parameterName, typeOptions }: INodeProperties) {
				return context.dynamicRender({
					key: `${initialKey}.${parameterName}.multipleValueButtonText`,
					fallback: typeOptions?.multipleValueButtonText,
				});
			},

			eventTriggerDescription(nodeType: string, eventTriggerDescription: string) {
				return context.dynamicRender({
					key: `n8n-nodes-base.nodes.${nodeType}.nodeView.eventTriggerDescription`,
					fallback: eventTriggerDescription,
				});
			},
		};
	}

	localizeNodeName(nodeName: string, type: string) {
		const isEnglishLocale = useRootStore().defaultLocale === 'en';

		if (isEnglishLocale) return nodeName;

		const nodeTypeName = this.shortNodeType(type);

		return this.headerText({
			key: `headers.${nodeTypeName}.displayName`,
			fallback: nodeName,
		});
	}

	autocompleteUIValues: Record<string, string | undefined> = {
		docLinkLabel: this.baseText('expressionEdit.learnMore'),
	};
}

const loadedLanguages = ['en'];

async function setLanguage(language: string) {
	i18nInstance.global.locale = language as 'en';
	axios.defaults.headers.common['Accept-Language'] = language;
	document!.querySelector('html')!.setAttribute('lang', language);

	// update n8n design system and element ui
	await locale.use(language);

	return language;
}

export async function loadLanguage(language: string) {
	if (i18nInstance.global.locale === language) {
		return await setLanguage(language);
	}

	if (loadedLanguages.includes(language)) {
		return await setLanguage(language);
	}

	const { numberFormats, ...rest } = (await import(`./locales/${language}.json`)).default;

	i18nInstance.global.setLocaleMessage(language, rest);

	if (numberFormats) {
		i18nInstance.global.setNumberFormat(language, numberFormats);
	}

	loadedLanguages.push(language);

	return await setLanguage(language);
}

/**
 * Add a node translation to the i18n instance's `messages` object.
 */
export function addNodeTranslation(
	nodeTranslation: { [nodeType: string]: object },
	language: string,
) {
	const newMessages = {
		'n8n-nodes-base': {
			nodes: nodeTranslation,
		},
	};

	i18nInstance.global.mergeLocaleMessage(language, newMessages);
}

/**
 * Add a credential translation to the i18n instance's `messages` object.
 */
export function addCredentialTranslation(
	nodeCredentialTranslation: { [credentialType: string]: object },
	language: string,
) {
	const newMessages = {
		'n8n-nodes-base': {
			credentials: nodeCredentialTranslation,
		},
	};

	i18nInstance.global.mergeLocaleMessage(language, newMessages);
}

/**
 * Add a node's header strings to the i18n instance's `messages` object.
 */
export function addHeaders(headers: INodeTranslationHeaders, language: string) {
	i18nInstance.global.mergeLocaleMessage(language, { headers });
}

export const i18n: I18nClass = new I18nClass();

// ----------------------------------
//             typings
// ----------------------------------

type GetBaseTextKey<T> = T extends `_${string}` ? never : T;

export type BaseTextKey = GetBaseTextKey<keyof typeof englishBaseText>;

type GetCategoryName<T> = T extends `nodeCreator.categoryNames.${infer C}` ? C : never;

export type CategoryName = GetCategoryName<keyof typeof englishBaseText>;

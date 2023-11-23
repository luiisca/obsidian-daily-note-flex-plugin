import { App, DropdownComponent, Notice, PluginSettingTab, Setting } from 'obsidian';

import type DailyNoteFlexPlugin from '@/main';
import { settingsStore } from '@/stores';
import { get, type Unsubscriber } from 'svelte/store';
import { fetchWithRetry } from './utils';
import dayjs from 'dayjs';
import weekday from 'dayjs/plugin/weekday';
import localeData from 'dayjs/plugin/localeData';
import locales from './locales';
import type { IGranularity } from './calendar-io';
import { setupPopover } from './calendar-ui/popovers';
import { CALENDAR_POPOVER_ID } from './constants';
import View from './View.svelte';

dayjs.extend(weekday);
dayjs.extend(localeData);

export interface ISettings {
	viewOpen: boolean;
	shouldConfirmBeforeCreate: boolean;
	yearsRangesStart: 2020;
	autoHoverPreview: boolean;
	openPopoverOnRibbonHover: boolean;
	crrNldModalGranularity: IGranularity;

	localeData: {
		loading: boolean;
		weekStart: string;
		showWeekNums: boolean;
		sysLocaleKey: string;
		localeOverride: string | null;
		weekdays: string[];
		weekdaysShort: string[];
	};

	popoversCloseData: {
		closePopoversOneByOneOnClickOut: boolean;
		closePopoversOneByOneOnEscKeydown: boolean;
		searchInputOnEscKeydown: 'close-popover' | 'reset';
	};
}

export const DEFAULT_SETTINGS: ISettings = Object.freeze({
	viewOpen: false,
	shouldConfirmBeforeCreate: true,
	yearsRangesStart: 2020,
	autoHoverPreview: false,
	openPopoverOnRibbonHover: false,
	crrNldModalGranularity: 'day',

	localeData: {
		loading: false,
		weekStart: dayjs.weekdays()[dayjs().weekday(0).day()],
		showWeekNums: false,
		sysLocaleKey:
			navigator.languages.find((locale) => locales.has(locale.toLocaleLowerCase())) ||
			navigator.languages[0],
		localeOverride: null,
		weekdays: dayjs.weekdays(),
		weekdaysShort: dayjs.weekdaysShort()
	},

	popoversCloseData: {
		closePopoversOneByOneOnClickOut: false,
		closePopoversOneByOneOnEscKeydown: true,
		searchInputOnEscKeydown: 'close-popover' as 'close-popover' | 'reset'
	}
});

export class SettingsTab extends PluginSettingTab {
	plugin: DailyNoteFlexPlugin;
	private unsubscribeSettingsStore: Unsubscriber;
	private locales = locales;
	private localesUpdated = false;
	private firstRender = true;

	constructor(app: App, plugin: DailyNoteFlexPlugin) {
		super(app, plugin);
		this.plugin = plugin;

		window.dayjs = dayjs;
	}

	display() {
		console.log('Displaying setttings ⚙️');

		this.containerEl.empty();

		this.containerEl.createEl('h3', {
			text: 'General'
		});

		this.addPopoverSetting();
		this.addOpenPopoverOnRibbonHoverSetting();
		this.addConfirmCreateSetting();
		this.addConfirmAutoHoverPreviewSetting();
		this.addShowWeeklyNoteSetting();

		this.containerEl.createEl('h3', {
			text: 'Locale'
		});
		this.addLocaleOverrideSetting();
		this.addWeekStartSetting();

		if (!get(settingsStore).viewOpen) {
			this.containerEl.createEl('h3', {
				text: 'Popovers close conditions'
			});

			this.addClosePopoversOneByOneOnClickOutSetting();
			this.addClosePopoversOneByBoneOnEscKeydownSetting();
			if (get(settingsStore).popoversCloseData.closePopoversOneByOneOnEscKeydown) {
				this.addSpSearchInputOnEscKeydownSetting();
			}
		}
	}

	addPopoverSetting() {
		// TODO: improve wording
		new Setting(this.containerEl)
			.setName('Ribbon icon opens Calendar view')
			.setDesc('Show Calendar view when clicking on ribbon icon instead of default popover')
			.addToggle((viewOpen) =>
				viewOpen.setValue(this.plugin.settings.viewOpen).onChange(async (viewOpen) => {
					if (this.plugin.popoversCleanups.length > 0) {
						this.plugin.popoversCleanups.forEach((cleanup) => cleanup());
						this.plugin.popoversCleanups = [];
					}

					if (!viewOpen) {
						setupPopover({
							id: CALENDAR_POPOVER_ID,
							view: {
								Component: View
							}
						});
					}

					await this.plugin.saveSettings(() => ({
						viewOpen
					}));

					this.display(); // hide/show popovers close conditions settings
				})
			);
	}
	addOpenPopoverOnRibbonHoverSetting() {
		// TODO: improve wording
		new Setting(this.containerEl).setName('Open popover on Ribbon hover').addToggle((el) =>
			el
				.setValue(this.plugin.settings.openPopoverOnRibbonHover)
				.onChange(async (openPopoverOnRibbonHover) => {
					console.log('setting() > popoversCleanups: 🧹🧹🧹 🌬️ ', this.plugin.popoversCleanups);
					if (this.plugin.popoversCleanups.length > 0) {
						this.plugin.popoversCleanups.forEach((cleanup) => cleanup());
						this.plugin.popoversCleanups = [];
					}

					console.log('setting() > openPopoverOnRibbonHover: ', openPopoverOnRibbonHover);

					setupPopover({
						id: CALENDAR_POPOVER_ID,
						view: {
							Component: View
						}
					});

					await this.plugin.saveSettings(() => ({
						openPopoverOnRibbonHover
					}));
				})
		);
	}

	addConfirmCreateSetting(): void {
		new Setting(this.containerEl)
			.setName('Confirm before creating new note')
			.setDesc('Display a confirmation dialog before creating a new note')
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.shouldConfirmBeforeCreate);
				toggle.onChange(async (value) => {
					this.plugin.saveSettings(() => ({
						shouldConfirmBeforeCreate: value
					}));
				});
			});
	}
	addConfirmAutoHoverPreviewSetting() {
		// TODO: improve wording
		new Setting(this.containerEl)
			.setName('Automatically preview note on hover')
			.setDesc('Require special key combination (Shift + mouse hover) to preview note')
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.autoHoverPreview);
				toggle.onChange(async (value) => {
					this.plugin.saveSettings(() => ({
						autoHoverPreview: value
					}));
				});
			});
	}

	addShowWeeklyNoteSetting(): void {
		new Setting(this.containerEl)
			.setName('Show week number')
			.setDesc('Enable this to add a column with the week number')
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.localeData.showWeekNums);
				toggle.onChange(async (value) => {
					this.plugin.saveSettings((settings) => ({
						localeData: {
							...settings.localeData,
							showWeekNums: value
						}
					}));
					this.display(); // show/hide weekly settings
				});
			});
	}

	addWeekStartSetting() {
		// clean dropdown to allow different options when rerendered
		const removeAllOptions = (dropdown: DropdownComponent) => {
			const selectNode = dropdown.selectEl;
			while (selectNode.firstChild) {
				selectNode.removeChild(selectNode.firstChild);
			}
		};

		const localeData = get(settingsStore).localeData;

		// TODO: improve wording
		new Setting(this.containerEl)
			.setName('Start week on:')
			.setDesc(
				"Choose what day of the week to start. Select 'Locale default' to use the default specified by day.js"
			)
			.addDropdown((dropdown) => {
				removeAllOptions(dropdown);

				if (!localeData.loading) {
					// default value
					dropdown.setValue(localeData.weekStart);

					// options
					dropdown.addOption(localeData.weekStart, `Locale default - ${localeData.weekStart}`);
					localeData.weekdays.forEach((day) => {
						dropdown.addOption(day, day);
					});

					dropdown.onChange(async (value) => {
						this.plugin.saveSettings((settings) => ({
							localeData: {
								...settings.localeData,
								weekStart: value
							}
						}));
					});
				} else {
					dropdown.addOption('loading', 'Loading...');

					// add invisible option to reduce layout shifting when actual data is loaded
					dropdown.addOption('invisible', '.'.repeat(40));
					dropdown.selectEl.options[1].disabled = true;
					dropdown.selectEl.options[1].style.display = 'none';
					dropdown.setDisabled(true);
				}
			});
	}

	addLocaleOverrideSetting() {
		const localeData = get(settingsStore).localeData;
		if (this.firstRender) {
			this.firstRender = false;

			this.loadLocale(localeData.localeOverride || localeData.sysLocaleKey);
		}

		new Setting(this.containerEl)
			.setName('Override locale:')
			.setDesc('Set this if you want to use a locale different from the default')
			.addDropdown(async (dropdown) => {
				dropdown.setValue(localeData.localeOverride || localeData.sysLocaleKey);

				const sysLocaleName = this.locales.get(localeData.sysLocaleKey) || localeData.sysLocaleKey;

				dropdown.addOption(localeData.sysLocaleKey, `Same as system - ${sysLocaleName}`);

				//// Request locales list from the internet if connection available and locales are not updated already, otherwise load from local file
				if (navigator.onLine) {
					if (!this.localesUpdated) {
						// add invisible option to ensure <select /> doesn't break
						dropdown.addOption('invisible', '.'.repeat(60));
						dropdown.selectEl.options[1].disabled = true;
						dropdown.selectEl.options[1].style.display = 'none';

						// add loading option
						dropdown.addOption('loading', 'Loading...');
						dropdown.selectEl.options[2].disabled = true;

						try {
							const localesArrRes = await fetchWithRetry<{ key: string; name: string }[]>(
								'https://cdn.jsdelivr.net/npm/dayjs@1/locale.json'
							);

							if (!localesArrRes) {
								this.locales = locales;
							} else {
								const localesMap = new Map() as Map<string, string>;
								localesArrRes.forEach((obj) => {
									localesMap.set(obj.key, obj.name);
								});

								this.locales = localesMap;
								this.localesUpdated = true;
							}

							// remove loading option
							dropdown.selectEl.remove(2);
						} catch (error) {
							console.error(error);
							this.locales = locales;

							new Notice(error as string);
						}
					}
				} else {
					this.locales = locales;
				}

				// Add options once locales loaded from the internet or local file
				this.locales.forEach((value, key) => {
					dropdown.addOption(key, value);
				});

				// update dropdown value to avoid reset after new locale loaded
				dropdown.setValue(localeData.localeOverride || localeData.sysLocaleKey);

				dropdown.onChange(async (localeKey) => {
					this.loadLocale(localeKey);
				});
			});
	}

	addClosePopoversOneByOneOnClickOutSetting() {
		const settingEl = new Setting(this.containerEl)
			.setName('Close popovers one by one on click outside')
			.addToggle((toggle) => {
				toggle.setValue(get(settingsStore).popoversCloseData.closePopoversOneByOneOnClickOut);
				toggle.onChange((value) => {
					this.plugin.saveSettings((settings) => ({
						popoversCloseData: {
							...settings.popoversCloseData,
							closePopoversOneByOneOnClickOut: value
						}
					}));
				});
			}).settingEl;
		settingEl.style.flexWrap = 'wrap';
	}

	addClosePopoversOneByBoneOnEscKeydownSetting() {
		new Setting(this.containerEl)
			.setName('Close popovers one by one on `Esc` key pressed')
			.addToggle((toggle) => {
				toggle.setValue(get(settingsStore).popoversCloseData.closePopoversOneByOneOnEscKeydown);
				toggle.onChange((value) => {
					this.plugin.saveSettings((settings) => ({
						popoversCloseData: {
							...settings.popoversCloseData,
							closePopoversOneByOneOnEscKeydown: value
						}
					}));

					this.display();
				});
			});
	}
	addSpSearchInputOnEscKeydownSetting() {
		console.log('👟 RUNNING addSpSearchInputOnEscKeydownSetting()');

		new Setting(this.containerEl)
			.setName("On sticker popover's search input `Esc` keydown")
			.setDesc("Decide what to do when `Esc` pressed in sticker popover's search input")
			.addDropdown((dropdown) => {
				console.log(
					'value in store: ',
					get(settingsStore).popoversCloseData.searchInputOnEscKeydown
				);
				// dropdown.setValue(get(settingsStore).popoversCloseData.searchInputOnEscKeydown);
				dropdown.addOption('close-popover', 'Close sticker popover');
				dropdown.addOption('reset', 'Erase search input');
				dropdown.setValue(get(settingsStore).popoversCloseData.searchInputOnEscKeydown);

				dropdown.onChange((value) => {
					console.log('from addSpSearchInputONEscKeydownSetting(), value: ', value);
					const typedValue = value as 'close-popover' | 'reset';
					this.plugin.saveSettings((settings) => ({
						popoversCloseData: {
							...settings.popoversCloseData,
							searchInputOnEscKeydown: typedValue
						}
					}));
				});
			});
	}

	// helpers
	loadLocale(localeKey = 'en') {
		const loadLocaleWithRetry = (locale: string, retries = 0): Promise<string> => {
			return new Promise((resolve, reject) => {
				// resolve if locale already loaded
				if (
					document.querySelector(
						`script[src="https://cdn.jsdelivr.net/npm/dayjs@1/locale/${locale}.js"]`
					)
				) {
					resolve(locale);

					return;
				}

				const script = document.createElement('script');
				script.src = `https://cdn.jsdelivr.net/npm/dayjs@1/locale/${locale}.js`;
				document.body.appendChild(script);

				script.onload = () => {
					resolve(locale); // Resolve with the selected locale
				};

				script.onerror = () => {
					if (retries < 3) {
						new Notice(`Retrying to load locale: ${locale}, attempt ${retries + 1}`);
						loadLocaleWithRetry(locale, retries + 1)
							.then(resolve) // Resolve with the selected locale after successful retry
							.catch(reject);
					} else {
						new Notice(`Failed to load locale: ${locale} after ${retries} attempts`);

						// Resolve to default English if locale cannot be fetched
						new Notice('Defaulting to English - en');
						resolve('en');
					}
				};
			});
		};

		const defaultToEnglish = () => {
			window.dayjs.locale('en');

			this.plugin.saveSettings((settings) => ({
				localeData: {
					...settings.localeData,
					weekStart: window.dayjs.weekdays()[window.dayjs().weekday(0).day()],
					localeOverride: 'en',
					weekdays: window.dayjs.weekdays(),
					weekdaysShort: window.dayjs.weekdaysShort()
				}
			}));

			this.display();
		};

		(async () => {
			try {
				if (localeKey === 'en') {
					defaultToEnglish();
				} else {
					// loading
					if (!get(settingsStore).localeData.loading) {
						this.plugin.saveSettings((settings) => ({
							localeData: {
								...settings.localeData,
								loading: true
							}
						}));

						this.display();
					}

					// request
					const selectedLocale = await loadLocaleWithRetry(localeKey);

					if (selectedLocale === 'en') {
						defaultToEnglish();
					} else {
						// set new locale
						window.dayjs.locale(selectedLocale);

						this.plugin.saveSettings((settings) => ({
							localeData: {
								...settings.localeData,
								weekStart: window.dayjs.weekdays()[window.dayjs().weekday(0).day()],
								localeOverride: localeKey,
								weekdays: window.dayjs.weekdays(),
								weekdaysShort: window.dayjs.weekdaysShort(),
								loading: false
							}
						}));

						this.display();
					}
				}
			} catch (error) {
				console.error(error);
			}
		})();
	}
}

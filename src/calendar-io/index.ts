import type moment from 'moment';
import type { Moment } from 'moment';
import { normalizePath, type App, TFile, TFolder, Vault, Notice, WorkspaceLeaf } from 'obsidian';

declare global {
	interface Window {
		app: App;
		moment: typeof moment;
	}
}

export function appHasNotesPluginLoadedByGranularity(granularity: IGranularity): boolean {
	const { app } = window;
	const periodicity = getPeriodicityFromGranularity(granularity);

	if (periodicity === 'daily') {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const dailyNotesPlugin = (<any>app).internalPlugins.plugins['daily-notes'];
		if (dailyNotesPlugin && dailyNotesPlugin.enabled) {
			return true;
		}
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const periodicNotes = (<any>app).plugins.getPlugin('periodic-notes');
	return periodicNotes && periodicNotes.settings?.[periodicity]?.enabled;
}

export function getNoteByGranularity({
	date,
	granularity
}: {
	date: Moment;
	granularity: IGranularity;
}): TFile | undefined {
	const notesStore = get(notesStores[granularity]);

	return notesStore[getDateUID(date, granularity)];
}

export function getAllNotesByGranularity(granularity: IGranularity): Record<string, TFile> {
	const notes: Record<string, TFile> = {};
	const { vault } = window.app;

	try {
		const { folder } = getNoteSettingsByGranularity(granularity);

		const notesFolder = vault.getAbstractFileByPath(normalizePath(folder)) as TFolder;

		if (!notesFolder) {
			throw new Error(
				`Unable to locate the ${getPeriodicityFromGranularity(
					granularity
				)} notes folder. Check your plugin's settings or restart calendar plugin.`
			);
		}

		Vault.recurseChildren(notesFolder, (note) => {
			// console.log(`getAllNotesByGranularity() > Vault.recurseChildren(${notesFolder}) > note: `, note)

			if (note instanceof TFile) {
				// if file name maps to a valid dayjs date, it is saved in store.
				const date = getDateFromFile(note, granularity);
				if (date) {
					const dateUID = getDateUID(date, granularity);
					notes[dateUID] = note;
				}
			}
		});

		return notes;
	} catch (error) {
		typeof error === 'string' && new Notice(error);

		return notes;
	}
}

export async function tryToCreateNote({
	leaf,
	date,
	granularity,
	confirmBeforeCreateOverride
}: {
	leaf: WorkspaceLeaf;
	date: Moment;
	granularity: IGranularity;
	confirmBeforeCreateOverride?: boolean;
}) {
	const settings = get(settingsStore);
	const openFile = async (file: TFile) => {
		file && (await leaf.openFile(file));
		activeFile.setFile(getDateUID(date, granularity));
	};

	let file = getNoteByGranularity({ date, granularity });

	const confirmBeforeCreate =
		typeof confirmBeforeCreateOverride === 'boolean'
			? confirmBeforeCreateOverride
			: settings.shouldConfirmBeforeCreate;

	if (!file) {
		const periodicity = capitalize(getPeriodicityFromGranularity(granularity));
		const { format } = getNoteSettingsByGranularity(granularity);
		const formattedDate = date.format(format);

		if (confirmBeforeCreate) {
			createConfirmationDialog<TFile | undefined>({
				title: `New ${periodicity} Note`,
				text: `File ${formattedDate} does not exist. Would you like to create it?`,
				note: getOnCreateNoteDialogNoteFromGranularity(granularity),
				cta: 'Create',
				onAccept: async () => {
					file = await noteCreator[granularity](date);
					file && (await openFile(file));

					return file;
				}
			});
		} else {
			file = await noteCreator[granularity](date);
			file && (await openFile(file));
		}
	} else {
		file && (await openFile(file));
	}
}

import type { IGranularity, IPeriodicNoteSettings } from './types';
import { createDailyNote } from './daily';
import { createWeeklyNote } from './weekly';
import { createMonthlyNote } from './monthly';
import { createQuarterlyNote } from './quarterly';
import { createYearlyNote } from './yearly';
import { getDateFromFile, getDateUID, getPeriodicityFromGranularity } from './parse';
import { getNoteSettingsByGranularity } from './settings';
import { get } from 'svelte/store';
import { activeFile, notesStores, settingsStore } from '@/stores';
import { capitalize, getOnCreateNoteDialogNoteFromGranularity } from '@/utils';
import { createConfirmationDialog } from '@/calendar-ui/modal';

export { getDateUID, getDateFromFile, getDateFromPath } from './parse';
export { getTemplateInfo } from './vault';

export type { IGranularity, IPeriodicNoteSettings };
export const noteCreator = {
	day: createDailyNote,
	week: createWeeklyNote,
	month: createMonthlyNote,
	quarter: createQuarterlyNote,
	year: createYearlyNote
};

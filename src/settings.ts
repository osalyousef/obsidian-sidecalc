import { PluginSettingTab } from 'obsidian';
import type { App, SettingDefinitionItem } from 'obsidian';
import type { NumberFormat } from './engine/format.ts';
import type SciCalcPlugin from './main.ts';
import { kofiButton, openKofi } from './ui/kofi.ts';

export interface SciCalcSettings {
	numberFormat: NumberFormat;
	digits: number;
	groupDigits: boolean;
	insertFormat: 'result' | 'equation' | 'latex';
}

export const DEFAULT_SETTINGS: SciCalcSettings = {
	numberFormat: 'norm',
	digits: 4,
	groupDigits: true,
	insertFormat: 'result',
};

type Key = keyof SciCalcSettings;

/** Declarative settings (Obsidian 1.13+): rendered and indexed for settings search by Obsidian. */
export class SciCalcSettingTab extends PluginSettingTab {
	plugin: SciCalcPlugin;

	constructor(app: App, plugin: SciCalcPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem<Key>[] {
		const format = () => this.plugin.data.settings.numberFormat;
		return [
			{
				name: 'Number format',
				desc: 'Norm shows up to 10 digits. Fix rounds to a set number of decimal places. Sci always uses ×10ⁿ.',
				control: {
					type: 'dropdown',
					key: 'numberFormat',
					options: { norm: 'Norm', fix: 'Fix (decimal places)', sci: 'Sci (significant digits)' },
				},
			},
			{
				name: 'Decimal places',
				visible: () => format() === 'fix',
				control: { type: 'slider', key: 'digits', min: 0, max: 9, step: 1 },
			},
			{
				name: 'Significant digits',
				visible: () => format() === 'sci',
				control: { type: 'slider', key: 'digits', min: 1, max: 10, step: 1 },
			},
			{
				name: 'Group digits',
				desc: 'Add thin spaces between groups of three digits, like 1 234 567.',
				control: { type: 'toggle', key: 'groupDigits' },
			},
			{
				name: 'Insert into note as',
				desc: 'What the insert button puts at the cursor in your note.',
				control: {
					type: 'dropdown',
					key: 'insertFormat',
					options: { result: 'Result only (0.75)', equation: 'Calculation (3÷4 = 0.75)', latex: 'LaTeX ($\\frac{3}{4}$)' },
				},
			},
			{
				name: 'Support development',
				desc: 'If this calculator is useful to you, you can support it on Ko-fi.',
				aliases: ['ko-fi', 'donate', 'coffee'],
				render: (setting) => {
					kofiButton(setting.controlEl, 'is-settings').addEventListener('click', openKofi);
				},
			},
		];
	}

	// Settings live in plugin.data.settings rather than the default plugin.settings.
	getControlValue(key: string): unknown {
		return this.plugin.data.settings[key as Key];
	}

	setControlValue(key: string, value: unknown): void {
		const s = this.plugin.data.settings as unknown as Record<Key, unknown>;
		// Fix allows 0 places, Sci needs at least 1 digit.
		if (key === 'numberFormat' && value === 'sci' && s.digits === 0) s.digits = 1;
		s[key as Key] = value;
		this.plugin.requestSave();
		this.plugin.refreshViews();
		if (key === 'numberFormat') this.refreshDomState(); // show the matching digits slider
	}
}

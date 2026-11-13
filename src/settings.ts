import { PluginSettingTab, Setting } from 'obsidian';
import type { App } from 'obsidian';
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

export class SciCalcSettingTab extends PluginSettingTab {
	plugin: SciCalcPlugin;

	constructor(app: App, plugin: SciCalcPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		const s = this.plugin.data.settings;
		const save = () => {
			this.plugin.requestSave();
			this.plugin.refreshViews();
		};

		new Setting(containerEl)
			.setName('Number format')
			.setDesc('Norm shows up to 10 digits. Fix rounds to a set number of decimal places. Sci always uses ×10ⁿ.')
			.addDropdown((d) =>
				d
					.addOptions({ norm: 'Norm', fix: 'Fix (decimal places)', sci: 'Sci (significant digits)' })
					.setValue(s.numberFormat)
					.onChange((v) => {
						s.numberFormat = v as NumberFormat;
						save();
						this.display();
					}),
			);

		if (s.numberFormat !== 'norm') {
			new Setting(containerEl)
				.setName(s.numberFormat === 'fix' ? 'Decimal places' : 'Significant digits')
				.addSlider((sl) =>
					sl
						.setLimits(s.numberFormat === 'fix' ? 0 : 1, s.numberFormat === 'fix' ? 9 : 10, 1)
						.setValue(s.digits)
						.setDynamicTooltip()
						.onChange((v) => {
							s.digits = v;
							save();
						}),
				);
		}

		new Setting(containerEl)
			.setName('Group digits')
			.setDesc('Add thin spaces between groups of three digits, like 1 234 567.')
			.addToggle((t) =>
				t.setValue(s.groupDigits).onChange((v) => {
					s.groupDigits = v;
					save();
				}),
			);

		new Setting(containerEl)
			.setName('Insert into note as')
			.setDesc('What the insert button puts at the cursor in your note.')
			.addDropdown((d) =>
				d
					.addOptions({ result: 'Result only (0.75)', equation: 'Calculation (3÷4 = 0.75)', latex: 'LaTeX ($\\frac{3}{4}$)' })
					.setValue(s.insertFormat)
					.onChange((v) => {
						s.insertFormat = v as SciCalcSettings['insertFormat'];
						save();
					}),
			);

		const support = new Setting(containerEl)
			.setName('Support development')
			.setDesc('If this calculator is useful to you, you can support it on Ko-fi.');
		kofiButton(support.controlEl, 'is-settings').addEventListener('click', openKofi);
	}
}

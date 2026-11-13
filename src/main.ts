import { MarkdownView, Notice, Platform, Plugin, debounce } from 'obsidian';
import type { WorkspaceLeaf } from 'obsidian';
import { defaultMemory, plainText } from './calculator.ts';
import type { CalcEvent, CalcMemory } from './calculator.ts';
import { formatDecimal } from './engine/format.ts';
import type { FormatOptions } from './engine/format.ts';
import { DEFAULT_SETTINGS, SciCalcSettingTab } from './settings.ts';
import type { SciCalcSettings } from './settings.ts';
import { SciCalcView, VIEW_TYPE } from './ui/view.ts';

interface PluginData {
	settings: SciCalcSettings;
	memory: CalcMemory;
}

export default class SciCalcPlugin extends Plugin {
	data!: PluginData;
	/** The note the user was last in, so the calculator can insert into it. */
	private lastMarkdown: MarkdownView | null = null;

	requestSave = debounce(() => void this.saveData(this.data), 500, true);

	async onload(): Promise<void> {
		const saved = ((await this.loadData()) ?? {}) as Partial<PluginData>;
		this.data = {
			settings: { ...DEFAULT_SETTINGS, ...saved.settings },
			memory: { ...defaultMemory(), ...saved.memory },
		};

		this.registerView(VIEW_TYPE, (leaf) => new SciCalcView(leaf, this));
		this.addSettingTab(new SciCalcSettingTab(this.app, this));
		this.addRibbonIcon('calculator', 'Open scientific calculator', () => void this.showCalculator());

		this.addCommand({
			id: 'open',
			name: 'Open scientific calculator',
			callback: () => void this.showCalculator(),
		});
		this.addCommand({
			id: 'insert-ans',
			name: 'Insert last answer (Ans) into note',
			editorCallback: (editor) => {
				editor.replaceSelection(plainText(formatDecimal(this.data.memory.ans, this.formatOptions()).text));
			},
		});
		if (Platform.isDesktopApp) {
			this.addCommand({
				id: 'toggle-floating',
				name: 'Toggle floating calculator window',
				callback: () => void this.toggleFloating(),
			});
		}

		this.registerEvent(
			this.app.workspace.on('active-leaf-change', (leaf) => {
				if (leaf?.view instanceof MarkdownView) this.lastMarkdown = leaf.view;
			}),
		);
		this.lastMarkdown = this.app.workspace.getActiveViewOfType(MarkdownView);
	}

	onunload(): void {
		void this.saveData(this.data);
	}

	formatOptions(): FormatOptions {
		const s = this.data.settings;
		return { format: s.numberFormat, digits: s.digits, separator: s.groupDigits ? ' ' : '' };
	}

	refreshViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
			if (leaf.view instanceof SciCalcView) leaf.view.refresh();
		}
	}

	async showCalculator(): Promise<void> {
		let leaf: WorkspaceLeaf | null = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0] ?? null;
		if (!leaf) {
			leaf = this.app.workspace.getRightLeaf(false);
			await leaf?.setViewState({ type: VIEW_TYPE, active: true });
		}
		if (leaf) await this.app.workspace.revealLeaf(leaf);
	}

	async toggleFloating(): Promise<void> {
		const ws = this.app.workspace;
		const existing = ws.getLeavesOfType(VIEW_TYPE)[0];
		const size = { size: { width: 340, height: 640 } };
		let leaf: WorkspaceLeaf;
		if (!existing) {
			leaf = ws.openPopoutLeaf(size);
			await leaf.setViewState({ type: VIEW_TYPE, active: true });
		} else if (existing.getContainer() === ws.rootSplit.getContainer()) {
			ws.moveLeafToPopout(existing, size);
			leaf = existing;
		} else {
			// Already floating: put it back in the sidebar.
			existing.detach();
			await this.showCalculator();
			return;
		}
		const win = leaf.getContainer().win as Window & { electronWindow?: { setAlwaysOnTop(on: boolean): void } };
		win.electronWindow?.setAlwaysOnTop(true);
		win.document.documentElement.addClass('scicalc-floating');
	}

	insertIntoNote(e: Extract<CalcEvent, { type: 'insertNote' }>): void {
		const view = this.lastMarkdown;
		const stillOpen = view && this.app.workspace.getLeavesOfType('markdown').some((l) => l.view === view);
		if (!view || !stillOpen) {
			new Notice('Open a note first, then insert again.');
			return;
		}
		let text: string;
		switch (this.data.settings.insertFormat) {
			case 'equation':
				text = `${plainText(e.expression)} = ${e.text}`;
				break;
			case 'latex':
				text = `$${e.expressionLatex} = ${e.latex}$`;
				break;
			default:
				text = e.text;
		}
		view.editor.replaceSelection(text);
		new Notice(`Inserted into ${view.file?.basename ?? 'note'}`, 1500);
	}
}

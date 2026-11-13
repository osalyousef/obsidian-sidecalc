import { ItemView, Notice, finishRenderMath, loadMathJax, renderMath, setIcon } from 'obsidian';
import type { WorkspaceLeaf } from 'obsidian';
import { Calculator } from '../calculator.ts';
import type { CalcEvent, KeyDef, ResultState } from '../calculator.ts';
import type { AngleMode } from '../engine/evaluate.ts';
import { formatDecimal } from '../engine/format.ts';
import { plot } from '../engine/graph.ts';
import type { Plot } from '../engine/graph.ts';
import { hintAt, tokenLabels, tokensToText, VAR_NAMES } from '../engine/tokens.ts';
import type SciCalcPlugin from '../main.ts';
import { FUNCTION_KEYS, NUMBER_KEYS } from './keys.ts';
import { kofiButton, openKofi } from './kofi.ts';
import { drawPlot } from './plot.ts';

export const VIEW_TYPE = 'sidecalc';

export class SciCalcView extends ItemView {
	plugin: SciCalcPlugin;
	calc: Calculator;
	rootEl!: HTMLElement;
	screenEl!: HTMLElement;
	statusEl!: HTMLElement;
	stageEl!: HTMLElement;
	tapeEl!: HTMLElement;
	canvasEl!: HTMLCanvasElement;
	private plots = new WeakMap<ResultState, Plot | null>();
	private shownResult: ResultState | null = null;
	private shownError: object | null = null;
	inputEl!: HTMLElement;
	outputEl!: HTMLElement;
	extraEl!: HTMLElement;
	angleButtons = new Map<AngleMode, HTMLElement>();
	displayButton!: HTMLElement;
	panelEl!: HTMLElement;
	panel: 'history' | 'vars' | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: SciCalcPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.calc = new Calculator(plugin.data.memory);
	}

	getViewType(): string {
		return VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Sidecalc';
	}

	getIcon(): string {
		return 'calculator';
	}

	async onOpen(): Promise<void> {
		await loadMathJax();
		this.calc.fmt = this.plugin.formatOptions();
		this.calc.onChange = () => this.render();
		this.calc.onPersist = () => {
			this.plugin.data.memory = this.calc.mem;
			this.plugin.requestSave();
		};
		this.calc.onEvent = (e) => this.handleEvent(e);

		this.contentEl.empty();
		const root = this.contentEl.createDiv({ cls: 'scicalc' });
		root.tabIndex = 0;
		this.rootEl = root;

		this.buildScreen(root);
		this.buildToolbar(root);
		this.buildKeys(root.createDiv({ cls: 'scicalc-keys scicalc-keys-fn' }), FUNCTION_KEYS);
		this.buildKeys(root.createDiv({ cls: 'scicalc-keys scicalc-keys-num' }), NUMBER_KEYS);
		this.panelEl = root.createDiv({ cls: 'scicalc-panel' });

		this.registerDomEvent(root, 'keydown', (evt) => {
			if (evt.metaKey || evt.ctrlKey || evt.altKey) return;
			if (evt.key === 'Escape' && this.panel) {
				this.closePanel();
			} else if (!this.calc.typeKey(evt.key)) return;
			evt.preventDefault();
			evt.stopPropagation();
		});
		this.registerDomEvent(root, 'paste', (evt) => {
			const text = evt.clipboardData?.getData('text/plain');
			if (!text) return;
			evt.preventDefault();
			this.calc.pasteText(text);
		});
		this.registerDomEvent(root, 'copy', (evt) => {
			if (activeDocument.getSelection()?.toString()) return;
			evt.preventDefault();
			this.calc.run({ a: 'copy' });
		});
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', (leaf) => {
				if (leaf === this.leaf) this.rootEl.focus({ preventScroll: true });
			}),
		);
		// The screen grows when a graph appears, so redraw whenever the canvas changes size.
		const ro = new ResizeObserver(() => this.redrawPlot());
		ro.observe(this.canvasEl);
		this.register(() => ro.disconnect());
		this.render();
	}

	onResize(): void {
		this.fitOutput();
		this.redrawPlot();
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	/** Called by the plugin after settings change. */
	refresh(): void {
		this.calc.fmt = this.plugin.formatOptions();
		this.render();
	}

	// ---- Building ----

	private buildScreen(root: HTMLElement): void {
		const screen = root.createDiv({ cls: 'scicalc-screen' });
		this.screenEl = screen;
		this.statusEl = screen.createDiv({ cls: 'scicalc-status' });
		// Free space above the input: recent calculations, or a graph of the last one.
		this.stageEl = screen.createDiv({ cls: 'scicalc-stage' });
		this.tapeEl = this.stageEl.createDiv({ cls: 'scicalc-tape' });
		this.canvasEl = this.stageEl.createEl('canvas', { cls: 'scicalc-plot' });
		this.inputEl = screen.createDiv({ cls: 'scicalc-input' });
		this.outputEl = screen.createDiv({ cls: 'scicalc-output' });
		this.extraEl = screen.createDiv({ cls: 'scicalc-extra' });
	}

	private buildToolbar(root: HTMLElement): void {
		const bar = root.createDiv({ cls: 'scicalc-toolbar' });
		const seg = bar.createDiv({ cls: 'scicalc-segment' });
		for (const [mode, label] of [['deg', 'DEG'], ['rad', 'RAD'], ['gra', 'GRA']] as [AngleMode, string][]) {
			const b = seg.createEl('button', { text: label, attr: { 'aria-label': `Angle unit: ${label}` } });
			this.onTap(b, () => this.calc.setAngle(mode));
			this.angleButtons.set(mode, b);
		}
		this.displayButton = bar.createEl('button', { cls: 'scicalc-chip' });
		this.onTap(this.displayButton, () =>
			this.calc.setDisplay(this.calc.mem.display === 'math' ? 'line' : 'math'),
		);
		this.onTap(kofiButton(bar, 'scicalc-chip-plain'), openKofi);
		bar.createDiv({ cls: 'scicalc-spacer' });
		const icon = (name: string, label: string, fn: () => void) => {
			const b = bar.createEl('button', { cls: 'scicalc-icon clickable-icon', attr: { 'aria-label': label } });
			setIcon(b, name);
			this.onTap(b, fn);
		};
		icon('history', 'History', () => this.togglePanel('history'));
		icon('variable', 'Variables', () => this.togglePanel('vars'));
		icon('copy', 'Copy result', () => this.calc.run({ a: 'copy' }));
		icon('text-cursor-input', 'Insert into note', () => this.calc.run({ a: 'insertNote' }));
	}

	private buildKeys(grid: HTMLElement, keys: KeyDef[]): void {
		for (const key of keys) {
			const cell = grid.createDiv({ cls: 'scicalc-cell' });
			const sub = cell.createDiv({ cls: 'scicalc-sub' });
			sub.createSpan({ cls: 'scicalc-sub-shift', text: key.shiftLabel ?? '' });
			sub.createSpan({ cls: 'scicalc-sub-alpha', text: key.alphaLabel ?? '' });
			const btn = cell.createEl('button', {
				cls: `scicalc-key ${(key.cls ?? 'fn').split(' ').map((c) => `is-${c}`).join(' ')}`,
				attr: { 'data-key': key.id },
			});
			// One face per layer; CSS shows the one SHIFT or ALPHA would use.
			btn.createSpan({ cls: 'scicalc-face is-main', text: key.label });
			if (key.shift) {
				btn.addClass('has-shift');
				btn.createSpan({ cls: 'scicalc-face is-shift', text: key.shiftLabel ?? key.label });
			}
			if (key.alpha) {
				btn.addClass('has-alpha');
				btn.createSpan({ cls: 'scicalc-face is-alpha', text: key.alphaLabel ?? key.label });
			}
			this.onTap(btn, () => this.calc.pressKey(key));
		}
	}

	/** Buttons act on click but never take focus, so typing keeps working. */
	private onTap(el: HTMLElement, fn: () => void): void {
		el.tabIndex = -1;
		this.registerDomEvent(el, 'pointerdown', (evt) => {
			evt.preventDefault();
			this.rootEl.focus({ preventScroll: true });
		});
		this.registerDomEvent(el, 'click', () => fn());
	}

	// ---- Rendering ----

	render(): void {
		const c = this.calc;
		this.rootEl.toggleClass('is-shift', c.shift);
		this.rootEl.toggleClass('is-alpha', c.alpha || c.pendingSto);
		for (const [mode, b] of this.angleButtons) b.toggleClass('is-active', c.mem.angle === mode);
		this.displayButton.setText(c.mem.display === 'math' ? 'MATH' : 'LINE');
		this.displayButton.setAttr(
			'aria-label',
			c.mem.display === 'math' ? 'Showing fractions and roots; switch to decimals' : 'Showing decimals; switch to fractions and roots',
		);

		this.statusEl.empty();
		const flag = (text: string, cls: string, on: boolean) => {
			if (on) this.statusEl.createSpan({ cls: `scicalc-flag ${cls}`, text });
		};
		flag('S', 'is-shift', c.shift);
		flag('A', 'is-alpha', c.alpha);
		flag('hyp', '', c.hyp);
		flag('STO', 'is-alpha', c.pendingSto);
		flag('M', '', c.mem.vars.M !== 0);
		if (c.prompt) flag(c.prompt.kind === 'calc' ? 'CALC' : 'SOLVE', 'is-mode', true);
		const hint = c.phase === 'edit' || c.phase === 'prompt' ? hintAt(c.tokens, c.cursor) : null;
		if (hint) this.statusEl.createSpan({ cls: 'scicalc-hint-line', text: hint + '  ·  SHIFT ) types ,' });
		this.statusEl.createSpan({ cls: 'scicalc-flag is-angle', text: c.mem.angle.toUpperCase()[0] ?? '' });

		this.renderStage();
		this.renderInput();
		this.renderOutput();
		if (this.panel) this.renderPanel();
		finishRenderMath();
		this.fitOutput();
	}

	private renderInput(): void {
		const c = this.calc;
		const el = this.inputEl;
		el.empty();
		el.toggleClass('is-math', false);
		if (c.phase === 'result' && c.mem.display === 'math') {
			const tex = c.inputLatex();
			if (tex) {
				el.toggleClass('is-math', true);
				el.appendChild(renderMath(tex, false));
				return;
			}
		}
		if (c.prompt) {
			el.createDiv({ cls: 'scicalc-context', text: tokensToText(c.prompt.expr) });
			el.createSpan({ cls: 'scicalc-prompt-label', text: c.promptLabel() ?? '' });
		}
		const labels = tokenLabels(c.tokens);
		const cursorAt = c.phase === 'edit' || c.phase === 'prompt' ? c.cursor : c.phase === 'error' ? Math.min(c.error?.pos ?? 0, labels.length) : -1;
		labels.forEach((label, i) => {
			if (i === cursorAt) el.createSpan({ cls: c.phase === 'error' ? 'scicalc-cursor is-error' : 'scicalc-cursor' });
			el.createSpan({ cls: 'scicalc-tok', text: label });
		});
		if (cursorAt === labels.length) {
			el.createSpan({ cls: c.phase === 'error' ? 'scicalc-cursor is-error' : 'scicalc-cursor' });
		}
	}

	private renderOutput(): void {
		const c = this.calc;
		const el = this.outputEl;
		el.empty();
		el.removeClass('is-error');
		this.extraEl.setText('');
		if (c.phase === 'error' && c.error) {
			el.addClass('is-error');
			el.toggleClass('is-fresh', this.shownError !== c.error);
			this.shownError = c.error;
			el.createSpan({ cls: 'scicalc-out', text: c.error.message });
			return;
		}
		if (c.prompt) {
			if (c.prompt.error) {
				el.addClass('is-error');
				el.createSpan({ cls: 'scicalc-out', text: c.prompt.error });
				return;
			}
			// Show the variable's current value; = with no input keeps it.
			el.createSpan({ cls: 'scicalc-note', text: 'now' });
			el.createSpan({ cls: 'scicalc-out is-muted', text: formatDecimal(c.promptCurrent() ?? 0, c.fmt).text });
			return;
		}
		if (c.phase === 'edit') {
			// Answer so far, before = is pressed.
			const v = c.livePreview();
			if (v !== null) el.createSpan({ cls: 'scicalc-out is-preview', text: formatDecimal(v, c.fmt).text });
			return;
		}
		if (c.phase !== 'result' || !c.result) return;
		const r = c.result;
		el.toggleClass('is-fresh', this.shownResult !== r);
		this.shownResult = r;
		if (r.note) el.createSpan({ cls: 'scicalc-note', text: r.note });
		const value = c.renderValue(r);
		const out = el.createSpan({ cls: 'scicalc-out' });
		if (c.mem.display === 'math') out.appendChild(renderMath(value.latex, false));
		else out.setText(value.text);
		this.extraEl.setText(r.extra ?? '');
	}

	/** Graph of the last result when it has one, otherwise the recent-history tape. */
	private renderStage(): void {
		const c = this.calc;
		const r = c.phase === 'result' ? c.result : null;
		let p: Plot | null = null;
		if (r?.graph) {
			if (!this.plots.has(r)) this.plots.set(r, plot(r.graph));
			p = this.plots.get(r) ?? null;
		}
		this.screenEl.toggleClass('has-graph', p !== null);
		this.tapeEl.empty();
		if (p) {
			this.redrawPlot();
			return;
		}
		const h = c.mem.history;
		// In result phase the newest entry is already on screen.
		const newest = h.length - 1 - (c.phase === 'result' ? 1 : 0);
		for (let i = newest; i >= Math.max(0, newest - 7); i--) {
			const entry = h[i]!;
			const row = this.tapeEl.createDiv({ cls: 'scicalc-tape-row', attr: { 'aria-label': 'Use again' } });
			row.createSpan({ cls: 'scicalc-tape-expr', text: tokensToText(entry.tokens) });
			row.createSpan({ cls: 'scicalc-tape-value', text: formatDecimal(entry.value, c.fmt).text });
			this.onTap(row, () => this.calc.loadHistory(i));
		}
	}

	private redrawPlot(): void {
		const r = this.calc.phase === 'result' ? this.calc.result : null;
		const p = r ? this.plots.get(r) : null;
		if (p) drawPlot(this.canvasEl, p);
	}

	/** Shrink the result to fit when it is wider than the screen. */
	private fitOutput(): void {
		const out = this.outputEl.querySelector<HTMLElement>('.scicalc-out');
		if (!out) return;
		out.style.removeProperty('transform');
		const avail = this.outputEl.clientWidth - 4;
		const width = out.scrollWidth;
		if (avail > 0 && width > avail) out.style.transform = `scale(${avail / width})`;
	}

	// ---- Panels ----

	private togglePanel(panel: 'history' | 'vars'): void {
		this.panel = this.panel === panel ? null : panel;
		this.renderPanel();
	}

	private closePanel(): void {
		this.panel = null;
		this.renderPanel();
	}

	private renderPanel(): void {
		const el = this.panelEl;
		el.empty();
		el.toggleClass('is-open', this.panel !== null);
		if (!this.panel) return;
		const head = el.createDiv({ cls: 'scicalc-panel-head' });
		head.createSpan({ text: this.panel === 'history' ? 'History' : 'Variables' });
		head.createDiv({ cls: 'scicalc-spacer' });
		if (this.panel === 'history' && this.calc.mem.history.length) {
			const clear = head.createEl('button', { text: 'Clear', cls: 'scicalc-panel-btn' });
			this.onTap(clear, () => this.calc.clearHistory());
		}
		const close = head.createEl('button', { cls: 'scicalc-icon clickable-icon', attr: { 'aria-label': 'Close' } });
		setIcon(close, 'x');
		this.onTap(close, () => this.closePanel());

		const list = el.createDiv({ cls: 'scicalc-panel-list' });
		const fmt = this.calc.fmt;
		if (this.panel === 'history') {
			const h = this.calc.mem.history;
			if (!h.length) list.createDiv({ cls: 'scicalc-empty', text: 'No calculations yet' });
			for (let i = h.length - 1; i >= 0; i--) {
				const entry = h[i]!;
				const row = list.createDiv({ cls: 'scicalc-row' });
				row.createDiv({ cls: 'scicalc-row-expr', text: tokensToText(entry.tokens) });
				row.createDiv({ cls: 'scicalc-row-value', text: '= ' + formatDecimal(entry.value, fmt).text });
				this.onTap(row, () => {
					this.calc.loadHistory(i);
					this.closePanel();
				});
			}
		} else {
			const rows: [string, number, () => void][] = [
				['Ans', this.calc.mem.ans, () => this.calc.run({ a: 'insert', tok: { k: 'ans' } })],
				['PreAns', this.calc.mem.preAns, () => this.calc.run({ a: 'insert', tok: { k: 'preans' } })],
				...VAR_NAMES.map((v): [string, number, () => void] => [v, this.calc.mem.vars[v], () => this.calc.run({ a: 'var', v })]),
			];
			list.createDiv({ cls: 'scicalc-hint', text: 'Select one to insert it. Store a result with SHIFT RCL (STO), then a letter key.' });
			for (const [name, value, insert] of rows) {
				const row = list.createDiv({ cls: 'scicalc-row is-var' });
				row.createDiv({ cls: 'scicalc-row-expr', text: name });
				row.createDiv({ cls: 'scicalc-row-value', text: formatDecimal(value, fmt).text });
				this.onTap(row, () => {
					insert();
					this.closePanel();
				});
			}
		}
	}

	// ---- Events from the calculator ----

	private handleEvent(e: CalcEvent): void {
		switch (e.type) {
			case 'panel':
				this.togglePanel(e.panel);
				break;
			case 'copy':
				void navigator.clipboard.writeText(e.text).then(() => new Notice(`Copied ${e.text}`, 1500));
				break;
			case 'insertNote':
				this.plugin.insertIntoNote(e);
				break;
			case 'notice':
				new Notice(e.message, 2000);
				break;
		}
	}
}

// Minimal stand-in for the parts of the Obsidian API the view uses, so the real
// view code can run in a plain browser page. Development only; never shipped.

declare global {
	interface HTMLElement {
		createDiv(o?: DomInfo): HTMLDivElement;
		createSpan(o?: DomInfo): HTMLSpanElement;
		createEl<K extends keyof HTMLElementTagNameMap>(tag: K, o?: DomInfo): HTMLElementTagNameMap[K];
		empty(): void;
		setText(t: string): void;
		addClass(c: string): void;
		removeClass(c: string): void;
		toggleClass(c: string, on: boolean): void;
		setAttr(k: string, v: string): void;
	}
	interface Window { MathJax: any }
	var activeDocument: Document;
}
interface DomInfo { cls?: string; text?: string; attr?: Record<string, string> }

const P = HTMLElement.prototype;
P.createEl = function (tag: string, o: DomInfo = {}) {
	const el = document.createElement(tag);
	if (o.cls) el.className = o.cls;
	if (o.text !== undefined) el.textContent = o.text;
	for (const [k, v] of Object.entries(o.attr ?? {})) el.setAttribute(k, v);
	this.appendChild(el);
	return el;
} as any;
P.createDiv = function (o) { return this.createEl('div', o); };
P.createSpan = function (o) { return this.createEl('span', o); };
P.empty = function () { this.replaceChildren(); };
P.setText = function (t) { this.textContent = t; };
P.addClass = function (c) { this.classList.add(c); };
P.removeClass = function (c) { this.classList.remove(c); };
P.toggleClass = function (c, on) { this.classList.toggle(c, on); };
P.setAttr = function (k, v) { this.setAttribute(k, v); };
globalThis.activeDocument = document;

type Handler = (...args: unknown[]) => void;
const workspaceHandlers: Record<string, Handler[]> = {};
export const app = {
	workspace: {
		on(name: string, fn: Handler) { (workspaceHandlers[name] ??= []).push(fn); return { name, fn }; },
	},
};

export class ItemView {
	app = app;
	leaf: unknown;
	containerEl: HTMLElement;
	contentEl: HTMLElement;
	constructor(leaf: unknown) {
		this.leaf = leaf;
		this.containerEl = document.createElement('div');
		this.containerEl.className = 'workspace-leaf-content';
		this.containerEl.dataset.type = 'sidecalc';
		this.contentEl = this.containerEl.createDiv({ cls: 'view-content' });
	}
	registerDomEvent(el: EventTarget, type: string, fn: EventListener) { el.addEventListener(type, fn); }
	registerEvent(_: unknown) {}
	register(_: () => void) {}
	onResize() {}
}

export class Notice {
	constructor(message: string, ms = 3000) {
		const n = document.body.createDiv({ cls: 'preview-notice', text: message });
		setTimeout(() => n.remove(), ms);
	}
}

const ICONS: Record<string, string> = {
	history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
	variable: '<path d="M8 21s-4-3-4-9 4-9 4-9"/><path d="M16 3s4 3 4 9-4 9-4 9"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
	copy: '<rect x="8" y="8" width="14" height="14" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
	'text-cursor-input': '<path d="M5 4h1a3 3 0 0 1 3 3 3 3 0 0 1 3-3h1"/><path d="M13 20h-1a3 3 0 0 1-3-3 3 3 0 0 1-3 3H5"/><path d="M5 16H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h1"/><path d="M13 8h7a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-7"/><path d="M9 7v10"/>',
	x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
	calculator: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8"/>',
};
export function setIcon(el: HTMLElement, name: string): void {
	el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon">${ICONS[name] ?? ICONS.x}</svg>`;
}

export async function loadMathJax(): Promise<void> {
	while (!window.MathJax?.tex2chtml) await new Promise((r) => setTimeout(r, 30));
}
export function renderMath(tex: string, display: boolean): HTMLElement {
	return window.MathJax.tex2chtml(tex, { display });
}
export function finishRenderMath(): void {
	const doc = window.MathJax.startup.document;
	doc.clear();
	doc.updateDocument();
}
export function debounce<T extends (...a: any[]) => void>(fn: T, ms: number): T {
	let t: ReturnType<typeof setTimeout> | undefined;
	return ((...a: any[]) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }) as T;
}
export type WorkspaceLeaf = unknown;

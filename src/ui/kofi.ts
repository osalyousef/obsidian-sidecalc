// "Support me on Ko-fi" as an ordinary button, so it takes on the theme like the
// other toolbar chips. The cup follows the text colour; only the heart keeps Ko-fi orange.

export const KOFI_URL = 'https://ko-fi.com/osalyousef';

const SVG = 'http://www.w3.org/2000/svg';

export function kofiButton(parent: HTMLElement, cls: string): HTMLButtonElement {
	const btn = parent.createEl('button', {
		cls: `scicalc-kofi ${cls}`,
		attr: { 'aria-label': 'Support me on Ko-fi' },
	});
	cup(btn);
	btn.createSpan({ cls: 'scicalc-kofi-label is-long', text: 'Support me on Ko-fi' });
	btn.createSpan({ cls: 'scicalc-kofi-label is-short', text: 'Ko-fi' });
	return btn;
}

/** Opens in the system browser (Obsidian routes window.open for web links there). */
export function openKofi(): void {
	window.open(KOFI_URL);
}

function cup(parent: HTMLElement): void {
	const svg = document.createElementNS(SVG, 'svg');
	svg.setAttribute('viewBox', '0 0 24 24');
	svg.setAttribute('aria-hidden', 'true');
	svg.classList.add('scicalc-kofi-cup');
	const path = (d: string, cls: string) => {
		const p = document.createElementNS(SVG, 'path');
		p.setAttribute('d', d);
		p.classList.add(cls);
		svg.appendChild(p);
	};
	path('M4.5 6.5h12a1 1 0 0 1 1 1v5.5a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6V7.5a1 1 0 0 1 1-1z', 'is-body');
	path('M17.5 8.5h1a3 3 0 0 1 0 6h-1', 'is-handle');
	path('M10.5 15.6 7.6 12.8a1.8 1.8 0 0 1 2.9-2.2 1.8 1.8 0 0 1 2.9 2.2z', 'is-heart');
	parent.appendChild(svg);
}

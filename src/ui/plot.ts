// Draws a Plot on a canvas using the theme's colours.

import type { Plot } from '../engine/graph.ts';

const PAD = 6;

export function drawPlot(canvas: HTMLCanvasElement, p: Plot): void {
	const w = canvas.clientWidth;
	const h = canvas.clientHeight;
	if (w < 40 || h < 30) return;
	const dpr = window.devicePixelRatio || 1;
	canvas.width = Math.round(w * dpr);
	canvas.height = Math.round(h * dpr);
	const g = canvas.getContext('2d');
	if (!g) return;
	g.setTransform(dpr, 0, 0, dpr, 0, 0);
	g.clearRect(0, 0, w, h);

	const css = getComputedStyle(canvas);
	const color = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
	const curve = color('--text-accent', '#a78bfa');
	const fill = color('--interactive-accent', '#8b5cf6');
	const mark = color('--color-orange', '#e9973f');
	const axis = color('--text-faint', '#666');
	const text = color('--text-muted', '#999');
	const font = color('--font-interface', 'sans-serif');

	const [x0, x1] = p.x;
	const [y0, y1] = p.y;
	const bottom = h - PAD - 12; // room for labels under the plot
	const sx = (x: number) => PAD + ((x - x0) / (x1 - x0)) * (w - 2 * PAD);
	const sy = (y: number) => PAD + ((y1 - y) / (y1 - y0)) * (bottom - PAD);
	const clampY = (y: number) => Math.max(-h, Math.min(2 * h, sy(y)));

	// Axes
	g.lineWidth = 1;
	g.strokeStyle = axis;
	g.globalAlpha = 0.7;
	if (y0 <= 0 && y1 >= 0) line(g, PAD, sy(0), w - PAD, sy(0));
	if (x0 <= 0 && x1 >= 0) line(g, sx(0), PAD, sx(0), bottom);
	g.globalAlpha = 1;

	const spec = p.spec;
	const labels: [number, string, string][] = []; // x position, text, colour

	if (spec.kind === 'area') {
		const lo = Math.min(spec.a, spec.b), hi = Math.max(spec.a, spec.b);
		const inside = p.points.filter(([x, y]) => x >= lo && x <= hi && Number.isFinite(y));
		const edge = (x: number): [number, number] => [x, spec.f(x)];
		const region = [edge(lo), ...inside, edge(hi)].filter(([, y]) => Number.isFinite(y));
		g.beginPath();
		g.moveTo(sx(lo), sy(0));
		for (const [x, y] of region) g.lineTo(sx(x), clampY(y));
		g.lineTo(sx(hi), sy(0));
		g.closePath();
		g.fillStyle = fill;
		g.globalAlpha = 0.3;
		g.fill();
		g.globalAlpha = 1;
		labels.push([sx(spec.a), num(spec.a), text], [sx(spec.b), num(spec.b), text]);
	}

	// The curve itself (faint for Σ/∏, where only whole-number X count)
	g.strokeStyle = curve;
	g.lineWidth = 2;
	g.lineJoin = 'round';
	g.globalAlpha = spec.kind === 'terms' ? 0.35 : 1;
	g.beginPath();
	let pen = false;
	for (const [x, y] of p.points) {
		if (!Number.isFinite(y)) {
			pen = false;
			continue;
		}
		if (pen) g.lineTo(sx(x), clampY(y));
		else g.moveTo(sx(x), clampY(y));
		pen = true;
	}
	g.stroke();
	g.globalAlpha = 1;

	if (spec.kind === 'terms') {
		g.strokeStyle = fill;
		g.fillStyle = fill;
		g.lineWidth = 2;
		const n = Math.round(spec.b) - Math.round(spec.a) + 1;
		const r = n > 40 ? 1.5 : 3;
		for (let k = Math.round(spec.a); k <= Math.round(spec.b); k++) {
			const y = spec.f(k);
			if (!Number.isFinite(y)) continue;
			line(g, sx(k), sy(0), sx(k), clampY(y));
			dot(g, sx(k), clampY(y), r);
		}
		labels.push([sx(spec.a), num(spec.a), text], [sx(spec.b), num(spec.b), text]);
	}

	if (spec.kind === 'tangent') {
		g.strokeStyle = mark;
		g.lineWidth = 1.5;
		g.setLineDash([4, 3]);
		line(g, sx(x0), clampY(spec.y0 + spec.slope * (x0 - spec.x0)), sx(x1), clampY(spec.y0 + spec.slope * (x1 - spec.x0)));
		g.setLineDash([]);
		g.fillStyle = mark;
		dot(g, sx(spec.x0), sy(spec.y0), 3.5);
		labels.push([sx(spec.x0), `X = ${num(spec.x0)}`, mark]);
	}

	if (spec.kind === 'root') {
		g.fillStyle = mark;
		dot(g, sx(spec.root), sy(0), 4);
		g.strokeStyle = mark;
		g.globalAlpha = 0.35;
		g.lineWidth = 4;
		g.beginPath();
		g.arc(sx(spec.root), sy(0), 7, 0, Math.PI * 2);
		g.stroke();
		g.globalAlpha = 1;
		labels.push([sx(spec.root), `${spec.label} = ${num(spec.root)}`, mark]);
	}

	g.font = `10px ${font}`;
	g.textBaseline = 'bottom';
	for (const [x, label, c] of labels) {
		const tw = g.measureText(label).width;
		g.fillStyle = c;
		g.fillText(label, Math.max(2, Math.min(w - tw - 2, x - tw / 2)), h - 1);
	}
}

function line(g: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number): void {
	g.beginPath();
	g.moveTo(ax, ay);
	g.lineTo(bx, by);
	g.stroke();
}

function dot(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
	g.beginPath();
	g.arc(x, y, r, 0, Math.PI * 2);
	g.fill();
}

/** Short label for an axis value: 4 significant digits, a proper minus sign. */
function num(v: number): string {
	const s = String(Number(v.toPrecision(4)));
	return s.replace('-', '−');
}

// What to draw after a calculation that is really about a function of X:
// ∫ shades the area, d/dx draws the tangent, SOLVE marks the root, Σ/∏ shows the terms.
// Pure data, no DOM, so it can be tested.

import { evaluate, functionOf } from './evaluate.ts';
import type { EvalContext } from './evaluate.ts';
import type { Node } from './parser.ts';
import type { VarName } from './tokens.ts';

export type GraphSpec =
	| { kind: 'area'; f: (x: number) => number; a: number; b: number }
	| { kind: 'tangent'; f: (x: number) => number; x0: number; y0: number; slope: number }
	| { kind: 'root'; f: (x: number) => number; root: number; label: VarName }
	| { kind: 'terms'; f: (x: number) => number; a: number; b: number };

export interface Plot {
	spec: GraphSpec;
	x: [number, number];
	y: [number, number];
	/** Curve samples; NaN marks a gap (undefined value or a jump). */
	points: [number, number][];
}

const MAX_TERMS = 120;

/** Graph for a finished calculation, or null when there is nothing worth plotting. */
export function graphFor(node: Node, ctx: EvalContext, solved?: { name: VarName; root: number }): GraphSpec | null {
	try {
		if (solved) {
			const [l, r] = node.t === 'eq' ? [node.l, node.r] : [node, null];
			const fl = functionOf(l, solved.name, ctx);
			const fr = r ? functionOf(r, solved.name, ctx) : () => 0;
			return { kind: 'root', f: (x) => fl(x) - fr(x), root: solved.root, label: solved.name };
		}
		if (node.t !== 'call') return null;
		const f = functionOf(node.args[0]!, 'X', ctx);
		const arg = (i: number) => evaluate(node.args[i]!, ctx);
		switch (node.fn) {
			case 'integ': {
				const a = arg(1), b = arg(2);
				return a === b ? null : { kind: 'area', f, a, b };
			}
			case 'ddx': {
				const x0 = arg(1);
				const slope = evaluate(node, ctx);
				return { kind: 'tangent', f, x0, y0: f(x0), slope };
			}
			case 'sum':
			case 'prod': {
				const a = arg(1), b = arg(2);
				return b - a <= MAX_TERMS ? { kind: 'terms', f, a, b } : null;
			}
		}
	} catch {
		return null;
	}
	return null;
}

/** Choose the window and sample the curve. */
export function plot(spec: GraphSpec, samples = 240): Plot | null {
	const x = xWindow(spec);
	const pts: [number, number][] = [];
	const ys: number[] = [];
	for (let i = 0; i <= samples; i++) {
		const xi = x[0] + ((x[1] - x[0]) * i) / samples;
		const yi = spec.f(xi);
		pts.push([xi, yi]);
		if (Number.isFinite(yi)) ys.push(yi);
	}
	if (spec.kind === 'terms') {
		for (let k = Math.round(spec.a); k <= Math.round(spec.b); k++) {
			const yk = spec.f(k);
			if (Number.isFinite(yk)) ys.push(yk);
		}
	}
	if (ys.length < 2) return null;
	const y = yWindow(spec, ys);
	// Break the line across jumps, e.g. tan(x) at its asymptotes.
	const span = y[1] - y[0];
	for (let i = 1; i < pts.length; i++) {
		const [, a] = pts[i - 1]!, [, b] = pts[i]!;
		if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(b - a) > span * 3) pts[i - 1]![1] = NaN;
	}
	return { spec, x, y, points: pts };
}

function xWindow(spec: GraphSpec): [number, number] {
	switch (spec.kind) {
		case 'area': {
			const lo = Math.min(spec.a, spec.b), hi = Math.max(spec.a, spec.b);
			const pad = (hi - lo) * 0.18;
			return [lo - pad, hi + pad];
		}
		case 'terms':
			return [spec.a - 0.6, spec.b + 0.6];
		case 'tangent': {
			const r = Math.max(2, Math.abs(spec.x0) * 0.6);
			return [spec.x0 - r, spec.x0 + r];
		}
		case 'root': {
			const r = Math.max(2, Math.abs(spec.root) * 0.6);
			// Near the origin, keep X = 0 in view too: other roots (like −√2 beside √2)
			// often sit on the other side, and seeing them suggests the next guess.
			if (Math.abs(spec.root) < 10) return [Math.min(spec.root, 0) - r, Math.max(spec.root, 0) + r];
			return [spec.root - r, spec.root + r];
		}
	}
}

function yWindow(spec: GraphSpec, ys: number[]): [number, number] {
	const sorted = [...ys].sort((a, b) => a - b);
	const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))]!;
	// Ignore the extreme 3% so a pole does not flatten everything else.
	let lo = q(0.03), hi = q(0.97);
	if (spec.kind === 'tangent') {
		lo = Math.min(lo, spec.y0);
		hi = Math.max(hi, spec.y0);
	} else {
		lo = Math.min(lo, 0); // area, terms and roots are read against y = 0
		hi = Math.max(hi, 0);
	}
	if (hi - lo < 1e-12) {
		lo -= 1;
		hi += 1;
	}
	const pad = (hi - lo) * 0.12;
	return [lo - pad, hi + pad];
}

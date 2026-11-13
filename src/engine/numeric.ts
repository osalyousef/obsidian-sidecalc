// Numerical methods for d/dx, ∫dx and SOLVE.

import { CalcMathError } from './errors.ts';

type Fn = (x: number) => number;

/** Derivative by Ridders' method (Richardson-extrapolated central differences). */
export function derivative(f: Fn, x: number): number {
	const CON = 1.4;
	const CON2 = CON * CON;
	const NTAB = 10;
	const SAFE = 2;
	let h = 0.05 * Math.max(1, Math.abs(x));
	const a: number[][] = Array.from({ length: NTAB }, () => new Array<number>(NTAB).fill(0));
	const central = (step: number) => (f(x + step) - f(x - step)) / (2 * step);
	a[0]![0] = central(h);
	let err = Infinity;
	let ans = a[0]![0]!;
	for (let i = 1; i < NTAB; i++) {
		h /= CON;
		a[0]![i] = central(h);
		let fac = CON2;
		for (let j = 1; j <= i; j++) {
			a[j]![i] = (a[j - 1]![i]! * fac - a[j - 1]![i - 1]!) / (fac - 1);
			fac *= CON2;
			const errt = Math.max(Math.abs(a[j]![i]! - a[j - 1]![i]!), Math.abs(a[j]![i]! - a[j - 1]![i - 1]!));
			if (errt <= err) {
				err = errt;
				ans = a[j]![i]!;
			}
		}
		if (Math.abs(a[i]![i]! - a[i - 1]![i - 1]!) >= SAFE * err) break;
	}
	if (!Number.isFinite(ans)) throw new CalcMathError();
	return ans;
}

// Gauss–Kronrod 7/15-point nodes and weights on [-1, 1].
const XGK = [
	0.991455371120812639206854697526329, 0.949107912342758524526189684047851,
	0.864864423359769072789712788640926, 0.741531185599394439863864773280788,
	0.586087235467691130294144845693013, 0.405845151377397166906606412076961,
	0.207784955007898467600689403773245, 0,
];
const WGK = [
	0.02293532201052922496373200805897, 0.063092092629978553290700663189204,
	0.104790010322250183839876322541518, 0.140653259715525918745189590510238,
	0.16900472663926790282658342659855, 0.190350578064785409913256402421014,
	0.204432940075298892414161999234649, 0.209482141084727828012999174891714,
];
const WG = [
	0.129484966168869693270611432679082, 0.27970539148927666790146777142378,
	0.381830050505118944950369775488975, 0.417959183673469387755102040816327,
];

function gk15(f: Fn, a: number, b: number): [number, number] {
	const c = (a + b) / 2;
	const h = (b - a) / 2;
	const fc = f(c);
	let k = fc * WGK[7]!;
	let g = fc * WG[3]!;
	for (let j = 0; j < 7; j++) {
		const dx = h * XGK[j]!;
		const s = f(c - dx) + f(c + dx);
		k += WGK[j]! * s;
		if (j % 2 === 1) g += WG[(j - 1) / 2]! * s;
	}
	return [k * h, Math.abs((k - g) * h)];
}

/** Adaptive Gauss–Kronrod integration of f over [a, b]. */
export function integrate(f: Fn, a: number, b: number): number {
	if (a === b) return 0;
	let evals = 0;
	const MAX_EVALS = 300_000;
	const counted: Fn = (x) => {
		evals++;
		const y = f(x);
		if (!Number.isFinite(y)) throw new CalcMathError();
		return y;
	};
	const [whole, wholeErr] = gk15(counted, a, b);
	const tol = Math.max(1e-13, 1e-12 * Math.abs(whole));
	let converged = true;
	const rec = (lo: number, hi: number, est: number, err: number, t: number, depth: number): number => {
		if (err <= t) return est;
		if (depth >= 40 || evals > MAX_EVALS) {
			converged = false;
			return est;
		}
		const mid = (lo + hi) / 2;
		const [l, le] = gk15(counted, lo, mid);
		const [r, re] = gk15(counted, mid, hi);
		return rec(lo, mid, l, le, t / 2, depth + 1) + rec(mid, hi, r, re, t / 2, depth + 1);
	};
	const out = rec(a, b, whole, wholeErr, tol, 0);
	if (!Number.isFinite(out)) throw new CalcMathError();
	if (converged) return out;
	// Usually an end-point singularity such as 1/√x at 0, which tanh-sinh handles well.
	return tanhSinh(f, a, b) ?? out;
}

/**
 * Tanh-sinh (double-exponential) quadrature. Its points crowd towards both ends,
 * so integrable singularities there cost little. Returns null if it does not settle.
 */
export function tanhSinh(f: Fn, a: number, b: number): number | null {
	const c = (a + b) / 2;
	const h = (b - a) / 2;
	// Far enough out that points reach the end itself (or underflow) for any interval.
	const T_MAX = 6.5;
	const at = (t: number): number => {
		const u = (Math.PI / 2) * Math.sinh(t);
		const e = Math.exp(-2 * Math.abs(u));
		const gap = (2 * e) / (1 + e); // 1 − tanh|u|, without cancellation
		const w = ((Math.PI / 2) * Math.cosh(t) * 4 * e) / ((1 + e) * (1 + e));
		const d = h * gap; // distance from the nearer end
		if (w === 0 || d === 0) return 0;
		const x = t < 0 ? a + d : t > 0 ? b - d : c;
		if (x === a || x === b) return 0;
		return w * f(x);
	};
	let step = 1;
	let sum = at(0);
	for (let t = step; t <= T_MAX; t += step) sum += at(t) + at(-t);
	let prev = sum * step * h;
	for (let level = 1; level <= 10; level++) {
		step /= 2;
		for (let t = step; t <= T_MAX; t += 2 * step) sum += at(t) + at(-t);
		const est = sum * step * h;
		if (!Number.isFinite(est)) return null;
		if (Math.abs(est - prev) <= 1e-13 * Math.max(1, Math.abs(est))) return est;
		if (level === 10) {
			// Rounding of x right next to an end can stop the last digits settling;
			// a result stable to 8 digits still beats the unconverged alternative.
			return Math.abs(est - prev) <= 1e-8 * Math.max(1, Math.abs(est)) ? est : null;
		}
		prev = est;
	}
	return null;
}

/** Residual of an equation at x: returns [left side, right side]. */
export type Sides = (x: number) => [number, number];

export interface SolveResult {
	root: number;
	residual: number;
}

/**
 * Find x with left(x) = right(x), starting near `guess`:
 * Newton's method first (finds the root nearest the guess), then a widening
 * search for a sign change refined with Brent's method.
 */
export function solve(sides: Sides, guess: number): SolveResult {
	const res = (x: number): number => {
		try {
			const [l, r] = sides(x);
			const d = l - r;
			return Number.isFinite(d) ? d : NaN;
		} catch {
			return NaN;
		}
	};
	const accept = (x: number): SolveResult | null => {
		if (!Number.isFinite(x)) return null;
		let l: number, r: number;
		try {
			[l, r] = sides(x);
		} catch {
			return null;
		}
		const residual = l - r;
		const scale = Math.max(1, Math.abs(l), Math.abs(r));
		return Math.abs(residual) <= 1e-9 * scale ? { root: x, residual } : null;
	};

	// 1. Newton with a numerical derivative.
	let x = guess;
	for (let i = 0; i < 100; i++) {
		const fx = res(x);
		if (Number.isNaN(fx)) break;
		if (fx === 0) break;
		const h = 1e-7 * Math.max(1, Math.abs(x));
		const d = (res(x + h) - res(x - h)) / (2 * h);
		if (!Number.isFinite(d) || d === 0) break;
		const nx = x - fx / d;
		if (!Number.isFinite(nx)) break;
		const done = Math.abs(nx - x) <= 1e-15 * Math.max(1, Math.abs(x));
		x = nx;
		if (done) break;
	}
	const newton = accept(x);
	if (newton) return newton;

	// 2. Widen outward from the guess until the sign changes, then use Brent.
	const f0 = res(guess);
	if (f0 === 0) return { root: guess, residual: 0 };
	const step = 0.1 * Math.max(1, Math.abs(guess));
	for (const dir of [1, -1]) {
		let prevX = guess;
		let prevF = f0;
		for (let k = 0; k < 90; k++) {
			const nx = guess + dir * step * Math.pow(1.5, k);
			const nf = res(nx);
			if (!Number.isNaN(prevF) && !Number.isNaN(nf) && Math.sign(prevF) !== Math.sign(nf)) {
				const root = brent(res, prevX, nx, prevF, nf);
				const ok = accept(root);
				if (ok) return ok;
			}
			prevX = nx;
			prevF = nf;
		}
	}
	throw new CalcMathError("Can't Solve");
}

function brent(f: Fn, a: number, b: number, fa: number, fb: number): number {
	const EPS = 2.220446049250313e-16;
	let c = b;
	let fc = fb;
	let d = b - a;
	let e = d;
	for (let iter = 0; iter < 200; iter++) {
		if ((fb > 0 && fc > 0) || (fb < 0 && fc < 0)) {
			c = a;
			fc = fa;
			e = d = b - a;
		}
		if (Math.abs(fc) < Math.abs(fb)) {
			a = b; b = c; c = a;
			fa = fb; fb = fc; fc = fa;
		}
		const tol1 = 2 * EPS * Math.abs(b) + 0.5e-300;
		const xm = 0.5 * (c - b);
		if (Math.abs(xm) <= tol1 || fb === 0) return b;
		if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
			const s = fb / fa;
			let p: number;
			let q: number;
			if (a === c) {
				p = 2 * xm * s;
				q = 1 - s;
			} else {
				const qq = fa / fc;
				const r = fb / fc;
				p = s * (2 * xm * qq * (qq - r) - (b - a) * (r - 1));
				q = (qq - 1) * (r - 1) * (s - 1);
			}
			if (p > 0) q = -q;
			p = Math.abs(p);
			const min1 = 3 * xm * q - Math.abs(tol1 * q);
			const min2 = Math.abs(e * q);
			if (2 * p < Math.min(min1, min2)) {
				e = d;
				d = p / q;
			} else {
				d = xm;
				e = d;
			}
		} else {
			d = xm;
			e = d;
		}
		a = b;
		fa = fb;
		b += Math.abs(d) > tol1 ? d : xm >= 0 ? tol1 : -tol1;
		fb = f(b);
		if (Number.isNaN(fb)) return NaN;
	}
	return b;
}

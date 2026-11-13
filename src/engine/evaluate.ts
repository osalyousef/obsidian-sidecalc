import { CalcMathError } from './errors.ts';
import { derivative, integrate, solve } from './numeric.ts';
import type { SolveResult } from './numeric.ts';
import { CalcSyntaxError } from './parser.ts';
import type { Node } from './parser.ts';
import { X_FUNCTIONS } from './tokens.ts';
import type { VarName } from './tokens.ts';

export type AngleMode = 'deg' | 'rad' | 'gra';

export interface EvalContext {
	angle: AngleMode;
	vars: Record<VarName, number>;
	ans: number;
	preAns: number;
	random?: () => number;
}

export { CalcMathError };

const LIMIT = 1e100; // results at or beyond this overflow, as on a hardware calculator
const TRIG_EPS = 1e-15;

export function evaluate(node: Node, ctx: EvalContext): number {
	const v = roundSig(ev(node, ctx), 15);
	if (Math.abs(v) >= LIMIT) throw new CalcMathError();
	return Object.is(v, -0) ? 0 : v;
}

/** Round to n significant digits; hides binary noise such as 0.1 + 0.2. */
export function roundSig(x: number, n: number): number {
	if (x === 0 || !Number.isFinite(x)) return x;
	return Number(x.toPrecision(n));
}

function check(x: number): number {
	if (Number.isNaN(x) || !Number.isFinite(x)) throw new CalcMathError();
	return x;
}

function isInt(x: number): boolean {
	return Number.isInteger(roundSig(x, 15));
}

function ev(n: Node, ctx: EvalContext): number {
	switch (n.t) {
		case 'num':
			return check(Number(n.exp !== undefined ? `${n.mant}e${n.exp}` : n.mant));
		case 'dms':
			return Number(n.d || 0) + Number(n.m ?? 0) / 60 + Number(n.s ?? 0) / 3600;
		case 'const':
			return n.name === 'pi' ? Math.PI : Math.E;
		case 'var':
			return ctx.vars[n.name] ?? 0;
		case 'sym':
			if (n.name === 'ans') return ctx.ans;
			if (n.name === 'preans') return ctx.preAns;
			return Math.round((ctx.random ?? Math.random)() * 1000) / 1000;
		case 'group':
			return ev(n.inner, ctx);
		case 'neg':
			return -ev(n.arg, ctx);
		case 'post':
			return post(n.op, ev(n.arg, ctx));
		case 'bin':
			return bin(n.op, ev(n.l, ctx), ev(n.r, ctx));
		case 'call':
			if (X_FUNCTIONS.has(n.fn)) return xCall(n.fn, n.args, ctx);
			return call(n.fn, n.args.map((a) => ev(a, ctx)), ctx);
		case 'eq':
			// "=" only makes sense for SOLVE or as an assignment like A=5.
			throw new CalcSyntaxError(0);
	}
}

/** f(x) = node with `name` bound to x. Errors give NaN, so a plot can skip them. */
export function functionOf(node: Node, name: VarName, ctx: EvalContext): (x: number) => number {
	return (x) => {
		try {
			return ev(node, withVar(ctx, name, x));
		} catch {
			return NaN;
		}
	};
}

function withVar(ctx: EvalContext, name: VarName, value: number): EvalContext {
	return { ...ctx, vars: { ...ctx.vars, [name]: value } };
}

/** d/dx, ∫, Σ and ∏: the first argument is evaluated for many values of X. */
function xCall(fn: string, args: Node[], ctx: EvalContext): number {
	const body = args[0]!;
	const f = (x: number) => ev(body, withVar(ctx, 'X', x));
	switch (fn) {
		case 'ddx':
			return derivative(f, ev(args[1]!, ctx));
		case 'integ':
			return integrate(f, ev(args[1]!, ctx), ev(args[2]!, ctx));
		case 'sum':
		case 'prod': {
			const a = ev(args[1]!, ctx);
			const b = ev(args[2]!, ctx);
			if (!isInt(a) || !isInt(b) || b < a || b - a > 1e6) throw new CalcMathError();
			let acc = fn === 'sum' ? 0 : 1;
			for (let x = Math.round(a); x <= Math.round(b); x++) {
				acc = fn === 'sum' ? acc + f(x) : acc * f(x);
			}
			return check(acc);
		}
		default:
			throw new CalcMathError();
	}
}

/**
 * Evaluate a whole input line. "A=expr" assigns to A; any other equation
 * is a syntax error here (it belongs to SOLVE).
 */
export function evaluateStatement(node: Node, ctx: EvalContext): { value: number; assign?: VarName } {
	if (node.t === 'eq') {
		if (node.l.t !== 'var') throw new CalcSyntaxError(0);
		return { value: evaluate(node.r, ctx), assign: node.l.name };
	}
	return { value: evaluate(node, ctx) };
}

/** Solve "left = right" (or "expr = 0") for `name`, starting from its current value. */
export function solveFor(node: Node, name: VarName, ctx: EvalContext): SolveResult {
	const [lhs, rhs] = node.t === 'eq' ? [node.l, node.r] : [node, null];
	const sides = (x: number): [number, number] => {
		const c = withVar(ctx, name, x);
		return [ev(lhs, c), rhs ? ev(rhs, c) : 0];
	};
	const { root } = solve(sides, ctx.vars[name] ?? 0);
	const clean = roundSig(root, 15);
	const [l, r] = sides(root);
	// Differences at the level of floating-point noise are reported as 0.
	const scale = Math.max(1, Math.abs(l), Math.abs(r));
	const residual = Math.abs(l - r) <= 1e-13 * scale ? 0 : roundSig(l - r, 15);
	return { root: Object.is(clean, -0) ? 0 : clean, residual };
}

/** Variables an expression reads, in order of first use (X inside d/dx, ∫, Σ, ∏ is bound). */
export function freeVars(node: Node): VarName[] {
	const out: VarName[] = [];
	const walk = (n: Node, xBound: boolean): void => {
		switch (n.t) {
			case 'var':
				if (!(xBound && n.name === 'X') && !out.includes(n.name)) out.push(n.name);
				return;
			case 'group': walk(n.inner, xBound); return;
			case 'neg': case 'post': walk(n.arg, xBound); return;
			case 'bin': case 'eq': walk(n.l, xBound); walk(n.r, xBound); return;
			case 'call':
				n.args.forEach((a, i) => walk(a, xBound || (i === 0 && X_FUNCTIONS.has(n.fn))));
				return;
			default:
				return;
		}
	};
	walk(node, false);
	return out;
}

function post(op: string, x: number): number {
	switch (op) {
		case 'sq': return check(x * x);
		case 'cube': return check(x * x * x);
		case 'inv':
			if (x === 0) throw new CalcMathError();
			return 1 / x;
		case 'fact': return factorial(x);
		case 'pct': return x / 100;
		default: throw new CalcMathError();
	}
}

function bin(op: string, a: number, b: number): number {
	switch (op) {
		case '+': return check(a + b);
		case '-': return check(a - b);
		case '*':
		case 'imp': return check(a * b);
		case '/':
		case 'frac':
			if (b === 0) throw new CalcMathError();
			return check(a / b);
		case 'mod': {
			if (b === 0) throw new CalcMathError();
			return check(a - b * Math.floor(roundSig(a / b, 15)));
		}
		case 'pow': return power(a, b);
		case 'root': return nthRoot(b, a);
		case 'P': return permutations(a, b);
		case 'C': return combinations(a, b);
		default: throw new CalcMathError();
	}
}

function power(a: number, b: number): number {
	if (a < 0 && !isInt(b)) {
		// Allow odd roots of negatives, e.g. (−8)^(1/3) = −2.
		const inv = 1 / b;
		if (isInt(inv) && Math.round(inv) % 2 !== 0) return -Math.pow(-a, b);
		throw new CalcMathError();
	}
	if (a === 0 && b < 0) throw new CalcMathError();
	return check(Math.pow(a, b));
}

function nthRoot(x: number, n: number): number {
	if (n === 0) throw new CalcMathError();
	if (x < 0) {
		if (isInt(n) && Math.round(n) % 2 !== 0) return -Math.pow(-x, 1 / n);
		throw new CalcMathError();
	}
	return check(Math.pow(x, 1 / n));
}

export function factorial(x: number): number {
	if (!isInt(x) || x < 0 || x > 170) throw new CalcMathError();
	let r = 1;
	for (let i = 2; i <= Math.round(x); i++) r *= i;
	return r;
}

function permutations(n: number, r: number): number {
	if (!isInt(n) || !isInt(r) || n < 0 || r < 0 || r > n) throw new CalcMathError();
	let out = 1;
	for (let i = 0; i < r; i++) out *= n - i;
	return check(out);
}

function combinations(n: number, r: number): number {
	if (!isInt(n) || !isInt(r) || n < 0 || r < 0 || r > n) throw new CalcMathError();
	const k = Math.min(r, n - r);
	let out = 1;
	for (let i = 1; i <= k; i++) out = (out * (n - k + i)) / i;
	return check(Math.round(out));
}

function gcd2(a: number, b: number): number {
	a = Math.abs(a);
	b = Math.abs(b);
	while (b) [a, b] = [b, a % b];
	return a;
}

function toRadians(x: number, mode: AngleMode): number {
	if (mode === 'deg') return (x * Math.PI) / 180;
	if (mode === 'gra') return (x * Math.PI) / 200;
	return x;
}

function fromRadians(x: number, mode: AngleMode): number {
	if (mode === 'deg') return (x * 180) / Math.PI;
	if (mode === 'gra') return (x * 200) / Math.PI;
	return x;
}

/** sin/cos with exact values at multiples of a quarter turn in DEG and GRA modes. */
function sinCos(x: number, mode: AngleMode): [number, number] {
	if (mode !== 'rad') {
		const quarter = mode === 'deg' ? 90 : 100;
		const q = x / quarter;
		if (isInt(q)) {
			const k = ((Math.round(q) % 4) + 4) % 4;
			return [[0, 1, 0, -1][k]!, [1, 0, -1, 0][k]!];
		}
	}
	const r = toRadians(x, mode);
	const snap = (v: number) => (Math.abs(v) < TRIG_EPS ? 0 : v);
	return [snap(Math.sin(r)), snap(Math.cos(r))];
}

function call(fn: string, args: number[], ctx: EvalContext): number {
	const x = args[0]!;
	const mode = ctx.angle;
	switch (fn) {
		case 'sin': return sinCos(x, mode)[0];
		case 'cos': return sinCos(x, mode)[1];
		case 'tan': {
			const [s, c] = sinCos(x, mode);
			if (c === 0) throw new CalcMathError();
			return s / c;
		}
		case 'asin':
			if (x < -1 || x > 1) throw new CalcMathError();
			return fromRadians(Math.asin(x), mode);
		case 'acos':
			if (x < -1 || x > 1) throw new CalcMathError();
			return fromRadians(Math.acos(x), mode);
		case 'atan': return fromRadians(Math.atan(x), mode);
		case 'sinh': return check(Math.sinh(x));
		case 'cosh': return check(Math.cosh(x));
		case 'tanh': return Math.tanh(x);
		case 'asinh': return Math.asinh(x);
		case 'acosh':
			if (x < 1) throw new CalcMathError();
			return Math.acosh(x);
		case 'atanh':
			if (x <= -1 || x >= 1) throw new CalcMathError();
			return Math.atanh(x);
		case 'log':
			if (args.length === 2) return logBase(args[0]!, args[1]!);
			if (x <= 0) throw new CalcMathError();
			return Math.log10(x);
		case 'logab': return logBase(args[0]!, args[1]!);
		case 'ln':
			if (x <= 0) throw new CalcMathError();
			return Math.log(x);
		case 'sqrt':
			if (x < 0) throw new CalcMathError();
			return Math.sqrt(x);
		case 'cbrt': return Math.cbrt(x);
		case 'abs': return Math.abs(x);
		case 'exp': return check(Math.exp(x));
		case 'pow10': return check(Math.pow(10, x));
		case 'floor': return Math.floor(roundSig(x, 15));
		case 'ceil': return Math.ceil(roundSig(x, 15));
		case 'int': return Math.trunc(roundSig(x, 15));
		case 'gcd':
		case 'lcm': {
			const [a, b] = args as [number, number];
			if (!isInt(a) || !isInt(b)) throw new CalcMathError();
			const g = gcd2(Math.round(a), Math.round(b));
			if (fn === 'gcd') return g;
			return g === 0 ? 0 : Math.abs(Math.round(a) * Math.round(b)) / g;
		}
		case 'ranint': {
			const [a, b] = args as [number, number];
			if (!isInt(a) || !isInt(b) || a > b) throw new CalcMathError();
			const rnd = (ctx.random ?? Math.random)();
			return Math.round(a) + Math.floor(rnd * (Math.round(b) - Math.round(a) + 1));
		}
		default:
			throw new CalcMathError();
	}
}

function logBase(base: number, x: number): number {
	if (base <= 0 || base === 1 || x <= 0) throw new CalcMathError();
	return Math.log(x) / Math.log(base);
}

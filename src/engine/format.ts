// Turning a result value into display text and LaTeX:
// decimal (Norm / Fix / Sci), engineering notation, ° ′ ″, and exact forms
// such as 3/4, 2√3/3 and π/6.

export type NumberFormat = 'norm' | 'fix' | 'sci';

export interface FormatOptions {
	format: NumberFormat;
	digits: number; // decimals for Fix, significant digits for Sci
	separator: string; // digit grouping, '' for none
}

export interface Rendered {
	text: string;
	latex: string;
}

export const DEFAULT_FORMAT: FormatOptions = { format: 'norm', digits: 4, separator: ' ' };

const SUPERSCRIPT: Record<string, string> = {
	'0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻',
};

function sup(n: number): string {
	return String(n).split('').map((c) => SUPERSCRIPT[c] ?? c).join('');
}

function stripZeros(s: string): string {
	return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

/** Group digits in threes on both sides of the decimal point. */
function group(s: string, sep: string): string {
	if (!sep) return s;
	const neg = s.startsWith('-');
	const [int = '', frac] = (neg ? s.slice(1) : s).split('.');
	const intG = int.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
	const fracG = frac === undefined ? '' : '.' + frac.replace(/(\d{3})(?=\d)/g, `$1${sep}`);
	return (neg ? '-' : '') + intG + fracG;
}

function build(mant: string, exp: number | null, opts: FormatOptions): Rendered {
	const g = group(mant, opts.separator);
	const text = g.replace(/^-/, '−') + (exp === null ? '' : `×10${sup(exp)}`);
	const texMant = group(mant, opts.separator ? '\\,' : '');
	const latex = texMant + (exp === null ? '' : `\\times10^{${exp}}`);
	return { text, latex };
}

/** Plain decimal with at most `sig` significant digits, never in exponent form. */
function plain(x: number, sig: number): string {
	const r = Number(x.toPrecision(sig));
	const mag = Math.floor(Math.log10(Math.abs(r)));
	return stripZeros(r.toFixed(Math.min(20, Math.max(0, sig - 1 - mag))));
}

function scientific(x: number, sig: number, keepZeros: boolean): [string, number] {
	const [m = '0', e = '0'] = x.toExponential(sig - 1).split('e');
	return [keepZeros ? m : stripZeros(m), Number(e)];
}

export function formatDecimal(x: number, opts: FormatOptions): Rendered {
	if (x === 0 && opts.format !== 'fix' && opts.format !== 'sci') return build('0', null, opts);
	const abs = Math.abs(x);
	if (opts.format === 'fix' && abs < 1e10) return build(x.toFixed(opts.digits), null, opts);
	if (opts.format === 'sci') {
		const [m, e] = scientific(x, Math.max(1, opts.digits), true);
		return build(m, e, opts);
	}
	if (abs >= 1e10 || abs < 1e-9) {
		const [m, e] = scientific(x, 10, false);
		return build(m, e, opts);
	}
	return build(plain(x, 10), null, opts);
}

/** Engineering notation with a fixed exponent (a multiple of 3). */
export function formatEng(x: number, exp: number, opts: FormatOptions): Rendered {
	const m = x / Math.pow(10, exp);
	return build(m === 0 ? '0' : plain(m, 10), exp, opts);
}

export function engStart(x: number): number {
	if (x === 0) return 0;
	return Math.floor(Math.floor(Math.log10(Math.abs(x)) + 1e-12) / 3) * 3;
}

export function formatDms(x: number): Rendered {
	const neg = x < 0;
	let total = Math.round(Math.abs(x) * 360000) / 100; // seconds, 2 decimals
	const d = Math.floor(total / 3600);
	total -= d * 3600;
	const m = Math.floor(total / 60);
	const s = stripZeros((total - m * 60).toFixed(2));
	const sign = neg ? '−' : '';
	return {
		text: `${sign}${d}°${m}′${s}″`,
		latex: `${neg ? '-' : ''}${d}^{\\circ}${m}'${s}''`,
	};
}

// ---- Exact forms ----

export type Exact =
	| { kind: 'frac'; p: number; q: number }
	| { kind: 'surd'; p: number; q: number; r: number } // (p/q)·√r
	| { kind: 'pi'; p: number; q: number }; // (p/q)·π

/** Best rational approximation p/q with q ≤ maxDen, or null if not close enough. */
export function toRational(x: number, maxDen: number): [number, number] | null {
	if (!Number.isFinite(x)) return null;
	const sign = x < 0 ? -1 : 1;
	let v = Math.abs(x);
	let [h0, h1, k0, k1] = [0, 1, 1, 0];
	for (let i = 0; i < 40; i++) {
		const a = Math.floor(v);
		const h2 = a * h1 + h0;
		const k2 = a * k1 + k0;
		if (k2 > maxDen) break;
		[h0, h1, k0, k1] = [h1, h2, k1, k2];
		const approx = h1 / k1;
		if (Math.abs(approx - Math.abs(x)) <= 1e-11 * Math.max(1, Math.abs(x))) return [sign * h1, k1];
		const frac = v - a;
		if (frac < 1e-15) break;
		v = 1 / frac;
	}
	return null;
}

const SQUAREFREE: number[] = [];
for (let r = 2; r <= 200; r++) {
	let ok = true;
	for (let f = 2; f * f <= r; f++) if (r % (f * f) === 0) ok = false;
	if (ok) SQUAREFREE.push(r);
}

export function findExact(x: number): Exact | null {
	if (!Number.isFinite(x) || Number.isInteger(x) || Math.abs(x) >= 1e10 || Math.abs(x) < 1e-9) return null;
	const frac = toRational(x, 9999);
	if (frac && Math.abs(frac[0]) < 1e10) return { kind: 'frac', p: frac[0], q: frac[1] };
	for (const r of SQUAREFREE) {
		const s = toRational(x / Math.sqrt(r), 999);
		if (s && Math.abs(s[0]) <= 9999) return { kind: 'surd', p: s[0], q: s[1], r };
	}
	const pi = toRational(x / Math.PI, 999);
	if (pi && Math.abs(pi[0]) <= 9999) return { kind: 'pi', p: pi[0], q: pi[1] };
	return null;
}

export function formatExact(e: Exact): Rendered {
	const neg = e.p < 0;
	const p = Math.abs(e.p);
	const sign = neg ? '−' : '';
	const texSign = neg ? '-' : '';
	let numText: string;
	let numTex: string;
	if (e.kind === 'frac') {
		numText = String(p);
		numTex = String(p);
	} else if (e.kind === 'surd') {
		const coef = p === 1 ? '' : String(p);
		numText = `${coef}√${e.r}`;
		numTex = `${coef}\\sqrt{${e.r}}`;
	} else {
		const coef = p === 1 ? '' : String(p);
		numText = `${coef}π`;
		numTex = `${coef}\\pi`;
	}
	if (e.q === 1) return { text: sign + numText, latex: texSign + numTex };
	return {
		text: `${sign}${numText}/${e.q}`,
		latex: `${texSign}\\frac{${numTex}}{${e.q}}`,
	};
}

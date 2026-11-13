// Tokens are the units the user edits: one key press usually inserts one token.
// They are plain JSON so history entries can be persisted as-is.

export type FnName =
	| 'sin' | 'cos' | 'tan' | 'asin' | 'acos' | 'atan'
	| 'sinh' | 'cosh' | 'tanh' | 'asinh' | 'acosh' | 'atanh'
	| 'log' | 'logab' | 'ln' | 'sqrt' | 'cbrt' | 'abs' | 'exp' | 'pow10'
	| 'floor' | 'ceil' | 'int' | 'gcd' | 'lcm' | 'ranint'
	| 'ddx' | 'integ' | 'sum' | 'prod';

/** Functions whose first argument is an expression in X, evaluated for many X values. */
export const X_FUNCTIONS: ReadonlySet<FnName> = new Set<FnName>(['ddx', 'integ', 'sum', 'prod']);

export type VarName = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'X' | 'Y' | 'M';
export const VAR_NAMES: VarName[] = ['A', 'B', 'C', 'D', 'E', 'F', 'X', 'Y', 'M'];

export type OpName = '+' | '-' | '*' | '/';
export type PostName = 'sq' | 'cube' | 'inv' | 'fact' | 'pct';
export type InfixName = 'mod' | 'P' | 'C';

export type Tok =
	| { k: 'd'; v: string } // digit 0-9
	| { k: 'dot' }
	| { k: 'e10' } // ×10ⁿ inside a number literal
	| { k: 'op'; v: OpName }
	| { k: 'neg' } // (−) prefix minus
	| { k: 'lp' }
	| { k: 'rp' }
	| { k: 'comma' }
	| { k: 'fn'; v: FnName } // function name including its "("
	| { k: 'post'; v: PostName }
	| { k: 'pow' } // xʸ key: "^(" with its own bracket
	| { k: 'caret' } // typed "^": binds to the next factor
	| { k: 'xroot' } // ˣ√( : index before, radicand inside
	| { k: 'frac' } // fraction bar a⁄b
	| { k: 'dms' } // ° ′ ″ sexagesimal marker
	| { k: 'ifx'; v: InfixName }
	| { k: 'c'; v: 'pi' | 'e' }
	| { k: 'var'; v: VarName }
	| { k: 'ans' }
	| { k: 'preans' }
	| { k: 'ran' }
	| { k: 'eqsign' } // "=" inside an equation (SOLVE, or A=… assignment)
	| { k: 'ch'; v: string }; // raw typed letter, resolved by the parser

export interface FnInfo {
	label: string;
	arity: [number, number];
	typed?: string[]; // names accepted when typed on the keyboard
	hint?: string; // argument pattern shown while the cursor is inside
}

export const FUNCTIONS: Record<FnName, FnInfo> = {
	sin: { label: 'sin(', arity: [1, 1], typed: ['sin'] },
	cos: { label: 'cos(', arity: [1, 1], typed: ['cos'] },
	tan: { label: 'tan(', arity: [1, 1], typed: ['tan'] },
	asin: { label: 'sin⁻¹(', arity: [1, 1], typed: ['asin', 'arcsin'] },
	acos: { label: 'cos⁻¹(', arity: [1, 1], typed: ['acos', 'arccos'] },
	atan: { label: 'tan⁻¹(', arity: [1, 1], typed: ['atan', 'arctan'] },
	sinh: { label: 'sinh(', arity: [1, 1], typed: ['sinh'] },
	cosh: { label: 'cosh(', arity: [1, 1], typed: ['cosh'] },
	tanh: { label: 'tanh(', arity: [1, 1], typed: ['tanh'] },
	asinh: { label: 'sinh⁻¹(', arity: [1, 1], typed: ['asinh', 'arsinh'] },
	acosh: { label: 'cosh⁻¹(', arity: [1, 1], typed: ['acosh', 'arcosh'] },
	atanh: { label: 'tanh⁻¹(', arity: [1, 1], typed: ['atanh', 'artanh'] },
	log: { label: 'log(', arity: [1, 2], typed: ['log'], hint: 'log(x)  or  log(base, x)' },
	logab: { label: 'logₐ(', arity: [2, 2], typed: ['logab'], hint: 'logₐ(base, x)' },
	ln: { label: 'ln(', arity: [1, 1], typed: ['ln'] },
	sqrt: { label: '√(', arity: [1, 1], typed: ['sqrt'] },
	cbrt: { label: '∛(', arity: [1, 1], typed: ['cbrt'] },
	abs: { label: 'Abs(', arity: [1, 1], typed: ['abs'] },
	exp: { label: 'e^(', arity: [1, 1], typed: ['exp'] },
	pow10: { label: '10^(', arity: [1, 1] },
	floor: { label: 'Floor(', arity: [1, 1], typed: ['floor'] },
	ceil: { label: 'Ceil(', arity: [1, 1], typed: ['ceil'] },
	int: { label: 'Int(', arity: [1, 1], typed: ['int', 'trunc'] },
	gcd: { label: 'GCD(', arity: [2, 2], typed: ['gcd'], hint: 'GCD(a, b)' },
	lcm: { label: 'LCM(', arity: [2, 2], typed: ['lcm'], hint: 'LCM(a, b)' },
	ranint: { label: 'RanInt(', arity: [2, 2], typed: ['ranint'], hint: 'RanInt(min, max)' },
	ddx: { label: 'd/dx(', arity: [2, 2], typed: ['ddx', 'diff', 'deriv'], hint: 'd/dx(f(X), at X)' },
	integ: { label: '∫(', arity: [3, 3], typed: ['integral', 'integrate'], hint: '∫(f(X), from, to)' },
	sum: { label: 'Σ(', arity: [3, 3], typed: ['sum'], hint: 'Σ(f(X), from X, to X)' },
	prod: { label: '∏(', arity: [3, 3], typed: ['prod', 'product'], hint: '∏(f(X), from X, to X)' },
};

/** Typed word → function, e.g. "sin" → sin, "arcsin" → asin. */
export const TYPED_FUNCTIONS: Map<string, FnName> = new Map();
for (const [name, info] of Object.entries(FUNCTIONS) as [FnName, FnInfo][]) {
	for (const t of info.typed ?? []) TYPED_FUNCTIONS.set(t, name);
}

const OP_LABEL: Record<OpName, string> = { '+': '+', '-': '−', '*': '×', '/': '÷' };
const POST_LABEL: Record<PostName, string> = { sq: '²', cube: '³', inv: '⁻¹', fact: '!', pct: '%' };
const IFX_LABEL: Record<InfixName, string> = { mod: ' mod ', P: 'P', C: 'C' };

/** Display labels for a token list (needs the whole list for ° ′ ″). */
export function tokenLabels(toks: Tok[]): string[] {
	const out: string[] = [];
	let dmsCount = 0; // position of a ° marker within one sexagesimal number
	for (const t of toks) {
		if (t.k === 'dms') {
			out.push(['°', '′', '″'][Math.min(dmsCount, 2)]!);
			dmsCount++;
			continue;
		}
		if (t.k !== 'd' && t.k !== 'dot') dmsCount = 0;
		out.push(tokenLabel(t));
	}
	return out;
}

export function tokenLabel(t: Tok): string {
	switch (t.k) {
		case 'd': return t.v;
		case 'dot': return '.';
		case 'e10': return 'ᴇ';
		case 'op': return OP_LABEL[t.v];
		case 'neg': return '−';
		case 'lp': return '(';
		case 'rp': return ')';
		case 'comma': return ',';
		case 'fn': return FUNCTIONS[t.v].label;
		case 'post': return POST_LABEL[t.v];
		case 'pow': return '^(';
		case 'caret': return '^';
		case 'xroot': return 'ˣ√(';
		case 'frac': return '⁄';
		case 'dms': return '°';
		case 'ifx': return IFX_LABEL[t.v];
		case 'c': return t.v === 'pi' ? 'π' : 'e';
		case 'var': return t.v;
		case 'ans': return 'Ans';
		case 'preans': return 'PreAns';
		case 'ran': return 'Ran#';
		case 'eqsign': return '=';
		case 'ch': return t.v;
	}
}

export function tokensToText(toks: Tok[]): string {
	return tokenLabels(toks).join('');
}

/** Convert typed or pasted text into tokens. Unknown characters are skipped. */
export function textToTokens(text: string): Tok[] {
	const out: Tok[] = [];
	for (const raw of text) {
		const t = charToToken(raw);
		if (t) out.push(t);
	}
	return out;
}

export function charToToken(ch: string): Tok | null {
	if (/^[0-9]$/.test(ch)) return { k: 'd', v: ch };
	if (/^[a-zA-Z]$/.test(ch)) return { k: 'ch', v: ch.toLowerCase() };
	switch (ch) {
		case '.': return { k: 'dot' };
		case '+': return { k: 'op', v: '+' };
		case '-': case '−': return { k: 'op', v: '-' };
		case '*': case '×': case '·': return { k: 'op', v: '*' };
		case '/': case '÷': return { k: 'op', v: '/' };
		case '^': return { k: 'caret' };
		case '(': return { k: 'lp' };
		case ')': return { k: 'rp' };
		case ',': case ';': return { k: 'comma' };
		case '!': return { k: 'post', v: 'fact' };
		case '%': return { k: 'post', v: 'pct' };
		case '²': return { k: 'post', v: 'sq' };
		case '³': return { k: 'post', v: 'cube' };
		case '√': return { k: 'fn', v: 'sqrt' };
		case '∛': return { k: 'fn', v: 'cbrt' };
		case 'π': return { k: 'c', v: 'pi' };
		case '°': case '′': case '″': case "'": case '"': return { k: 'dms' };
		case 'ᴇ': return { k: 'e10' };
		case '⁄': return { k: 'frac' };
		case '=': return { k: 'eqsign' };
		case '∫': return { k: 'fn', v: 'integ' };
		case 'Σ': case '∑': return { k: 'fn', v: 'sum' };
		case '∏': return { k: 'fn', v: 'prod' };
		default: return null;
	}
}

/** Hint for the innermost unclosed function at the cursor, e.g. "∫(f(X), from, to)". */
export function hintAt(toks: Tok[], cursor: number): string | null {
	const stack: (FnName | null)[] = [];
	let word = ''; // letters typed just before a "(", e.g. "integral"
	for (const t of toks.slice(0, cursor)) {
		if (t.k === 'ch') {
			word += t.v;
			continue;
		}
		if (t.k === 'fn') stack.push(t.v);
		else if (t.k === 'lp') stack.push(word ? findTypedSuffix(word) : null);
		else if (t.k === 'pow' || t.k === 'xroot') stack.push(null);
		else if (t.k === 'rp') stack.pop();
		word = '';
	}
	for (let i = stack.length - 1; i >= 0; i--) {
		const fn = stack[i];
		if (fn) return FUNCTIONS[fn].hint ?? null;
	}
	return null;
}

/** Longest typed function name at the end of a letter run ("xsin" → sin). */
function findTypedSuffix(word: string): FnName | null {
	for (let i = 0; i < word.length; i++) {
		const fn = TYPED_FUNCTIONS.get(word.slice(i));
		if (fn) return fn;
	}
	return null;
}

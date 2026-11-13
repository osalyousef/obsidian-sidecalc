// Recursive-descent parser for calculator input, using Casio-style precedence
// (lowest to highest):
//   + −  →  × ÷ mod  →  nPr nCr  →  implicit ×  →  prefix −  →  a⁄b
//   →  ^ ˣ√  →  postfix ² ³ ⁻¹ ! %  →  primary
// Missing closing brackets at the end of the input are closed automatically.

import { FUNCTIONS, TYPED_FUNCTIONS } from './tokens.ts';
import type { FnName, InfixName, PostName, Tok, VarName } from './tokens.ts';

export type BinOp = '+' | '-' | '*' | '/' | InfixName | 'imp' | 'frac' | 'pow' | 'root';

export type Node =
	| { t: 'num'; mant: string; exp?: string }
	| { t: 'dms'; d: string; m?: string; s?: string }
	| { t: 'const'; name: 'pi' | 'e' }
	| { t: 'var'; name: VarName }
	| { t: 'sym'; name: 'ans' | 'preans' | 'ran' }
	| { t: 'group'; inner: Node }
	| { t: 'neg'; arg: Node }
	| { t: 'bin'; op: BinOp; l: Node; r: Node }
	| { t: 'post'; op: PostName; arg: Node }
	| { t: 'call'; fn: FnName; args: Node[] }
	| { t: 'eq'; l: Node; r: Node };

export class CalcSyntaxError extends Error {
	pos: number;
	constructor(pos: number, message = 'Syntax ERROR') {
		super(message);
		this.pos = pos;
	}
}

const TYPED_CONSTANTS: [string, Tok][] = [
	['preans', { k: 'preans' }],
	['ans', { k: 'ans' }],
	['ran', { k: 'ran' }],
	['pi', { k: 'c', v: 'pi' }],
	['e', { k: 'c', v: 'e' }],
];
const TYPED_VARS = new Set(['a', 'b', 'c', 'd', 'f', 'x', 'y', 'm']);

export function parse(toks: Tok[]): Node {
	if (toks.length === 0) throw new CalcSyntaxError(0);
	const p = new Parser(toks);
	let node = p.expr();
	if (p.peek()?.k === 'eqsign') {
		p.pos++;
		node = { t: 'eq', l: node, r: p.expr() };
	}
	if (p.pos < toks.length) throw new CalcSyntaxError(p.pos);
	return node;
}

class Parser {
	toks: Tok[];
	pos = 0;
	constructor(toks: Tok[]) {
		this.toks = toks;
	}

	peek(): Tok | undefined {
		return this.toks[this.pos];
	}

	expr(): Node {
		let l = this.mul();
		for (;;) {
			const t = this.peek();
			if (t?.k === 'op' && (t.v === '+' || t.v === '-')) {
				this.pos++;
				l = { t: 'bin', op: t.v, l, r: this.mul() };
			} else return l;
		}
	}

	mul(): Node {
		let l = this.perm();
		for (;;) {
			const t = this.peek();
			if (t?.k === 'op' && (t.v === '*' || t.v === '/')) {
				this.pos++;
				l = { t: 'bin', op: t.v, l, r: this.perm() };
			} else if (t?.k === 'ifx' && t.v === 'mod') {
				this.pos++;
				l = { t: 'bin', op: 'mod', l, r: this.perm() };
			} else return l;
		}
	}

	perm(): Node {
		let l = this.implicit();
		for (;;) {
			const t = this.peek();
			if (t?.k === 'ifx' && (t.v === 'P' || t.v === 'C')) {
				this.pos++;
				l = { t: 'bin', op: t.v, l, r: this.implicit() };
			} else return l;
		}
	}

	implicit(): Node {
		let l = this.unary();
		while (startsFactor(this.peek())) {
			l = { t: 'bin', op: 'imp', l, r: this.unary() };
		}
		return l;
	}

	unary(): Node {
		const t = this.peek();
		if (t?.k === 'neg' || (t?.k === 'op' && t.v === '-')) {
			this.pos++;
			return { t: 'neg', arg: this.unary() };
		}
		if (t?.k === 'op' && t.v === '+') {
			this.pos++;
			return this.unary();
		}
		return this.frac();
	}

	frac(): Node {
		let l = this.power();
		while (this.peek()?.k === 'frac') {
			this.pos++;
			l = { t: 'bin', op: 'frac', l, r: this.signed() };
		}
		return l;
	}

	/** Operand that may carry its own leading minus, e.g. the denominator in 1⁄−2. */
	signed(): Node {
		const t = this.peek();
		if (t?.k === 'neg' || (t?.k === 'op' && t.v === '-')) {
			this.pos++;
			return { t: 'neg', arg: this.signed() };
		}
		return this.power();
	}

	power(): Node {
		let base = this.postfix();
		for (;;) {
			const t = this.peek();
			if (t?.k === 'pow') {
				this.pos++;
				base = { t: 'bin', op: 'pow', l: base, r: this.untilClose() };
			} else if (t?.k === 'xroot') {
				this.pos++;
				base = { t: 'bin', op: 'root', l: base, r: this.untilClose() };
			} else if (t?.k === 'caret') {
				this.pos++;
				// Typed "^" follows the usual maths convention: right-associative.
				return { t: 'bin', op: 'pow', l: base, r: this.signedPower() };
			} else if (t?.k === 'post') {
				this.pos++;
				base = { t: 'post', op: t.v, arg: base };
			} else return base;
		}
	}

	signedPower(): Node {
		const t = this.peek();
		if (t?.k === 'neg' || (t?.k === 'op' && t.v === '-')) {
			this.pos++;
			return { t: 'neg', arg: this.signedPower() };
		}
		return this.power();
	}

	postfix(): Node {
		let n = this.primary();
		for (;;) {
			const t = this.peek();
			if (t?.k === 'post') {
				this.pos++;
				n = { t: 'post', op: t.v, arg: n };
			} else return n;
		}
	}

	/** Parse an expression closed by ")" — or by the end of input. */
	untilClose(): Node {
		const inner = this.expr();
		const t = this.peek();
		if (t?.k === 'rp') this.pos++;
		else if (t !== undefined) throw new CalcSyntaxError(this.pos);
		return inner;
	}

	primary(): Node {
		const t = this.peek();
		if (!t) throw new CalcSyntaxError(this.pos);
		switch (t.k) {
			case 'd':
			case 'dot':
			case 'e10':
				return this.number();
			case 'lp':
				this.pos++;
				return { t: 'group', inner: this.untilClose() };
			case 'fn':
				this.pos++;
				return this.call(t.v);
			case 'c':
				this.pos++;
				return { t: 'const', name: t.v };
			case 'var':
				this.pos++;
				return { t: 'var', name: t.v };
			case 'ans':
			case 'preans':
			case 'ran':
				this.pos++;
				return { t: 'sym', name: t.k };
			case 'ch':
				return this.word();
			default:
				throw new CalcSyntaxError(this.pos);
		}
	}

	call(fn: FnName): Node {
		const args: Node[] = [];
		if (this.peek()?.k === 'rp') throw new CalcSyntaxError(this.pos);
		args.push(this.expr());
		while (this.peek()?.k === 'comma') {
			this.pos++;
			args.push(this.expr());
		}
		const t = this.peek();
		if (t?.k === 'rp') this.pos++;
		else if (t !== undefined) throw new CalcSyntaxError(this.pos);
		const [min, max] = FUNCTIONS[fn].arity;
		if (args.length < min || args.length > max) throw new CalcSyntaxError(this.pos, 'Argument ERROR');
		return { t: 'call', fn, args };
	}

	readDigits(): string {
		let s = '';
		for (let t = this.peek(); t?.k === 'd'; t = this.peek()) {
			s += t.v;
			this.pos++;
		}
		return s;
	}

	/** digits [. digits] [ᴇ [−] digits] — plus an optional ° ′ ″ sequence. */
	number(): Node {
		const start = this.pos;
		let mant = this.readDigits();
		if (this.peek()?.k === 'dot') {
			this.pos++;
			const frac = this.readDigits();
			mant += '.' + frac;
			if (mant === '.') throw new CalcSyntaxError(start);
		}
		if (this.peek()?.k === 'e10') {
			this.pos++;
			let sign = '';
			const t = this.peek();
			if (t?.k === 'neg' || (t?.k === 'op' && t.v === '-')) {
				sign = '-';
				this.pos++;
			} else if (t?.k === 'op' && t.v === '+') this.pos++;
			const digits = this.readDigits();
			if (!digits) throw new CalcSyntaxError(this.pos);
			return { t: 'num', mant: mant || '1', exp: sign + digits };
		}
		if (this.peek()?.k === 'dms') {
			this.pos++;
			const node: { t: 'dms'; d: string; m?: string; s?: string } = { t: 'dms', d: mant };
			for (const part of ['m', 's'] as const) {
				const save = this.pos;
				const value = this.plainNumber();
				if (value === null) break;
				if (this.peek()?.k !== 'dms') {
					this.pos = save;
					break;
				}
				this.pos++;
				node[part] = value;
			}
			return node;
		}
		return { t: 'num', mant };
	}

	plainNumber(): string | null {
		let s = this.readDigits();
		if (this.peek()?.k === 'dot') {
			this.pos++;
			s += '.' + this.readDigits();
		}
		return s && s !== '.' ? s : null;
	}

	/** A run of typed letters: function names, constants and single-letter variables. */
	word(): Node {
		const start = this.pos;
		let word = '';
		for (let t = this.peek(); t?.k === 'ch'; t = this.peek()) {
			word += t.v;
			this.pos++;
		}
		const parts: Node[] = [];
		let i = 0;
		while (i < word.length) {
			const rest = word.slice(i);
			// A function name only counts when it ends the word and "(" follows.
			const fn = TYPED_FUNCTIONS.get(rest);
			if (fn && this.peek()?.k === 'lp') {
				this.pos++;
				parts.push(this.call(fn));
				i = word.length;
				break;
			}
			const named = TYPED_CONSTANTS.find(([name]) => rest.startsWith(name));
			if (named) {
				const [name, tok] = named;
				parts.push(
					tok.k === 'c'
						? { t: 'const', name: tok.v }
						: { t: 'sym', name: tok.k as 'ans' | 'preans' | 'ran' },
				);
				i += name.length;
				continue;
			}
			const ch = rest[0]!;
			if (TYPED_VARS.has(ch)) {
				parts.push({ t: 'var', name: ch.toUpperCase() as VarName });
				i++;
				continue;
			}
			throw new CalcSyntaxError(start + i, `Unknown name "${rest}"`);
		}
		return parts.reduce((l, r) => ({ t: 'bin', op: 'imp', l, r }));
	}
}

function startsFactor(t: Tok | undefined): boolean {
	if (!t) return false;
	switch (t.k) {
		case 'd': case 'dot': case 'e10': case 'lp': case 'fn': case 'c': case 'var':
		case 'ans': case 'preans': case 'ran': case 'ch': case 'neg':
			return true;
		default:
			return false;
	}
}

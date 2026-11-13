import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Calculator, defaultMemory } from '../src/calculator.ts';
import type { KeyDef } from '../src/calculator.ts';
import { evaluate } from '../src/engine/evaluate.ts';
import type { AngleMode } from '../src/engine/evaluate.ts';
import { DEFAULT_FORMAT, findExact, formatDecimal, formatDms, formatExact } from '../src/engine/format.ts';
import { toLatex } from '../src/engine/latex.ts';
import { parse } from '../src/engine/parser.ts';
import { textToTokens } from '../src/engine/tokens.ts';
import type { Tok } from '../src/engine/tokens.ts';
import { FUNCTION_KEYS, NUMBER_KEYS } from '../src/ui/keys.ts';

function calc(text: string, angle: AngleMode = 'deg'): number {
	const mem = defaultMemory();
	return evaluate(parse(textToTokens(text)), { angle, vars: mem.vars, ans: 0, preAns: 0 });
}
const T = (k: Tok['k'], v?: string) => (v === undefined ? { k } : { k, v }) as Tok;
const evalToks = (toks: Tok[], angle: AngleMode = 'deg') =>
	evaluate(parse(toks), { angle, vars: defaultMemory().vars, ans: 0, preAns: 0 });

test('precedence and implicit multiplication', () => {
	assert.equal(calc('2+3*4'), 14);
	assert.equal(calc('(2+3)*4'), 20);
	assert.equal(calc('-133/23'), -5.78260869565217);
	assert.equal(calc('2pi'), 6.28318530717959);
	assert.equal(calc('2(3+4)'), 14);
	assert.equal(calc('-2^2'), -4);
	assert.equal(calc('2^3^2'), 512); // typed ^ is right-associative
	assert.equal(calc('0.1+0.2'), 0.3);
	assert.equal(calc('5!'), 120);
	assert.equal(calc('50%'), 0.5);
	assert.equal(calc('(1+2'), 3); // auto-closed bracket
});

test('trig respects angle mode and exact quarter turns', () => {
	assert.equal(calc('sin(30)'), 0.5);
	assert.equal(calc('sin(180)'), 0);
	assert.equal(calc('cos(90)'), 0);
	assert.throws(() => calc('tan(90)'));
	assert.equal(calc('sin(pi)', 'rad'), 0);
	assert.equal(calc('asin(1)'), 90);
	assert.equal(calc('sin(100)', 'gra'), 1);
	assert.equal(calc('sinh(0)'), 0);
});

test('functions', () => {
	assert.equal(calc('sqrt(16)'), 4);
	assert.equal(calc('log(1000)'), 3);
	assert.equal(calc('log(2,8)'), 3);
	assert.equal(calc('ln(e)'), 1);
	assert.equal(calc('abs(-3)'), 3);
	assert.equal(calc('gcd(12,18)'), 6);
	assert.equal(calc('lcm(4,6)'), 12);
	assert.equal(calc('cbrt(-27)'), -3);
	assert.throws(() => calc('sqrt(-1)'));
	assert.throws(() => calc('1/0'));
	assert.throws(() => calc('foo(2)'));
});

test('calculator-only tokens', () => {
	// 5 nCr 2, 5 nPr 2
	assert.equal(evalToks([T('d', '5'), T('ifx', 'C'), T('d', '2')]), 10);
	assert.equal(evalToks([T('d', '5'), T('ifx', 'P'), T('d', '2')]), 20);
	// 3 ˣ√( 8 )
	assert.equal(evalToks([T('d', '3'), T('xroot'), T('d', '8'), T('rp')]), 2);
	// 2 ^( 3 ) with the xʸ key, auto-closed
	assert.equal(evalToks([T('d', '2'), T('pow'), T('d', '1'), T('d', '0')]), 1024);
	// 1⁄2 + 1⁄3
	assert.equal(evalToks([T('d', '1'), T('frac'), T('d', '2'), T('op', '+'), T('d', '1'), T('frac'), T('d', '3')]), 0.833333333333333);
	// 1.5ᴇ3
	assert.equal(evalToks([T('d', '1'), T('dot'), T('d', '5'), T('e10'), T('d', '3')]), 1500);
	// 12°30°36°
	assert.equal(evalToks([T('d', '1'), T('d', '2'), T('dms'), T('d', '3'), T('d', '0'), T('dms'), T('d', '3'), T('d', '6'), T('dms')]), 12.51);
	// (−)2² = −4
	assert.equal(evalToks([T('neg'), T('d', '2'), T('post', 'sq')]), -4);
	// 7 mod 3
	assert.equal(evalToks([T('d', '7'), T('ifx', 'mod'), T('d', '3')]), 1);
});

test('LaTeX output', () => {
	assert.equal(toLatex(parse([T('d', '1'), T('frac'), T('d', '2')])), '\\frac{1}{2}');
	assert.equal(toLatex(parse(textToTokens('sqrt(2)'))), '\\sqrt{2}');
	assert.equal(toLatex(parse(textToTokens('sin(30)^2'))), '{\\sin\\left(30\\right)}^{2}');
	assert.equal(toLatex(parse(textToTokens('2pi'))), '{2}{\\pi}');
});

test('exact forms', () => {
	const ex = (x: number) => {
		const e = findExact(x);
		return e && formatExact(e).text;
	};
	assert.equal(ex(0.75), '3/4');
	assert.equal(ex(-1 / 3), '−1/3');
	assert.equal(ex(Math.sqrt(2)), '√2');
	assert.equal(ex((2 * Math.sqrt(3)) / 3), '2√3/3');
	assert.equal(ex(Math.PI / 6), 'π/6');
	assert.equal(ex(5), null);
	assert.equal(ex(0.123456789), null);
});

test('decimal formatting', () => {
	const f = (x: number) => formatDecimal(x, { ...DEFAULT_FORMAT, separator: ' ' }).text;
	assert.equal(f(-5.78260869565217), '−5.782 608 696');
	assert.equal(f(1234567), '1 234 567');
	assert.equal(f(1e12), '1×10¹²');
	assert.equal(f(1.5e-12), '1.5×10⁻¹²');
	assert.equal(f(0), '0');
	assert.equal(formatDms(12.51).text, '12°30′36″');
});

const key = (id: string): KeyDef => {
	const k = [...FUNCTION_KEYS, ...NUMBER_KEYS].find((x) => x.id === id);
	if (!k) throw new Error(`no key ${id}`);
	return k;
};
const press = (c: Calculator, ...ids: string[]) => ids.forEach((id) => c.pressKey(key(id)));

test('calculator flow: Ans continuation, history, STO, M+', () => {
	const c = new Calculator();
	press(c, 'd2', 'add', 'd3', 'eq');
	assert.equal(c.mem.ans, 5);
	press(c, 'mul', 'd2', 'eq'); // Ans×2
	assert.equal(c.mem.ans, 10);
	assert.equal(c.mem.preAns, 5);
	press(c, 'd7', 'eq'); // digit starts fresh
	assert.equal(c.mem.ans, 7);
	press(c, 'shift', 'rcl', 'neg'); // STO → A
	assert.equal(c.mem.vars.A, 7);
	press(c, 'mplus', 'mplus');
	assert.equal(c.mem.vars.M, 14);
	press(c, 'ac', 'up'); // recall last history entry
	assert.equal(c.result?.value, 7);
	press(c, 'up');
	assert.equal(c.result?.value, 10);
	press(c, 'ac', 'alpha', 'neg', 'add', 'd1', 'eq'); // A+1
	assert.equal(c.mem.ans, 8);
});

test('calculator flow: S⇔D, ENG, hyp, errors', () => {
	const c = new Calculator();
	press(c, 'd1', 'frac', 'd3', 'eq');
	assert.equal(c.renderValue(c.result!).text, '1/3'); // MATH mode shows exact
	press(c, 'sd');
	assert.match(c.renderValue(c.result!).text, /^0\.333/);
	press(c, 'ac', 'd1', 'd2', 'd3', 'd4', 'd5', 'eq', 'eng');
	assert.equal(c.renderValue(c.result!).text, '12.345×10³');
	press(c, 'ac', 'hyp', 'sin', 'd0', 'eq');
	assert.equal(c.result?.value, 0);
	press(c, 'ac', 'd1', 'div', 'd0', 'eq');
	assert.equal(c.phase, 'error');
	assert.equal(c.error?.message, 'Math ERROR');
	press(c, 'left'); // back to editing
	assert.equal(c.phase, 'edit');
});

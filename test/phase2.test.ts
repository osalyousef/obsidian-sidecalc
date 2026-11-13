import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Calculator, defaultMemory } from '../src/calculator.ts';
import type { KeyDef } from '../src/calculator.ts';
import { evaluate, freeVars, solveFor } from '../src/engine/evaluate.ts';
import type { AngleMode } from '../src/engine/evaluate.ts';
import { toLatex } from '../src/engine/latex.ts';
import { parse } from '../src/engine/parser.ts';
import { hintAt, textToTokens } from '../src/engine/tokens.ts';
import { FUNCTION_KEYS, NUMBER_KEYS } from '../src/ui/keys.ts';

const ctx = (angle: AngleMode = 'rad') => ({ angle, vars: defaultMemory().vars, ans: 0, preAns: 0 });
const calc = (text: string, angle: AngleMode = 'rad') => evaluate(parse(textToTokens(text)), ctx(angle));
const close = (a: number, b: number, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);

test('derivative', () => {
	close(calc('ddx(x^3, 2)'), 12);
	close(calc('ddx(sin(x), 0)'), 1);
	close(calc('ddx(e^x, 1)'), Math.E);
	close(calc('ddx(ln(x), 4)'), 0.25);
	close(calc('ddx(sin(x), 0)', 'deg'), Math.PI / 180); // degree mode is honoured
});

test('integral', () => {
	close(calc('integral(x^2, 0, 1)'), 1 / 3, 1e-12);
	close(calc('integral(sin(x), 0, pi)'), 2, 1e-12);
	close(calc('integral(e^x, 0, 1)'), Math.E - 1, 1e-12);
	close(calc('integral(1/sqrt(x), 0, 1)'), 2, 1e-6); // endpoint singularity
	close(calc('integral(4/(1+x^2), 0, 1)'), Math.PI, 1e-12);
	close(calc('integral(x, 1, 0)'), -0.5);
});

test('sum and product', () => {
	assert.equal(calc('sum(x, 1, 100)'), 5050);
	assert.equal(calc('sum(x^2, 1, 10)'), 385);
	assert.equal(calc('prod(x, 1, 5)'), 120);
	assert.throws(() => calc('sum(x, 1.5, 3)'));
});

test('X inside d/dx, ∫, Σ, ∏ is bound; other variables are free', () => {
	assert.deepEqual(freeVars(parse(textToTokens('integral(x*a, 0, b)+y'))), ['A', 'B', 'Y']);
	assert.deepEqual(freeVars(parse(textToTokens('x^2-2=0'))), ['X']);
});

test('solve', () => {
	const solveText = (text: string, guess = 1) => {
		const c = ctx();
		c.vars.X = guess;
		return solveFor(parse(textToTokens(text)), 'X', c);
	};
	close(solveText('x^2=2').root, Math.SQRT2, 1e-14);
	close(solveText('x^2=2', -1).root, -Math.SQRT2, 1e-14);
	close(solveText('cos(x)=x').root, 0.739085133215161, 1e-13);
	close(solveText('x^3-x-1').root, 1.32471795724475, 1e-13); // no "=" means "= 0"
	close(solveText('e^x=10', 0).root, Math.log(10), 1e-13);
	close(solveText('x^2=0', 3).root, 0, 1e-6); // double root: no sign change
	assert.throws(() => solveText('x^2=-1'), /Can't Solve/);
});

test('LaTeX for calculus', () => {
	assert.equal(toLatex(parse(textToTokens('integral(x^2,0,1)'))), '\\int_{0}^{1}{X}^{2}\\,dX');
	assert.equal(toLatex(parse(textToTokens('x^2=2'))), '{X}^{2}=2');
});

test('argument hints', () => {
	const toks = textToTokens('integral(x,');
	assert.equal(hintAt(toks, toks.length), '∫(f(X), from, to)');
	assert.equal(hintAt(toks, 0), null);
});

const key = (id: string): KeyDef => {
	const k = [...FUNCTION_KEYS, ...NUMBER_KEYS].find((x) => x.id === id);
	if (!k) throw new Error(`no key ${id}`);
	return k;
};
const press = (c: Calculator, ...ids: string[]) => ids.forEach((id) => c.pressKey(key(id)));

test('CALC asks for each variable, then evaluates', () => {
	const c = new Calculator();
	press(c, 'alpha', 'neg', 'x', 'add', 'd1', 'calc'); // A·X+1, CALC
	assert.equal(c.phase, 'prompt');
	assert.equal(c.promptLabel(), 'A?');
	press(c, 'd3', 'eq'); // A = 3
	assert.equal(c.promptLabel(), 'X?');
	press(c, 'd4', 'eq'); // X = 4
	assert.equal(c.phase, 'result');
	assert.equal(c.result?.value, 13);
	press(c, 'calc'); // again, keeping values with plain =
	press(c, 'eq', 'd5', 'eq');
	assert.equal(c.result?.value, 16);
});

test('SOLVE finds X and stores it; = solves again', () => {
	const c = new Calculator();
	press(c, 'x', 'sq', 'alpha', 'calc', 'd2', 'shift', 'calc'); // X²=2, SOLVE
	assert.equal(c.promptLabel(), 'X?');
	press(c, 'd1', 'eq'); // guess 1
	assert.equal(c.phase, 'result');
	close(c.result!.value, Math.SQRT2, 1e-14);
	close(c.mem.vars.X, Math.SQRT2, 1e-14);
	assert.equal(c.result?.note, 'X =');
	assert.match(c.result?.extra ?? '', /^L−R = 0/);
	press(c, 'eq'); // re-solve prompts again
	assert.equal(c.phase, 'prompt');
	press(c, 'neg', 'd1', 'eq');
	close(c.result!.value, -Math.SQRT2, 1e-14);
});

test('assignment with = and AC cancels a prompt', () => {
	const c = new Calculator();
	press(c, 'alpha', 'sin', 'alpha', 'calc', 'd7', 'eq'); // D=7
	assert.equal(c.mem.vars.D, 7);
	assert.equal(c.result?.note, '→ D');
	press(c, 'ac', 'x', 'add', 'd1', 'calc', 'ac');
	assert.equal(c.phase, 'edit');
	assert.equal(c.tokens.length, 3); // expression restored
});

test('keyboard typing: "=" types an equals sign, Enter evaluates', () => {
	const type = (c: Calculator, s: string) => { for (const ch of s) c.typeKey(ch); };
	const c = new Calculator();
	type(c, '2+2=');
	c.typeKey('Enter'); // trailing "=" is ignored
	assert.equal(c.result?.value, 4);
	type(c, 'a=5');
	c.typeKey('Enter');
	assert.equal(c.mem.vars.A, 5);
	c.typeKey('Escape');
	type(c, 'x^2=2');
	c.run({ a: 'solve' });
	type(c, '1=');  // in a prompt, "=" submits
	close(c.result!.value, Math.SQRT2, 1e-14);
	type(c, 'sin(90)+integral(x,0,2)'); // default angle mode is DEG
	c.typeKey('Enter');
	assert.equal(c.result?.value, 3);
});

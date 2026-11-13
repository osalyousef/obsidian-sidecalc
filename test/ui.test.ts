import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Calculator, defaultMemory } from '../src/calculator.ts';
import { evaluate } from '../src/engine/evaluate.ts';
import { graphFor, plot } from '../src/engine/graph.ts';
import { parse } from '../src/engine/parser.ts';
import { textToTokens } from '../src/engine/tokens.ts';

const ctx = () => ({ angle: 'rad' as const, vars: defaultMemory().vars, ans: 0, preAns: 0 });
const node = (s: string) => parse(textToTokens(s));
const type = (c: Calculator, s: string) => { for (const ch of s) c.typeKey(ch); };

test('integrals with end-point singularities', () => {
	const v = (s: string) => evaluate(node(s), ctx());
	assert.equal(v('integral(1/sqrt(x),0,1)'), 2);
	assert.equal(v('integral(x^(-0.9),0,1)'), 10);
	assert.equal(v('integral(ln(x),0,1)'), -1);
});

test('graphs for ∫, d/dx, Σ and SOLVE; none for plain sums', () => {
	assert.equal(graphFor(node('2+3'), ctx()), null);
	const area = graphFor(node('integral(x^2,0,1)'), ctx());
	assert.equal(area?.kind, 'area');
	const p = plot(area!)!;
	assert.ok(p.x[0] < 0 && p.x[1] > 1, 'window pads the interval');
	assert.ok(p.y[0] <= 0 && p.y[1] >= 1, 'window shows y = 0 and the curve');
	const tan = graphFor(node('ddx(x^3,2)'), ctx());
	assert.deepEqual(tan?.kind === 'tangent' && [tan.x0, tan.y0, Math.round(tan.slope)], [2, 8, 12]);
	assert.equal(graphFor(node('sum(x,1,500)'), ctx()), null); // too many terms to draw
	const root = graphFor(node('x^2=2'), ctx(), { name: 'X', root: Math.SQRT2 });
	assert.ok(root?.kind === 'root' && Math.abs(root.f(Math.SQRT2)) < 1e-12);
});

test('plot breaks the line at poles', () => {
	const p = plot({ kind: 'root', f: (x) => Math.tan(x), root: 0, label: 'X' })!;
	assert.ok(p.points.some(([, y]) => Number.isNaN(y)));
});

test('results carry a graph after ∫ and SOLVE', () => {
	const c = new Calculator();
	c.setAngle('rad');
	type(c, 'integral(x,0,2)');
	c.typeKey('Enter');
	assert.equal(c.result?.graph?.kind, 'area');
	type(c, '5+5');
	c.typeKey('Enter');
	assert.equal(c.result?.graph, null);
});

test('live preview while typing', () => {
	const c = new Calculator();
	type(c, '12');
	assert.equal(c.livePreview(), null); // a lone number is not worth repeating
	type(c, '*3');
	assert.equal(c.livePreview(), 36);
	type(c, '+(');
	assert.equal(c.livePreview(), null); // incomplete
	type(c, '1');
	assert.equal(c.livePreview(), 37); // missing ")" is closed automatically
	c.typeKey('Escape');
	type(c, 'ran#+1');
	assert.equal(c.livePreview(), null);
	c.typeKey('Escape');
	type(c, 'a=5');
	assert.equal(c.livePreview(), null);
	assert.equal(c.mem.vars.A, 0, 'preview never assigns');
});

test('editing after = does not change the saved history entry', () => {
	const c = new Calculator();
	type(c, '1/5');
	c.typeKey('Enter');
	c.typeKey('ArrowLeft'); // back to editing the same expression
	c.typeKey('Backspace');
	c.typeKey('Backspace');
	c.typeKey('Escape');
	assert.equal(c.mem.history.length, 1);
	assert.equal(c.mem.history[0]!.tokens.length, 3);
	// Entries already emptied by the old bug are dropped on load.
	const mem = defaultMemory();
	mem.history = [{ tokens: [], value: 0.2 }];
	assert.equal(new Calculator(mem).mem.history.length, 0);
});

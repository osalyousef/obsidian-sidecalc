import type { Action, KeyDef } from '../calculator.ts';
import type { FnName, VarName } from '../engine/tokens.ts';

const fn = (v: FnName): Action => ({ a: 'insert', tok: { k: 'fn', v } });
const v = (name: VarName): Action => ({ a: 'var', v: name });
const digit = (d: string): KeyDef => ({ id: `d${d}`, label: d, main: { a: 'insert', tok: { k: 'd', v: d } }, cls: 'num' });

/** Function keys: 6 columns. Labels above a key show its SHIFT (left) and ALPHA (right) layers. */
export const FUNCTION_KEYS: KeyDef[] = [
	{ id: 'shift', label: 'SHIFT', main: { a: 'shift' }, cls: 'mod-shift' },
	{ id: 'alpha', label: 'ALPHA', main: { a: 'alpha' }, cls: 'mod-alpha' },
	{ id: 'left', label: '◀', main: { a: 'left' }, cls: 'nav' },
	{ id: 'right', label: '▶', main: { a: 'right' }, cls: 'nav' },
	{ id: 'up', label: '▲', main: { a: 'up' }, cls: 'nav' },
	{ id: 'down', label: '▼', main: { a: 'down' }, cls: 'nav' },

	{ id: 'calc', label: 'CALC', main: { a: 'calc' }, shift: { a: 'solve' }, shiftLabel: 'SOLVE', alpha: { a: 'insert', tok: { k: 'eqsign' } }, alphaLabel: '=' },
	{ id: 'integ', label: '∫dx', main: fn('integ'), shift: fn('ddx'), shiftLabel: 'd/dx' },
	{ id: 'sum', label: 'Σ', main: fn('sum'), shift: fn('prod'), shiftLabel: '∏' },
	{ id: 'x', label: 'X', main: v('X'), alpha: v('X'), shift: v('Y'), shiftLabel: 'Y' },
	{ id: 'inv', label: 'x⁻¹', main: { a: 'insert', tok: { k: 'post', v: 'inv' } } },
	{ id: 'logab', label: 'logₐb', main: fn('logab') },

	{ id: 'frac', label: '▭⁄▭', main: { a: 'insert', tok: { k: 'frac' } }, shift: { a: 'insert', tok: { k: 'ifx', v: 'mod' } }, shiftLabel: 'mod' },
	{ id: 'sqrt', label: '√▭', main: fn('sqrt'), shift: fn('cbrt'), shiftLabel: '∛▭' },
	{ id: 'sq', label: 'x²', main: { a: 'insert', tok: { k: 'post', v: 'sq' } }, shift: { a: 'insert', tok: { k: 'post', v: 'cube' } }, shiftLabel: 'x³' },
	{ id: 'pow', label: 'xʸ', main: { a: 'insert', tok: { k: 'pow' } }, shift: { a: 'insert', tok: { k: 'xroot' } }, shiftLabel: 'ˣ√▭' },
	{ id: 'log', label: 'log', main: fn('log'), shift: fn('pow10'), shiftLabel: '10ˣ' },
	{ id: 'ln', label: 'ln', main: fn('ln'), shift: fn('exp'), shiftLabel: 'eˣ' },

	{ id: 'neg', label: '(−)', main: { a: 'insert', tok: { k: 'neg' } }, alpha: v('A'), alphaLabel: 'A' },
	{ id: 'dms', label: '° ′ ″', main: { a: 'dms' }, shift: { a: 'insert', tok: { k: 'post', v: 'fact' } }, shiftLabel: 'x!', alpha: v('B'), alphaLabel: 'B' },
	{ id: 'hyp', label: 'hyp', main: { a: 'hyp' }, shift: fn('abs'), shiftLabel: '|x|', alpha: v('C'), alphaLabel: 'C' },
	{ id: 'sin', label: 'sin', main: { a: 'trig', fn: 'sin', inv: false }, shift: { a: 'trig', fn: 'sin', inv: true }, shiftLabel: 'sin⁻¹', alpha: v('D'), alphaLabel: 'D' },
	{ id: 'cos', label: 'cos', main: { a: 'trig', fn: 'cos', inv: false }, shift: { a: 'trig', fn: 'cos', inv: true }, shiftLabel: 'cos⁻¹', alpha: v('E'), alphaLabel: 'E' },
	{ id: 'tan', label: 'tan', main: { a: 'trig', fn: 'tan', inv: false }, shift: { a: 'trig', fn: 'tan', inv: true }, shiftLabel: 'tan⁻¹', alpha: v('F'), alphaLabel: 'F' },

	{ id: 'rcl', label: 'RCL', main: { a: 'panel', panel: 'vars' }, shift: { a: 'sto' }, shiftLabel: 'STO' },
	{ id: 'eng', label: 'ENG', main: { a: 'eng', dir: 1 }, shift: { a: 'eng', dir: -1 }, shiftLabel: '←ENG' },
	{ id: 'lp', label: '(', main: { a: 'insert', tok: { k: 'lp' } }, shift: { a: 'insert', tok: { k: 'post', v: 'pct' } }, shiftLabel: '%' },
	{ id: 'rp', label: ')', main: { a: 'insert', tok: { k: 'rp' } }, shift: { a: 'insert', tok: { k: 'comma' } }, shiftLabel: ',', alpha: v('X'), alphaLabel: 'X' },
	{ id: 'sd', label: 'S⇔D', main: { a: 'sd' }, alpha: v('Y'), alphaLabel: 'Y' },
	{ id: 'mplus', label: 'M+', main: { a: 'mem', sign: 1 }, shift: { a: 'mem', sign: -1 }, shiftLabel: 'M−', alpha: v('M'), alphaLabel: 'M' },
];

/** Number pad: 5 columns. */
export const NUMBER_KEYS: KeyDef[] = [
	digit('7'), digit('8'), digit('9'),
	{ id: 'del', label: '⌫', main: { a: 'del' }, cls: 'clear' },
	{ id: 'ac', label: 'AC', main: { a: 'ac' }, shift: { a: 'clearAll' }, shiftLabel: 'CLR all', cls: 'clear' },

	digit('4'), digit('5'), digit('6'),
	{ id: 'mul', label: '×', main: { a: 'insert', tok: { k: 'op', v: '*' } }, shift: { a: 'insert', tok: { k: 'ifx', v: 'P' } }, shiftLabel: 'nPr', alpha: fn('gcd'), alphaLabel: 'GCD', cls: 'op' },
	{ id: 'div', label: '÷', main: { a: 'insert', tok: { k: 'op', v: '/' } }, shift: { a: 'insert', tok: { k: 'ifx', v: 'C' } }, shiftLabel: 'nCr', alpha: fn('lcm'), alphaLabel: 'LCM', cls: 'op' },

	digit('1'), digit('2'), digit('3'),
	{ id: 'add', label: '+', main: { a: 'insert', tok: { k: 'op', v: '+' } }, shift: fn('ceil'), shiftLabel: 'Ceil', alpha: fn('int'), alphaLabel: 'Int', cls: 'op' },
	{ id: 'sub', label: '−', main: { a: 'insert', tok: { k: 'op', v: '-' } }, shift: fn('floor'), shiftLabel: 'Floor', cls: 'op' },

	{ ...digit('0'), shift: { a: 'copy' }, shiftLabel: 'Copy' },
	{ id: 'dot', label: '.', main: { a: 'insert', tok: { k: 'dot' } }, shift: { a: 'insert', tok: { k: 'ran' } }, shiftLabel: 'Ran#', alpha: fn('ranint'), alphaLabel: 'RanInt', cls: 'num' },
	{ id: 'e10', label: '×10ˣ', main: { a: 'insert', tok: { k: 'e10' } }, shift: { a: 'insert', tok: { k: 'c', v: 'pi' } }, shiftLabel: 'π', alpha: { a: 'insert', tok: { k: 'c', v: 'e' } }, alphaLabel: 'e', cls: 'num' },
	{ id: 'ans', label: 'Ans', main: { a: 'insert', tok: { k: 'ans' } }, shift: { a: 'insert', tok: { k: 'preans' } }, shiftLabel: 'PreAns', cls: 'op' },
	{ id: 'eq', label: '=', main: { a: 'equals' }, shift: { a: 'panel', panel: 'history' }, shiftLabel: 'History', cls: 'op eq' },
];

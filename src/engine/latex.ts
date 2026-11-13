import type { Node } from './parser.ts';

const FN_TEX: Record<string, string> = {
	sin: '\\sin', cos: '\\cos', tan: '\\tan',
	asin: '\\sin^{-1}', acos: '\\cos^{-1}', atan: '\\tan^{-1}',
	sinh: '\\sinh', cosh: '\\cosh', tanh: '\\tanh',
	asinh: '\\sinh^{-1}', acosh: '\\cosh^{-1}', atanh: '\\tanh^{-1}',
	log: '\\log', ln: '\\ln',
	int: '\\operatorname{Int}', gcd: '\\operatorname{GCD}', lcm: '\\operatorname{LCM}',
	ranint: '\\operatorname{RanInt}',
};

/** Render a parsed expression as LaTeX for MathJax. */
export function toLatex(n: Node): string {
	switch (n.t) {
		case 'num':
			return n.exp !== undefined ? `${n.mant}\\times10^{${n.exp}}` : n.mant;
		case 'dms': {
			let s = `${n.d || '0'}^{\\circ}`;
			if (n.m !== undefined) s += `${n.m}'`;
			if (n.s !== undefined) s += `${n.s}''`;
			return s;
		}
		case 'const':
			return n.name === 'pi' ? '\\pi' : 'e';
		case 'var':
			return n.name;
		case 'sym':
			return n.name === 'ans' ? '\\mathrm{Ans}' : n.name === 'preans' ? '\\mathrm{PreAns}' : '\\mathrm{Ran\\#}';
		case 'group':
			return `\\left(${toLatex(n.inner)}\\right)`;
		case 'neg':
			return `-${toLatex(n.arg)}`;
		case 'post': {
			const base = wrapBase(n.arg);
			switch (n.op) {
				case 'sq': return `${base}^{2}`;
				case 'cube': return `${base}^{3}`;
				case 'inv': return `${base}^{-1}`;
				case 'fact': return `${base}!`;
				case 'pct': return `${base}\\%`;
			}
			return base;
		}
		case 'bin': {
			const l = toLatex(n.l);
			const r = toLatex(n.r);
			switch (n.op) {
				case '+': return `${l}+${r}`;
				case '-': return `${l}-${r}`;
				case '*': return `${l}\\times ${r}`;
				case '/': return `${l}\\div ${r}`;
				case 'mod': return `${l}\\bmod ${r}`;
				case 'P': return `${l}\\mathrm{P}${r}`;
				case 'C': return `${l}\\mathrm{C}${r}`;
				case 'imp': return `{${l}}{${r}}`;
				case 'frac': return `\\frac{${toLatex(strip(n.l))}}{${toLatex(strip(n.r))}}`;
				case 'pow': return `${wrapBase(n.l)}^{${toLatex(strip(n.r))}}`;
				case 'root': return `\\sqrt[${toLatex(strip(n.l))}]{${toLatex(strip(n.r))}}`;
			}
			return `${l}${r}`;
		}
		case 'eq':
			return `${toLatex(n.l)}=${toLatex(n.r)}`;
		case 'call': {
			const args = n.args.map(toLatex);
			const a0 = toLatex(strip(n.args[0]!));
			switch (n.fn) {
				case 'sqrt': return `\\sqrt{${a0}}`;
				case 'cbrt': return `\\sqrt[3]{${a0}}`;
				case 'abs': return `\\left|${a0}\\right|`;
				case 'exp': return `e^{${a0}}`;
				case 'pow10': return `10^{${a0}}`;
				case 'floor': return `\\left\\lfloor ${a0}\\right\\rfloor`;
				case 'ceil': return `\\left\\lceil ${a0}\\right\\rceil`;
				case 'logab':
					return `\\log_{${toLatex(strip(n.args[0]!))}}\\left(${args[1]}\\right)`;
				case 'ddx':
					return `\\left.\\frac{d}{dX}\\left(${a0}\\right)\\right|_{X=${args[1]}}`;
				case 'integ':
					return `\\int_{${args[1]}}^{${args[2]}}${a0}\\,dX`;
				case 'sum':
					return `\\sum_{X=${args[1]}}^{${args[2]}}\\left(${a0}\\right)`;
				case 'prod':
					return `\\prod_{X=${args[1]}}^{${args[2]}}\\left(${a0}\\right)`;
				case 'log':
					if (args.length === 2) return `\\log_{${toLatex(strip(n.args[0]!))}}\\left(${args[1]}\\right)`;
					break;
			}
			return `${FN_TEX[n.fn] ?? `\\operatorname{${n.fn}}`}\\left(${args.join(',')}\\right)`;
		}
	}
}

/** Drop redundant outer brackets where the layout already groups (fractions, roots, exponents). */
function strip(n: Node): Node {
	return n.t === 'group' ? strip(n.inner) : n;
}

function wrapBase(n: Node): string {
	const atomic =
		(n.t === 'num' && n.exp === undefined && !n.mant.startsWith('-')) ||
		n.t === 'const' || n.t === 'var' || n.t === 'sym' || n.t === 'group' || n.t === 'call';
	return atomic ? `{${toLatex(n)}}` : `{\\left(${toLatex(n)}\\right)}`;
}

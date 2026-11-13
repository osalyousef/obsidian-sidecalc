// Calculator state machine: editing, evaluation, result display modes, memory.
// No Obsidian or DOM imports, so it can be unit-tested directly.

import { CalcMathError, evaluate, evaluateStatement, freeVars, solveFor } from './engine/evaluate.ts';
import type { AngleMode } from './engine/evaluate.ts';
import { DEFAULT_FORMAT, engStart, findExact, formatDecimal, formatDms, formatEng, formatExact } from './engine/format.ts';
import type { FormatOptions, Rendered } from './engine/format.ts';
import { graphFor } from './engine/graph.ts';
import type { GraphSpec } from './engine/graph.ts';
import { toLatex } from './engine/latex.ts';
import { CalcSyntaxError, parse } from './engine/parser.ts';
import { charToToken, textToTokens, tokensToText, VAR_NAMES } from './engine/tokens.ts';
import type { FnName, Tok, VarName } from './engine/tokens.ts';

export type DisplayMode = 'math' | 'line';

export interface HistoryEntry {
	tokens: Tok[];
	value: number;
}

/** Everything that survives a restart. */
export interface CalcMemory {
	ans: number;
	preAns: number;
	vars: Record<VarName, number>;
	history: HistoryEntry[];
	angle: AngleMode;
	display: DisplayMode;
}

export function defaultMemory(): CalcMemory {
	return {
		ans: 0,
		preAns: 0,
		vars: Object.fromEntries(VAR_NAMES.map((v) => [v, 0])) as Record<VarName, number>,
		history: [],
		angle: 'deg',
		display: 'math',
	};
}

export type Action =
	| { a: 'insert'; tok: Tok }
	| { a: 'trig'; fn: 'sin' | 'cos' | 'tan'; inv: boolean }
	| { a: 'var'; v: VarName }
	| { a: 'shift' } | { a: 'alpha' } | { a: 'hyp' }
	| { a: 'left' } | { a: 'right' } | { a: 'up' } | { a: 'down' }
	| { a: 'del' } | { a: 'ac' } | { a: 'clearAll' } | { a: 'equals' }
	| { a: 'sd' } | { a: 'eng'; dir: 1 | -1 } | { a: 'dms' }
	| { a: 'sto' } | { a: 'mem'; sign: 1 | -1 }
	| { a: 'panel'; panel: 'history' | 'vars' }
	| { a: 'copy' } | { a: 'insertNote' }
	| { a: 'calc' } | { a: 'solve' };

export interface KeyDef {
	id: string;
	label: string;
	main: Action;
	shift?: Action;
	shiftLabel?: string;
	alpha?: Action;
	alphaLabel?: string;
	cls?: string;
}

export interface ResultState {
	value: number;
	tokens: Tok[];
	exact: boolean; // showing 3/4 rather than 0.75
	eng: number | null; // engineering exponent, when ENG is active
	dms: boolean;
	note?: string; // e.g. "→A" after STO
	extra?: string; // second line, e.g. "L−R = 0" after SOLVE
	solved?: boolean; // pressing = again re-runs SOLVE
	graph?: GraphSpec | null; // picture for ∫, d/dx, Σ, ∏ and SOLVE
}

/** CALC / SOLVE asking for variable values one at a time. */
export interface PromptState {
	kind: 'calc' | 'solve';
	expr: Tok[];
	vars: VarName[];
	index: number;
	solveVar?: VarName;
	error?: string;
}

export type CalcEvent =
	| { type: 'panel'; panel: 'history' | 'vars' }
	| { type: 'copy'; text: string }
	| { type: 'insertNote'; text: string; latex: string; expression: string; expressionLatex: string }
	| { type: 'notice'; message: string };

const MAX_TOKENS = 199;
const MAX_HISTORY = 100;
// Keys that continue from the previous answer ("Ans+…") instead of starting over.
const CONTINUES: Tok['k'][] = ['op', 'post', 'pow', 'caret', 'xroot', 'frac', 'ifx'];

export class Calculator {
	mem: CalcMemory;
	fmt: FormatOptions = DEFAULT_FORMAT;
	tokens: Tok[] = [];
	cursor = 0;
	phase: 'edit' | 'result' | 'error' | 'prompt' = 'edit';
	prompt: PromptState | null = null;
	result: ResultState | null = null;
	error: { message: string; pos: number } | null = null;
	shift = false;
	alpha = false;
	hyp = false;
	pendingSto = false;
	historyIndex: number | null = null;

	onChange: () => void = () => {};
	onPersist: () => void = () => {};
	onEvent: (e: CalcEvent) => void = () => {};

	constructor(mem: CalcMemory = defaultMemory()) {
		this.mem = mem;
		// Entries emptied by an earlier bug (history shared its token list with the screen).
		mem.history = mem.history.filter((e) => e.tokens.length > 0);
	}

	// ---- Input ----

	pressKey(key: KeyDef): void {
		let action = key.main;
		if (this.pendingSto && key.alpha?.a === 'var') action = key.alpha;
		else if (this.shift && key.shift) action = key.shift;
		else if (this.alpha && key.alpha) action = key.alpha;
		// A key without the active layer falls through to its main action.
		this.run(action);
	}

	run(action: Action): void {
		const wasModifier = action.a === 'shift' || action.a === 'alpha';
		if (!wasModifier) {
			this.shift = false;
			this.alpha = false;
		}
		if (this.pendingSto && action.a !== 'var') this.pendingSto = false;
		if (this.phase === 'prompt' && this.promptAction(action)) {
			this.onChange();
			return;
		}
		switch (action.a) {
			case 'shift': this.shift = !this.shift; this.alpha = false; break;
			case 'alpha': this.alpha = !this.alpha; this.shift = false; break;
			case 'hyp': this.hyp = !this.hyp; break;
			case 'insert': this.insert(action.tok); break;
			case 'trig': this.trig(action.fn, action.inv); break;
			case 'var':
				if (this.pendingSto) this.store(action.v);
				else this.insert({ k: 'var', v: action.v });
				break;
			case 'left': this.move(-1); break;
			case 'right': this.move(1); break;
			case 'up': this.recall(-1); break;
			case 'down': this.recall(1); break;
			case 'del': this.del(); break;
			case 'ac': this.clear(); break;
			case 'clearAll': this.clearAll(); break;
			case 'equals': this.equals(); break;
			case 'sd': this.toggleSD(); break;
			case 'eng': this.eng(action.dir); break;
			case 'dms': this.dms(); break;
			case 'sto':
				this.pendingSto = true;
				break;
			case 'mem': this.memory(action.sign); break;
			case 'panel': this.onEvent({ type: 'panel', panel: action.panel }); break;
			case 'copy': this.copy(); break;
			case 'insertNote': this.insertNote(); break;
			case 'calc': this.startPrompt('calc'); break;
			case 'solve': this.startPrompt('solve'); break;
		}
		this.onChange();
	}

	/** Keyboard input. Returns true when the key was used. */
	typeKey(key: string): boolean {
		switch (key) {
			case 'Enter': this.run({ a: 'equals' }); return true;
			case '=':
				// While editing, "=" types an equals sign (for SOLVE and A=5); a trailing
				// one is ignored, so "2+2=" then Enter still works. Elsewhere it evaluates.
				if (this.phase === 'edit') this.run({ a: 'insert', tok: { k: 'eqsign' } });
				else this.run({ a: 'equals' });
				return true;
			case 'Backspace': this.run({ a: 'del' }); return true;
			case 'Escape': case 'Delete': this.run({ a: 'ac' }); return true;
			case 'ArrowLeft': this.run({ a: 'left' }); return true;
			case 'ArrowRight': this.run({ a: 'right' }); return true;
			case 'ArrowUp': this.run({ a: 'up' }); return true;
			case 'ArrowDown': this.run({ a: 'down' }); return true;
		}
		if (key.length !== 1) return false;
		const tok = charToToken(key);
		if (!tok) return false;
		this.run({ a: 'insert', tok });
		return true;
	}

	pasteText(text: string): void {
		const toks = textToTokens(text);
		if (!toks.length) return;
		this.startEditing(toks[0]!);
		for (const t of toks) {
			if (this.tokens.length >= MAX_TOKENS) break;
			this.tokens.splice(this.cursor++, 0, t);
		}
		this.onChange();
	}

	/** Leave result/error display before inserting `next`. */
	private startEditing(next: Tok): void {
		if (this.prompt) delete this.prompt.error;
		if (this.phase === 'edit' || this.phase === 'prompt') return;
		const continues = this.phase === 'result' && CONTINUES.includes(next.k);
		this.tokens = continues ? [{ k: 'ans' }] : [];
		this.cursor = this.tokens.length;
		this.phase = 'edit';
		this.result = null;
		this.error = null;
		this.historyIndex = null;
	}

	insert(tok: Tok): void {
		this.startEditing(tok);
		if (this.tokens.length >= MAX_TOKENS) return;
		this.tokens.splice(this.cursor, 0, tok);
		this.cursor++;
	}

	private trig(fn: 'sin' | 'cos' | 'tan', inv: boolean): void {
		const name = `${inv ? 'a' : ''}${fn}${this.hyp ? 'h' : ''}` as FnName;
		this.hyp = false;
		this.insert({ k: 'fn', v: name });
	}

	private move(dir: 1 | -1): void {
		if (this.phase === 'error') {
			this.cursor = Math.min(this.error?.pos ?? this.tokens.length, this.tokens.length);
			this.phase = 'edit';
			this.error = null;
			return;
		}
		if (this.phase === 'result') {
			this.cursor = dir < 0 ? this.tokens.length : 0;
			this.phase = 'edit';
			this.result = null;
			this.historyIndex = null;
			return;
		}
		const n = this.tokens.length + 1;
		this.cursor = (this.cursor + dir + n) % n;
	}

	private recall(dir: 1 | -1): void {
		const canBrowse = this.phase !== 'edit' || this.tokens.length === 0;
		const h = this.mem.history;
		if (!canBrowse || !h.length) return;
		let i = this.historyIndex ?? h.length;
		i += dir;
		if (i < 0) i = 0;
		if (i >= h.length) {
			this.clear();
			return;
		}
		this.historyIndex = i;
		const entry = h[i]!;
		this.tokens = [...entry.tokens];
		this.cursor = this.tokens.length;
		this.phase = 'result';
		this.error = null;
		this.result = this.makeResult(entry.value, this.tokens);
	}

	private del(): void {
		if (this.phase === 'result' || this.phase === 'error') {
			this.move(-1);
		}
		if (this.prompt) delete this.prompt.error;
		if (this.cursor > 0) {
			this.tokens.splice(this.cursor - 1, 1);
			this.cursor--;
		}
	}

	clear(): void {
		this.tokens = [];
		this.cursor = 0;
		this.phase = 'edit';
		this.result = null;
		this.error = null;
		this.hyp = false;
		this.pendingSto = false;
		this.historyIndex = null;
		this.prompt = null;
	}

	private clearAll(): void {
		const { history, angle, display } = this.mem;
		this.mem = { ...defaultMemory(), history, angle, display };
		this.clear();
		this.onPersist();
		this.onEvent({ type: 'notice', message: 'Cleared Ans, memory and variables' });
	}

	// ---- Evaluation ----

	/** Evaluate the current expression. Returns false on error. */
	equals(): boolean {
		if (this.phase === 'error') return false;
		if (!this.tokens.length) return false;
		if (this.phase === 'result' && this.result?.solved) {
			this.startPrompt('solve');
			return false;
		}
		const tokens = [...this.tokens];
		if (tokens.length > 1 && tokens[tokens.length - 1]!.k === 'eqsign' && tokens.filter((t) => t.k === 'eqsign').length === 1) {
			tokens.pop();
			this.tokens = [...tokens];
		}
		let out: { value: number; assign?: VarName };
		let node;
		try {
			node = parse(tokens);
			out = evaluateStatement(node, this.evalContext());
		} catch (e) {
			this.showError(e, tokens);
			return false;
		}
		if (out.assign) this.mem.vars[out.assign] = out.value;
		this.pushAnswer(tokens, out.value);
		if (out.assign) this.result!.note = `→ ${out.assign}`;
		else this.result!.graph = graphFor(node, this.snapshotContext());
		return true;
	}

	private showError(e: unknown, tokens: Tok[]): void {
		this.tokens = tokens;
		this.cursor = tokens.length;
		this.phase = 'error';
		this.result = null;
		this.prompt = null;
		if (e instanceof CalcSyntaxError) this.error = { message: e.message, pos: e.pos };
		else if (e instanceof CalcMathError) this.error = { message: e.message, pos: tokens.length };
		else throw e;
	}

	/** Record a new answer: Ans/PreAns, history, and show it. */
	private pushAnswer(tokens: Tok[], value: number): void {
		this.mem.preAns = this.mem.ans;
		this.mem.ans = value;
		const h = this.mem.history;
		h.push({ tokens: [...tokens], value }); // a copy: editing the screen must not rewrite history
		if (h.length > MAX_HISTORY) h.splice(0, h.length - MAX_HISTORY);
		this.historyIndex = null;
		this.tokens = tokens;
		this.cursor = tokens.length;
		this.phase = 'result';
		this.error = null;
		this.result = this.makeResult(value, tokens);
		this.onPersist();
	}

	// ---- CALC and SOLVE ----

	/** Ask for each variable the expression uses, then evaluate (CALC) or solve (SOLVE). */
	private startPrompt(kind: 'calc' | 'solve'): void {
		const expr = [...(this.phase === 'result' && this.result ? this.result.tokens : this.tokens)];
		if (!expr.length) return;
		let node;
		try {
			node = parse(expr);
		} catch (e) {
			this.showError(e, expr);
			return;
		}
		// For "A=…" under CALC, A is the target, not an input.
		const assigned = kind === 'calc' && node.t === 'eq' && node.l.t === 'var';
		let vars = freeVars(assigned && node.t === 'eq' ? node.r : node);
		let solveVar: VarName | undefined;
		if (kind === 'solve') {
			solveVar = vars.includes('X') ? 'X' : vars[0];
			if (!solveVar) {
				this.showError(new CalcMathError('No variable to solve for'), expr);
				return;
			}
			vars = [...vars.filter((v) => v !== solveVar), solveVar];
		}
		this.result = null;
		this.error = null;
		this.historyIndex = null;
		if (!vars.length) {
			this.tokens = expr;
			this.phase = 'edit';
			this.equals();
			return;
		}
		this.prompt = { kind, expr, vars, index: 0, solveVar };
		this.phase = 'prompt';
		this.tokens = [];
		this.cursor = 0;
	}

	/** Handle keys that mean something different while a prompt is open. */
	private promptAction(action: Action): boolean {
		switch (action.a) {
			case 'equals': this.submitPrompt(); return true;
			case 'ac':
				this.tokens = this.prompt?.expr ?? [];
				this.cursor = this.tokens.length;
				this.prompt = null;
				this.phase = 'edit';
				return true;
			case 'up': case 'down': case 'calc': case 'solve': case 'sd': case 'eng':
			case 'sto': case 'mem': case 'insertNote':
				return true; // ignored while entering a value
			default:
				return false;
		}
	}

	private submitPrompt(): void {
		const p = this.prompt;
		if (!p) return;
		const v = p.vars[p.index]!;
		if (this.tokens.length) {
			try {
				this.mem.vars[v] = evaluate(parse(this.tokens), this.evalContext());
			} catch (e) {
				if (e instanceof CalcSyntaxError || e instanceof CalcMathError) {
					p.error = e.message;
					return;
				}
				throw e;
			}
		}
		p.index++;
		this.tokens = [];
		this.cursor = 0;
		if (p.index < p.vars.length) return;
		this.prompt = null;
		this.tokens = p.expr;
		this.cursor = p.expr.length;
		this.phase = 'edit';
		if (p.kind === 'calc') this.equals();
		else this.runSolve(p.expr, p.solveVar!);
		this.onPersist();
	}

	private runSolve(expr: Tok[], v: VarName): void {
		let out, node;
		try {
			node = parse(expr);
			out = solveFor(node, v, this.evalContext());
		} catch (e) {
			this.showError(e, expr);
			return;
		}
		this.mem.vars[v] = out.root;
		this.pushAnswer(expr, out.root);
		const r = this.result!;
		r.note = `${v} =`;
		r.extra = `L−R = ${formatDecimal(out.residual, this.fmt).text}`;
		r.solved = true;
		r.graph = graphFor(node, this.snapshotContext(), { name: v, root: out.root });
	}

	/**
	 * The answer so far while typing, or null when there is nothing useful to show
	 * (incomplete input, a lone number, random numbers, assignments).
	 */
	livePreview(): number | null {
		if (this.phase !== 'edit' || !this.tokens.length) return null;
		const key = JSON.stringify(this.tokens) + this.mem.angle + this.mem.ans;
		if (key === this.previewKey) return this.previewValue;
		this.previewKey = key;
		this.previewValue = null;
		const toks = this.tokens;
		const plainNumber = toks.every((t) => t.k === 'd' || t.k === 'dot');
		// Ran# and RanInt would change on every keystroke; "=" belongs to SOLVE or assignment.
		const skip = toks.some((t) => t.k === 'ran' || t.k === 'eqsign' || (t.k === 'fn' && t.v === 'ranint')) ||
			tokensToText(toks).includes('ran');
		if (plainNumber || skip) return null;
		try {
			this.previewValue = evaluate(parse(toks), this.evalContext());
		} catch {
			// incomplete or invalid so far: show nothing
		}
		return this.previewValue;
	}
	private previewKey = '';
	private previewValue: number | null = null;

	/** "X?" while a prompt is open. */
	promptLabel(): string | null {
		const p = this.prompt;
		return p ? `${p.vars[p.index]}?` : null;
	}

	/** Current value of the variable being asked for. */
	promptCurrent(): number | null {
		const p = this.prompt;
		return p ? this.mem.vars[p.vars[p.index]!] : null;
	}

	/** A context whose variables will not change under a graph drawn later. */
	private snapshotContext() {
		return { ...this.evalContext(), vars: { ...this.mem.vars } };
	}

	private evalContext() {
		return { angle: this.mem.angle, vars: this.mem.vars, ans: this.mem.ans, preAns: this.mem.preAns };
	}

	private makeResult(value: number, tokens: Tok[]): ResultState {
		const exact = this.mem.display === 'math' && findExact(value) !== null;
		return { value, tokens, exact, eng: null, dms: false };
	}

	/** Make sure a result is on screen, evaluating the input first if needed. */
	private ensureResult(): ResultState | null {
		if (this.phase === 'edit' && this.tokens.length) {
			if (!this.equals()) return null;
		}
		return this.phase === 'result' ? this.result : null;
	}

	private toggleSD(): void {
		const wasEditing = this.phase === 'edit';
		const r = this.ensureResult();
		if (!r) return;
		r.eng = null;
		r.dms = false;
		if (findExact(r.value) === null) {
			r.exact = false;
			return;
		}
		// Straight after "=", S⇔D shows the other form; afterwards it toggles.
		r.exact = wasEditing ? this.mem.display !== 'math' : !r.exact;
	}

	private eng(dir: 1 | -1): void {
		const r = this.ensureResult();
		if (!r) return;
		r.exact = false;
		r.dms = false;
		if (r.eng === null) r.eng = engStart(r.value) + (dir < 0 ? -3 : 0);
		else r.eng += 3 * dir;
	}

	private dms(): void {
		if (this.phase === 'result' && this.result) {
			this.result.dms = !this.result.dms;
			this.result.exact = false;
			this.result.eng = null;
			return;
		}
		this.insert({ k: 'dms' });
	}

	private store(v: VarName): void {
		this.pendingSto = false;
		if (this.phase === 'edit' && this.tokens.length && !this.equals()) return;
		this.mem.vars[v] = this.mem.ans;
		if (this.phase !== 'result' || !this.result) {
			this.phase = 'result';
			this.tokens = [{ k: 'ans' }];
			this.result = this.makeResult(this.mem.ans, this.tokens);
		}
		this.result.note = `→ ${v}`;
		this.onPersist();
	}

	private memory(sign: 1 | -1): void {
		if (this.phase === 'edit' && this.tokens.length && !this.equals()) return;
		if (this.phase === 'error') return;
		this.mem.vars.M = this.mem.vars.M + sign * this.mem.ans;
		if (this.phase !== 'result' || !this.result) {
			this.phase = 'result';
			this.tokens = [{ k: 'ans' }];
			this.result = this.makeResult(this.mem.ans, this.tokens);
		}
		this.result.note = sign > 0 ? 'M+' : 'M−';
		this.onPersist();
	}

	setAngle(angle: AngleMode): void {
		this.mem.angle = angle;
		this.onPersist();
		this.onChange();
	}

	setDisplay(display: DisplayMode): void {
		this.mem.display = display;
		if (this.result) this.result.exact = display === 'math' && findExact(this.result.value) !== null;
		this.onPersist();
		this.onChange();
	}

	loadHistory(index: number): void {
		const entry = this.mem.history[index];
		if (!entry) return;
		this.historyIndex = index;
		this.tokens = [...entry.tokens];
		this.cursor = this.tokens.length;
		this.phase = 'result';
		this.error = null;
		this.result = this.makeResult(entry.value, this.tokens);
		this.onChange();
	}

	clearHistory(): void {
		this.mem.history = [];
		this.historyIndex = null;
		this.onPersist();
		this.onChange();
	}

	// ---- Output ----

	renderValue(r: ResultState): Rendered {
		if (r.dms) return formatDms(r.value);
		if (r.eng !== null) return formatEng(r.value, r.eng, this.fmt);
		if (r.exact) {
			const e = findExact(r.value);
			if (e) return formatExact(e);
		}
		return formatDecimal(r.value, this.fmt);
	}

	/** LaTeX for the current input, or null if it does not parse. */
	inputLatex(): string | null {
		try {
			return toLatex(parse(this.tokens));
		} catch {
			return null;
		}
	}

	private copy(): void {
		const text = this.result ? this.renderValue(this.result).text : tokensToText(this.tokens);
		if (text) this.onEvent({ type: 'copy', text: plainText(text) });
	}

	private insertNote(): void {
		const r = this.ensureResult();
		if (!r) return;
		const v = this.renderValue(r);
		this.onEvent({
			type: 'insertNote',
			text: plainText(v.text),
			latex: v.latex,
			expression: tokensToText(r.tokens),
			expressionLatex: this.inputLatex() ?? tokensToText(r.tokens),
		});
	}
}

/** Text that pastes cleanly: ASCII minus, no thin spaces. */
export function plainText(s: string): string {
	return s.replace(/\u2009/g, '') /* thin space */.replace(/−/g, '-');
}

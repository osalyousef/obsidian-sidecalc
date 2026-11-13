import { defaultMemory } from '../src/calculator.ts';
import { DEFAULT_FORMAT } from '../src/engine/format.ts';
import { SciCalcView } from '../src/ui/view.ts';

// Each frame is one calculator at a typical pane size.
const frames = document.querySelectorAll<HTMLElement>('[data-frame]');
const views: SciCalcView[] = [];
for (const frame of frames) {
	const plugin = {
		data: { memory: defaultMemory() },
		formatOptions: () => DEFAULT_FORMAT,
		requestSave: () => {},
		insertIntoNote: () => {},
	};
	const view = new SciCalcView({} as never, plugin as never);
	frame.appendChild(view.containerEl);
	void view.onOpen();
	views.push(view);
	new ResizeObserver(() => view.onResize()).observe(frame);
}
// For driving the preview from the console: preview.type(0, '2+2'), preview.key(0, 'shift').
(window as any).preview = {
	views,
	type(i: number, s: string) { for (const ch of s) views[i]!.calc.typeKey(ch); },
	enter(i: number) { views[i]!.calc.typeKey('Enter'); },
	key(i: number, id: string) {
		views[i]!.rootEl.querySelector<HTMLElement>(`[data-key="${id}"]`)!.click();
	},
};

// Scenes put each frame in a state worth looking at: ?scene=name
const scenes: Record<string, (p: any) => void> = {
	demo(p) {
		for (const i of [0, 1, 2]) { p.type(i, '12*7'); p.enter(i); p.type(i, 'sqrt(2)+1'); p.enter(i); }
		p.type(0, 'integral(x^2,0,1)'); p.enter(0);
		p.type(1, 'sin(30)+2'); p.key(1, 'shift');
		p.type(2, 'x^2=2'); p.views[2].calc.run({ a: 'solve' }); p.type(2, '1'); p.enter(2);
	},
	graphs(p) {
		p.views[0].calc.setAngle('rad');
		p.views[1].calc.setAngle('rad');
		p.type(0, 'ddx(sin(x),1)'); p.enter(0);
		p.type(1, 'sum(x^2,1,10)'); p.enter(1);
		p.type(2, 'integral(1/sqrt(x),0,1)'); p.enter(2);
	},
	layers(p) {
		for (const i of [0, 1, 2]) { p.type(i, '5+3'); p.enter(i); p.type(i, 'ln(2)'); p.enter(i); p.type(i, '3*(4+'); }
		p.key(0, 'shift'); p.key(1, 'alpha');
	},
};
const scene = new URLSearchParams(location.search).get('scene') ?? 'demo';
setTimeout(() => scenes[scene]?.((window as any).preview), 300);

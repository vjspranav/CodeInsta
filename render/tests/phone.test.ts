import {describe, expect, it} from 'vitest';
import {A, one} from './helpers';
import {heartVisual, normTarget, phoneStateAt, TAP_ARRIVE, TOAST_FRAMES} from '../src/phonestate';

const phoneAt = (visuals: ReturnType<typeof A>[], ms = 3000) => {
	const {tl} = one(visuals, ms);
	const start = tl.scenes[0].phone!.start;
	return {tl, start, at: (f: number) => phoneStateAt(tl.phoneEvents, start, f)};
};

describe('phone.show / phone.feed', () => {
	it('creates the phone scene on the phone layout', () => {
		const {tl} = phoneAt([A({do: 'phone.show'})]);
		expect(tl.scenes[0].layout).toBe('phone-left+board-right');
		expect(tl.scenes[0].phone).toBeTruthy();
	});
	it('loading feed is a skeleton, loaded feed is not', () => {
		const p = phoneAt([A({do: 'phone.show'}), A({do: 'phone.feed', state: 'loading', at: 0.2}), A({do: 'phone.feed', at: 0.8})]);
		const f0 = p.tl.beats[0].start;
		expect(p.at(f0).skeleton).toBe(false);
		expect(p.at(f0 + 30).skeleton).toBe(true);
		expect(p.at(f0 + 85).skeleton).toBe(false);
		expect(p.at(f0 + 85).refreshing).toBeDefined();
	});
});

describe('phone.tap', () => {
	it('heart turns filled within 300 ms of the tap and stays liked', () => {
		const p = phoneAt([A({do: 'phone.tap', target: 'heart'})]);
		const f = p.tl.beats[0].start;
		expect(p.at(f).liked).toBe(false);
		expect(p.at(f + TAP_ARRIVE).liked).toBe(true);
		expect(TAP_ARRIVE / 30).toBeLessThanOrEqual(0.3);
		expect(heartVisual(p.at(f + TAP_ARRIVE + 1))).toBe('filled');
		expect(p.at(f + 80).liked).toBe(true);
	});
	it.each(['like', 'like_button', 'love', 'heart', 'Like'])('target "%s" means the heart', (t) => {
		expect(normTarget(t)).toBe('heart');
		const p = phoneAt([A({do: 'phone.tap', target: t})]);
		expect(p.at(p.tl.beats[0].start + 20).liked).toBe(true);
	});
	it('default target is the heart', () => {
		const p = phoneAt([A({do: 'phone.tap'})]);
		expect(p.at(p.tl.beats[0].start + 20).liked).toBe(true);
	});
	it('double-tap on the photo likes; a second heart tap unlikes', () => {
		const p = phoneAt([A({do: 'phone.tap', target: 'post'}), A({do: 'phone.tap', target: 'heart', at: 0.5})]);
		const f = p.tl.beats[0].start;
		expect(p.at(f + 20).liked).toBe(true);
		expect(p.at(f + 50 + 20).liked).toBe(false);
	});
	it('finger appears during the tap and leaves afterwards', () => {
		const p = phoneAt([A({do: 'phone.tap', target: 'heart'})]);
		const f = p.tl.beats[0].start;
		expect(p.at(f + 3).finger).toBeTruthy();
		expect(p.at(f + 90).finger).toBeUndefined();
	});
	it('refresh tap does not like', () => {
		const p = phoneAt([A({do: 'phone.tap', target: 'refresh'})]);
		expect(p.at(p.tl.beats[0].start + 30).liked).toBe(false);
	});
});

describe('phone.spinner / phone.toast / phone.instant', () => {
	it('spinner replaces the heart until the next phone state', () => {
		const p = phoneAt([A({do: 'phone.tap'}), A({do: 'phone.spinner', at: 0.3}), A({do: 'phone.toast', text: 'oops', at: 0.9})], 6000);
		const f = p.tl.beats[0].start;
		expect(heartVisual(p.at(f + 20))).toBe('filled');
		expect(heartVisual(p.at(f + 60))).toBe('spinner');
		expect(heartVisual(p.at(f + 160))).toBe('spinner');
		expect(p.at(f + 170).spinnerSince).toBeUndefined();
	});
	it('toast shows the exact text for at least 1.2 s and an error toast un-likes', () => {
		const p = phoneAt([A({do: 'phone.tap'}), A({do: 'phone.toast', text: "Couldn't like. Try again.", kind: 'error', at: 0.5})], 3000);
		const f = p.tl.beats[0].start + 45;
		expect(p.at(f - 1).liked).toBe(true);
		for (let k = 0; k <= 36; k++) expect(p.at(f + k).toast?.text).toBe("Couldn't like. Try again.");
		expect(p.at(f + 5).liked).toBe(false);
		expect(p.at(f + TOAST_FRAMES + 12).toast).toBeUndefined();
	});
	it('instant shows the badge label and clears loading', () => {
		const p = phoneAt([A({do: 'phone.show', state: 'loading'}), A({do: 'phone.instant', label: '42 ms', at: 0.4})]);
		const f = p.tl.beats[0].start;
		expect(p.at(f + 5).skeleton).toBe(true);
		expect(p.at(f + 50).skeleton).toBe(false);
		expect(p.at(f + 50).instantLabel).toBe('42 ms');
	});
});

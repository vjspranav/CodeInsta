import {useEffect, useState} from 'react';
import {continueRender, delayRender} from 'remotion';

/**
 * verify.ts support: after layout, measure the DOM and log one "PROBE {json}" line.
 * Only mounted when inputProps.probe is true.
 */
export const Probe: React.FC<{frame: number}> = ({frame}) => {
	const [handle] = useState(() => delayRender('probe'));
	useEffect(() => {
		let done = false;
		const run = () => {
			if (done) return;
			done = true;
			const rect = (el: Element) => {
				const r = el.getBoundingClientRect();
				return {x: r.x, y: r.y, w: r.width, h: r.height};
			};
			const q = <T extends Element>(sel: string) => Array.from(document.querySelectorAll<T>(sel));
			const problems: string[] = [];
			// 1) text containers whose content spills out of their box
			for (const el of q<HTMLElement>('[data-fit]')) {
				if (el.scrollHeight > el.clientHeight + 3 || el.scrollWidth > el.clientWidth + 3) {
					problems.push(`overflow: "${(el.innerText || '').slice(0, 40)}" (${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight})`);
				}
			}
			// 2) any text that sits outside the slot (shell) that owns it, or off screen
			for (const sh of q<HTMLElement>('[data-shell]')) {
				const sr = sh.getBoundingClientRect();
				for (const el of Array.from(sh.querySelectorAll<HTMLElement>('*'))) {
					const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent || '').trim());
					if (!own) continue;
					const r = el.getBoundingClientRect();
					if (r.width === 0 || r.height === 0) continue;
					const cs = getComputedStyle(el);
					if (cs.opacity === '0' || cs.display === 'none') continue;
					const tol = 10;
					if (r.left < sr.left - tol || r.right > sr.right + tol || r.top < sr.top - tol || r.bottom > sr.bottom + tol) {
						problems.push(`text outside its box: "${(el.innerText || '').slice(0, 40)}"`);
					}
				}
			}
			for (const el of q<HTMLElement>('[data-define-line]')) {
				if (el.scrollWidth > el.parentElement!.clientWidth + 2) problems.push(`lower-third line clipped: "${el.innerText.slice(0, 40)}" (${el.scrollWidth} in ${el.parentElement!.clientWidth})`);
			}
			// 3) effective font size (px at 720x1280) and visibility of every label / data text
						const eff = (el: HTMLElement) => {
							let scale = 1;
							let op = 1;
							for (let n: HTMLElement | null = el; n; n = n.parentElement) {
								const cs = getComputedStyle(n);
								op *= parseFloat(cs.opacity);
								// text still being written on (clip-path inset from the right) is not fully drawn yet
								const wo = /^inset\(\s*-?[\d.]+px\s+([\d.]+)%/.exec(cs.clipPath || '');
								if (wo) op *= 1 - parseFloat(wo[1]) / 100;
								if (cs.transform && cs.transform !== 'none') {
									const m = new DOMMatrixReadOnly(cs.transform);
									scale *= Math.hypot(m.a, m.b);
								}
							}
							return {size: parseFloat(getComputedStyle(el).fontSize) * scale, opacity: op};
						};
						const texts = (sel: string, kind: string) =>
							q<HTMLElement>(sel)
								.filter((el) => (el.innerText || '').trim().length > 0)
								.map((el) => {
									const e = eff(el);
									return {kind, text: (el.innerText || '').trim().slice(0, 40), size: e.size, opacity: e.opacity, color: getComputedStyle(el).color, rect: rect(el)};
								});
						const fonts = [...texts('[data-label]', 'label'), ...texts('[data-data]', 'data'), ...texts('[data-cell]', 'cell'), ...texts('[data-code]', 'code')];
						// 4) a word whose glyphs sit on two line boxes was split mid-word (hyphenation / break-all / hard wrap)
									const splits: string[] = [];
									const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
									for (let n = walker.nextNode(); n; n = walker.nextNode()) {
										const tn = n as Text;
										const host = tn.parentElement;
										if (!host || /^(SCRIPT|STYLE)$/.test(host.tagName) || !(tn.textContent || '').trim()) continue;
										const re = /\S+/g;
										const txt = tn.textContent || '';
										for (let m = re.exec(txt); m; m = re.exec(txt)) {
											if (/[-\u2010\u2011\u2013\u2014]/.test(m[0])) continue; // a real hyphen may break there
											const r = document.createRange();
											r.setStart(tn, m.index);
											r.setEnd(tn, m.index + m[0].length);
											const rs = Array.from(r.getClientRects()).filter((x) => x.width > 0.5);
											if (rs.length > 1 && Math.max(...rs.map((x) => x.top)) - Math.min(...rs.map((x) => x.top)) > 3) splits.push(m[0]);
										}
									}
									const capText = q<HTMLElement>('[data-caption-text]')[0];
						const cap = q('[data-caption]')[0];
			// 5) overlay zones (QA gate zones.clear): the real extent of every visible text run, plus the key visuals
			const zoneBoxes: {kind: string; label: string; rect: {x: number; y: number; w: number; h: number}}[] = [];
			for (const el of q<HTMLElement | SVGElement>('body *')) {
				const own = Array.from(el.childNodes).filter((n) => n.nodeType === 3 && (n.textContent || '').trim());
				if (!own.length || /^(SCRIPT|STYLE)$/.test(el.tagName)) continue;
				if (eff(el as HTMLElement).opacity < 0.05) continue;
				const cs = getComputedStyle(el);
				if (cs.display === 'none' || cs.visibility === 'hidden') continue;
				const r = document.createRange();
				let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
				for (const n of own) {
					r.selectNodeContents(n);
					for (const b of Array.from(r.getClientRects())) {
						if (b.width < 0.5 || b.height < 0.5) continue;
						x0 = Math.min(x0, b.left); y0 = Math.min(y0, b.top); x1 = Math.max(x1, b.right); y1 = Math.max(y1, b.bottom);
					}
				}
				if (x1 > x0 && y1 > y0) zoneBoxes.push({kind: 'text', label: (el.textContent || '').trim(), rect: {x: x0, y: y0, w: x1 - x0, h: y1 - y0}});
			}
			for (const [sel, kind] of [['[data-shell]', 'visual'], ['[data-phone]', 'phone'], ['[data-table]', 'table'], ['[data-kit]', 'kit'], ['[data-world]', 'world'], ['[data-heart]', 'heart'], ['[data-spinner]', 'spinner'], ['[data-toast]', 'toast'], ['[data-define]', 'define'], ['[data-avatar]', 'avatar']] as const) {
				for (const el of q<HTMLElement>(sel)) {
					if (eff(el).opacity < 0.05) continue;
					const r = rect(el);
					if (r.w > 0 && r.h > 0) zoneBoxes.push({kind, label: el.getAttribute('data-kid') || el.getAttribute('data-table') || kind, rect: r});
				}
			}
			const lines = q<HTMLElement>('[data-caption] [data-line]');
			const visWords = q<HTMLElement>('[data-caption] [data-word]').filter((w) => parseFloat(getComputedStyle(w).opacity) > 0.5);
			const report = {
				frame,
				caption: cap
				? {
				rect: rect(cap),
				textRect: capText ? rect(capText) : rect(cap),
							lineCount: lines.length,
							visible: visWords.map((w) => w.innerText),
							maxLineWidth: Math.max(0, ...lines.map((l) => l.scrollWidth)),
						}
					: null,
				define: q('[data-define]')[0] ? {rect: rect(q('[data-define]')[0]), lines: q<HTMLElement>('[data-define-line]').map((l) => l.innerText)} : null,
				toast: q<HTMLElement>('[data-toast]')[0]
					? {rect: rect(q('[data-toast]')[0]), text: q<HTMLElement>('[data-toast]')[0].innerText.replace(/^!\s*/, '')}
					: null,
				heart: q('[data-heart]')[0] ? {rect: rect(q('[data-heart]')[0]), state: q('[data-heart]')[0].getAttribute('data-heart-state')} : null,
				spinner: q('[data-spinner]')[0] ? rect(q('[data-spinner]')[0]) : null,
				tables: q<HTMLElement>('[data-table]').map((t) => ({
					id: t.getAttribute('data-table'),
					rect: rect(t),
					rows: q('[data-row]').filter((r) => t.contains(r)).length,
					now: q<HTMLElement>('[data-row]').filter((r) => t.contains(r) && r.getAttribute('data-hl') === 'now').map((r) => Number(r.getAttribute('data-row'))),
					past: q<HTMLElement>('[data-row]').filter((r) => t.contains(r) && r.getAttribute('data-hl') === 'past').map((r) => Number(r.getAttribute('data-row'))),
				})),
				worlds: q<HTMLElement>('[data-world]').map((k) => ({id: k.getAttribute('data-world'), rect: rect(k), text: k.innerText})),
				kits: q<HTMLElement>('[data-kit]').map((k) => ({kind: k.getAttribute('data-kit'), key: k.getAttribute('data-kid'), rect: rect(k), els: k.querySelectorAll('[data-kel]').length, cur: k.querySelectorAll('[data-kcur]').length})),
				text: document.body.innerText,
				fonts,
				splits,
				captionFont: capText ? eff(capText).size : null,
				problems,
				zoneBoxes,
			};
			console.log('PROBE ' + JSON.stringify(report));
			continueRender(handle);
		};
		const id = requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(run, 60)));
		return () => cancelAnimationFrame(id);
	}, [frame, handle]);
	return null;
};

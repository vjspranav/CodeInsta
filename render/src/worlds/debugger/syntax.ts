/** A tiny syntax colouring pass for the debugger's source pane (pure: no React, no colours). */

export type Cls = 'kw' | 'type' | 'str' | 'num' | 'com' | 'pre' | 'fn' | 'id' | 'op';
export interface Tok {
	text: string;
	cls: Cls;
}

export const LANGS = ['c', 'cpp', 'java', 'kotlin', 'rust', 'python', 'ir', 'text'] as const;
export type Lang = (typeof LANGS)[number];

const C_KW = 'if else for while do switch case default break continue return goto sizeof static const extern volatile inline struct union enum typedef register restrict';
const KW: Record<Lang, string> = {
	c: C_KW,
	cpp: `${C_KW} class public private protected namespace template typename new delete this using virtual override nullptr true false try catch throw auto constexpr noexcept`,
	java: 'if else for while do switch case default break continue return class interface extends implements public private protected static final new this super try catch finally throw throws import package null true false void synchronized',
	kotlin: 'if else for while do when break continue return class object interface fun val var override open private public internal import package null true false is in as try catch finally throw',
	rust: 'if else for while loop match break continue return fn let mut pub struct enum impl trait use mod crate self Self const static ref move unsafe where as in true false',
	python: 'if elif else for while break continue return def class import from as with try except finally raise lambda pass None True False and or not in is yield',
	ir: 'define declare ret br switch phi call load store alloca icmp add sub mul sdiv udiv select label entry unreachable to',
	text: '',
};
const TYPES = new Set(
	'int char short long float double void unsigned signed bool size_t ssize_t ptrdiff_t FILE string String i8 i16 i32 i64 u8 u16 u32 u64 usize isize f32 f64 str Int Long Boolean Unit i1 ptr'.split(' ')
);

const kwSet = new Map<Lang, Set<string>>();
const kwOf = (lang: Lang) => {
	let s = kwSet.get(lang);
	if (!s) kwSet.set(lang, (s = new Set(KW[lang].split(' ').filter(Boolean))));
	return s;
};

export const langOf = (v: unknown): Lang => ((LANGS as readonly unknown[]).includes(v) ? (v as Lang) : 'c');

const reFor = (lang: Lang): RegExp => {
	const base = String.raw`\/\/.*|\/\*.*?(?:\*\/|$)`;
	const com = lang === 'python' ? '#.*' : lang === 'ir' ? ';.*' : lang === 'c' || lang === 'cpp' ? `${base}|#.*` : base;
	return new RegExp(String.raw`(${com})|("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?)|(0x[0-9a-fA-F]+|\d+(?:\.\d+)?)|([A-Za-z_@%][\w.$]*)|(\s+)|(.)`, 'g');
};

/** Splits source lines into classified runs. Block comments carry over between lines. */
export const tokenize = (lines: string[], lang: Lang): Tok[][] => {
	const kw = kwOf(lang);
	let inBlock = false;
	return lines.map((line) => {
		const out: Tok[] = [];
		const push = (text: string, cls: Cls) => {
			if (!text) return;
			const last = out[out.length - 1];
			if (last && last.cls === cls && (cls === 'op' || cls === 'id' || cls === 'com')) last.text += text;
			else out.push({text, cls});
		};
		let rest = line;
		if (inBlock) {
			const end = rest.indexOf('*/');
			if (end < 0) {
				push(rest, 'com');
				return out;
			}
			push(rest.slice(0, end + 2), 'com');
			rest = rest.slice(end + 2);
			inBlock = false;
		}
		const RE = reFor(lang);
		let m: RegExpExecArray | null;
		let first = true;
		while ((m = RE.exec(rest))) {
			const [tok, com, str, num, id, ws] = m;
			if (com) {
				if (com.startsWith('/*')) {
					if (!com.endsWith('*/') || com === '/*/') inBlock = !com.slice(2).includes('*/');
					push(com, 'com');
				} else if (com.startsWith('#') && lang !== 'python') push(com, first ? 'pre' : 'com');
				else push(com, 'com');
			} else if (str) push(str, 'str');
			else if (num) push(num, 'num');
			else if (id) {
				const after = rest.slice(m.index + id.length);
				if (kw.has(id)) push(id, 'kw');
				else if (TYPES.has(id) || /_t$/.test(id)) push(id, 'type');
				else if (/^\s*\(/.test(after)) push(id, 'fn');
				else push(id, 'id');
			} else if (ws) push(ws, 'id');
			else push(tok, 'op');
			if (!ws) first = false;
		}
		return out;
	});
};

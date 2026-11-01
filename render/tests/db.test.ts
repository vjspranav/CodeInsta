import {describe, expect, it} from 'vitest';
import {A, one} from './helpers';
import {dbSettleFrame, dbStateAt, prepareDb} from '../src/dbmodel';
import type {Action} from '../src/schema';

const stage = (visuals: Action[], ms = 4000) => {
	const {tl} = one(visuals, ms);
	const item = tl.scenes[0].items.find((i) => i.kind === 'db')!;
	const pre = prepareDb(item.props.events as {frame: number; action: Action}[], item.rect);
	return {tl, item, pre, f0: tl.beats[0].start};
};

const users = A({do: 'db.table', id: 'users', name: 'users', columns: ['id', 'name'], rows: [[42, 'maya'], [7, 'jonah'], [12, 'priya']]});
const rowsOf = (pre: ReturnType<typeof prepareDb>, f: number, id: string) => dbStateAt(pre, f).tables.find((t) => t.id === id)?.rows.length;

describe('db.table', () => {
	it('shows real columns and rows, arriving one by one', () => {
		const s = stage([A({do: 'layout', template: 'db-focus'}), users]);
		expect(s.pre.model.tables[0].cols).toEqual(['id', 'name']);
		expect(rowsOf(s.pre, s.f0 + 2, 'users')).toBe(0);
		expect(rowsOf(s.pre, dbSettleFrame(s.pre, 'users'), 'users')).toBe(3);
		const st = dbStateAt(s.pre, dbSettleFrame(s.pre, 'users')).tables[0];
		expect(st.rows[0]).toEqual(['42', 'maya']);
	});
	it('legacy title/cols names still work', () => {
		const s = stage([A({do: 'db.table', id: 'a', title: 'T', cols: ['x'], rows: [['1']]})]);
		expect(s.pre.model.tables[0].title).toBe('T');
	});
});

describe('db.insert', () => {
	it('adds exactly one row', () => {
		const s = stage([users, A({do: 'db.insert', table: 'users', row: [99, 'zed'], at: 0.5})], 6000);
		const before = s.f0 + 40;
		const after = s.f0 + 90 + 20;
		expect(rowsOf(s.pre, before, 'users')).toBe(3);
		expect(rowsOf(s.pre, after, 'users')).toBe(4);
	});
});

describe('db.shard', () => {
	it('splits rows into N tables by key; row total is preserved and the source disappears', () => {
		const s = stage([users, A({do: 'db.shard', table: 'users', n: 3, by: 'id', at: 0.5})], 6000);
		const f = s.f0 + 90 + 80;
		const st = dbStateAt(s.pre, f);
		const shards = st.tables.filter((t) => t.kind === 'shard');
		expect(shards).toHaveLength(3);
		expect(shards.reduce((n, t) => n + t.rows.length, 0)).toBe(3);
		expect(st.tables.find((t) => t.id === 'users')).toBeUndefined();
		// 42%3=0, 7%3=1, 12%3=0
		expect(shards.map((t) => t.rows.length)).toEqual([2, 1, 0]);
	});
});

describe('db.replicate', () => {
	it('copies every row into n replicas and keeps the primary', () => {
		const s = stage([users, A({do: 'db.replicate', table: 'users', n: 2, at: 0.5})], 6000);
		const st = dbStateAt(s.pre, s.f0 + 90 + 90);
		const reps = st.tables.filter((t) => t.kind === 'replica');
		expect(reps).toHaveLength(2);
		for (const r of reps) expect(r.rows.length).toBe(3);
		expect(st.tables.find((t) => t.id === 'users')!.rows.length).toBe(3);
	});
});

describe('db.fanout', () => {
	it('duplicates one row into one feed table per follower', () => {
		const s = stage([users, A({do: 'db.fanout', table: 'users', row: 0, followers: ['a', 'b', 'c'], at: 0.5})], 6000);
		const st = dbStateAt(s.pre, s.f0 + 90 + 120);
		const feeds = st.tables.filter((t) => t.kind === 'feed');
		expect(feeds).toHaveLength(3);
		for (const f of feeds) expect(f.rows).toEqual([['42', 'maya']]);
		expect(feeds[0].title).toContain('@a');
	});
});

describe('db.join / db.result', () => {
	const join = A({
		do: 'db.join',
		at: 0.1,
		steps: [
			{table: 'users', rows: [0], label: 'user 42'},
			{table: 'follows', rows: [0, 2], label: 'they follow'},
		],
	});
	const follows = A({do: 'db.table', id: 'follows', name: 'follows', columns: ['a', 'b'], rows: [[42, 7], [7, 42], [42, 12]]});
	it('highlights exactly the step rows, one step per ~700 ms', () => {
		const s = stage([users, follows, join], 4000);
		const steps = s.pre.model.joins;
		expect(steps.map((j) => j.frame - steps[0].frame)).toEqual([0, 21]);
		const a = dbStateAt(s.pre, steps[0].frame + 3);
		expect(a.tables.find((t) => t.id === 'users')!.highlighted.now).toEqual([0]);
		expect(a.tables.find((t) => t.id === 'follows')!.highlighted.now).toEqual([]);
		expect(a.joinStep).toMatchObject({i: 0, n: 2, label: 'user 42'});
		const b = dbStateAt(s.pre, steps[1].frame + 3);
		expect(b.tables.find((t) => t.id === 'follows')!.highlighted.now).toEqual([0, 2]);
		expect(b.tables.find((t) => t.id === 'users')!.highlighted.past).toEqual([0]);
		expect(b.tables.find((t) => t.id === 'users')!.highlighted.now).toEqual([]);
		expect(b.joinStep!.label).toBe('they follow');
	});
	it('db.result shows the result rows', () => {
		const s = stage([users, A({do: 'db.result', id: 'res', name: 'feed', columns: ['id', 'caption'], rows: [[1, 'a'], [2, 'b']], at: 0.2})], 6000);
		const st = dbStateAt(s.pre, s.f0 + 200);
		const r = st.tables.find((t) => t.id === 'res')!;
		expect(r.kind).toBe('result');
		expect(r.rows).toEqual([['1', 'a'], ['2', 'b']]);
	});
	it('a join extends the hold so every step is shown before the next line', () => {
		const story = one([users, follows, A({do: 'db.join', at: 0.9, steps: [{table: 'users', rows: [0], label: 'a'}, {table: 'users', rows: [1], label: 'b'}, {table: 'users', rows: [2], label: 'c'}]})], 1500);
		const b = story.tl.beats[0];
		expect(b.holdEnd - b.end).toBeGreaterThan(30);
	});
});

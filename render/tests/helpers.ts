import {installNodeMeasure} from '../measure-node';
import type {Action, AudioManifest, Beat, Story} from '../src/schema';
import {validateStory} from '../src/schema';
import {buildTimeline} from '../src/timeline';

export const mkStory = (beats: Partial<Beat>[], extra: Partial<Story> = {}): Story => {
	const v = validateStory({
		version: 3,
		format: 'story',
		title: 't',
		topic: 't',
		tags: [],
		level: 'beginner',
		cast: [
			{id: 'rookie', name: 'Rookie', role: 'junior', color: '#E4572E'},
			{id: 'senior', name: 'Senior', role: 'senior', color: '#2F6F8F'},
		],
		glossary: [{term: 'POP', full: 'Point of Presence', note: 'a nearby edge server'}],
		beats: beats.map((b) => ({speaker: 'narrator', text: 'A line of speech here.', visuals: [], ...b})),
		...extra,
	});
	if (!v.ok) throw new Error(v.errors.join('; '));
	return v.story;
};

export const mkAudio = (story: Story, ms = 3000): AudioManifest => ({
	lines: story.beats.map((b, i) => ({beat_index: i, speaker: b.speaker, src: `a${i}.wav`, duration_ms: ms})),
});

/** One-beat story whose actions all fire at "start" unless they set `at`. */
export const one = (visuals: Action[], ms = 3000, extra: Partial<Story> = {}) => {
	const story = mkStory([{visuals}], extra);
	return {story, tl: buildTimeline(story, mkAudio(story, ms))};
};

export const A = (a: Record<string, unknown>) => a as unknown as Action;

installNodeMeasure();

// Diagnostic: pull recent tournament events from the public
// NOSTR relays and dump their `content` so we can confirm
// whether `type` is being shipped and what `format` value
// the user has been publishing.
import { SimplePool } from 'nostr-tools/pool';

const RELAYS = [
	'wss://relay.damus.io',
	'wss://nos.lol',
	'wss://relay.nostr.band'
];

const pool = new SimplePool();
const since = Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 30; // 30 days
const filter = { kinds: [30001], '#t': ['darts-tournament'], since, limit: 20 };

console.log('filter:', JSON.stringify(filter));
const events = new Map();
const sub = pool.subscribeMany(RELAYS, filter, {
	onevent: (ev) => {
		events.set(ev.id, ev);
	},
	oneose: () => {
		// wait a bit for last stragglers
		setTimeout(() => finish(), 1500);
	}
});

function finish() {
	sub.close();
	pool.close(RELAYS);
	const list = Array.from(events.values()).sort((a, b) => b.created_at - a.created_at);
	console.log(`got ${list.length} unique events`);
	for (const ev of list) {
		let parsed = null;
		try { parsed = JSON.parse(ev.content); } catch (e) { parsed = { _parseError: e.message }; }
		console.log('---');
		console.log('id:', ev.id.slice(0, 16) + '…');
		console.log('created_at:', new Date(ev.created_at * 1000).toISOString());
		console.log('tags:', JSON.stringify(ev.tags));
		console.log('content (parsed):', JSON.stringify(parsed));
	}
	process.exit(0);
}

setTimeout(finish, 8000);

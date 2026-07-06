<script>
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';
	import { P2PChannel } from '$lib/net/p2p.js';

	let mode = $state('menu'); // menu | host | join | connected
	let localCode = $state('');
	let remoteCode = $state('');
	let iceBuffer = $state([]);
	let status = $state('');
	let log = $state([]);

	/** @type {P2PChannel | null} */
	let channel = null;

	function addLog(msg) {
		log = [...log, msg];
		status = msg;
	}

	async function host() {
		mode = 'host';
		channel = new P2PChannel();
		channel.addEventListener('ice', (e) => {
			iceBuffer = [...iceBuffer, e.detail];
		});
		channel.addEventListener('open', () => {
			mode = 'connected';
			addLog('Peer connected');
		});
		channel.addEventListener('message', (e) => {
			addLog(`Remote: ${JSON.stringify(e.detail)}`);
		});
		try {
			const offer = await channel.host();
			localCode = JSON.stringify(offer);
			addLog('Host offer ready. Copy the code to your opponent.');
		} catch (e) {
			addLog(`Host error: ${e.message}`);
		}
	}

	async function startJoin() {
		mode = 'join';
		channel = new P2PChannel();
		channel.addEventListener('ice', (e) => {
			iceBuffer = [...iceBuffer, e.detail];
		});
		channel.addEventListener('open', () => {
			mode = 'connected';
			addLog('Peer connected');
		});
		channel.addEventListener('message', (e) => {
			addLog(`Remote: ${JSON.stringify(e.detail)}`);
		});
	}

	async function submitOffer() {
		if (!channel) return;
		try {
			const offer = JSON.parse(remoteCode);
			const answer = await channel.join(offer);
			localCode = JSON.stringify(answer);
			addLog('Answer ready. Copy it back to the host.');
		} catch (e) {
			addLog(`Join error: ${e.message}`);
		}
	}

	async function submitAnswer() {
		if (!channel) return;
		try {
			const answer = JSON.parse(remoteCode);
			await channel.acceptAnswer(answer);
			addLog('Answer accepted. Connecting…');
		} catch (e) {
			addLog(`Answer error: ${e.message}`);
		}
	}

	async function addRemoteIce() {
		if (!channel || !remoteCode) return;
		try {
			const list = JSON.parse(remoteCode);
			await channel.addIce(list);
			addLog('ICE candidates added.');
		} catch (e) {
			addLog(`ICE error: ${e.message}`);
		}
	}

	function sendTest() {
		if (!channel) return;
		try {
			channel.send({ type: 'ping', t: Date.now() });
			addLog('Sent ping');
		} catch (e) {
			addLog(`Send error: ${e.message}`);
		}
	}

	function back() {
		channel?.close();
		channel = null;
		goto(`${base}/`);
	}

	function copy(text) {
		navigator.clipboard?.writeText(text);
		addLog('Copied to clipboard');
	}

	function reset() {
		channel?.close();
		channel = null;
		mode = 'menu';
		localCode = '';
		remoteCode = '';
		iceBuffer = [];
		status = '';
	}
</script>

<div class="screen">
	<div class="card">
		<div class="card-header">
			<h1>Online match</h1>
			<button class="btn ghost" onclick={back}>Back</button>
		</div>

		{#if mode === 'menu'}
			<p class="muted">Play with a friend over the internet using peer-to-peer connection. No server required — copy/paste the connection code.</p>
			<div class="actions">
				<button class="btn primary" onclick={host}>Host game</button>
				<button class="btn primary" onclick={startJoin}>Join game</button>
			</div>
		{:else if mode === 'host'}
			<p>Copy this offer code and send it to your opponent. Then paste their answer below.</p>
			<textarea class="code" readonly value={localCode}></textarea>
			<div class="row">
				<button class="btn" onclick={() => copy(localCode)}>Copy offer</button>
			</div>
			<label class="field">
				<span>Paste opponent's answer code</span>
				<textarea class="code" bind:value={remoteCode}></textarea>
			</label>
			<div class="row">
				<button class="btn primary" onclick={submitAnswer}>Submit answer</button>
				<button class="btn ghost" onclick={reset}>Reset</button>
			</div>
			{#if iceBuffer.length}
				<p class="muted">Copy ICE candidates to opponent if connection does not establish:</p>
				<textarea class="code" readonly value={JSON.stringify(iceBuffer)}></textarea>
				<button class="btn" onclick={() => copy(JSON.stringify(iceBuffer))}>Copy ICE</button>
			{/if}
		{:else if mode === 'join'}
			<label class="field">
				<span>Paste host's offer code</span>
				<textarea class="code" bind:value={remoteCode}></textarea>
			</label>
			<button class="btn primary" onclick={submitOffer}>Create answer</button>
			{#if localCode}
				<p>Copy this answer code back to the host.</p>
				<textarea class="code" readonly value={localCode}></textarea>
				<div class="row">
					<button class="btn" onclick={() => copy(localCode)}>Copy answer</button>
				</div>
			{/if}
			{#if iceBuffer.length}
				<p class="muted">Copy ICE candidates to host if connection does not establish:</p>
				<textarea class="code" readonly value={JSON.stringify(iceBuffer)}></textarea>
				<button class="btn" onclick={() => copy(JSON.stringify(iceBuffer))}>Copy ICE</button>
			{/if}
			<button class="btn ghost" onclick={reset}>Reset</button>
		{:else if mode === 'connected'}
			<p class="status">Connected to peer.</p>
			<div class="actions">
				<button class="btn primary" onclick={sendTest}>Send ping</button>
				<button class="btn ghost" onclick={reset}>Disconnect</button>
			</div>
		{/if}

		{#if status}
			<div class="log">
				{#each log as l}
					<p>{l}</p>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-md);
		margin-bottom: var(--space-md);
	}
	.actions {
		display: grid;
		gap: var(--space-md);
		margin-top: var(--space-md);
	}
	.row {
		display: flex;
		gap: var(--space-md);
		margin: var(--space-sm) 0;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
		margin: var(--space-md) 0;
	}
	.field span {
		font-size: var(--text-sm);
		color: var(--muted);
	}
	.code {
		background: var(--bg);
		border: 1px solid var(--line);
		border-radius: 10px;
		padding: var(--space-sm);
		font-family: ui-monospace, SFMono-Regular, monospace;
		font-size: var(--text-xs);
		color: var(--text);
		width: 100%;
		min-height: 120px;
		resize: vertical;
	}
	.status {
		color: var(--accent);
		font-weight: 600;
	}
	.log {
		margin-top: var(--space-md);
		padding: var(--space-sm);
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 10px;
		max-height: 160px;
		overflow-y: auto;
		font-size: var(--text-sm);
	}
	.log p { margin: 0; }
	.muted { color: var(--muted); }
</style>

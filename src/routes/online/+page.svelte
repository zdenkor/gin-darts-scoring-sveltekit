<script>
	/**
	 * Online multiplayer lobby. The user creates a session
	 * (the app generates an SDP offer that the partner has
	 * to accept) or joins a session by pasting the partner's
	 * SDP answer.
	 *
	 * Right now the lobby is a placeholder — the
	 * webRTC + QR code exchange is going to land in a
	 * follow-up commit. This page only exists so the
	 * navigation in the Header has somewhere to point and
	 * the user can see that online play is on the roadmap.
	 */
</script>

<div class="screen scrollable">
	<div class="card">
		<div class="card-header">
			<h1>Online</h1>
		</div>
		<p class="muted">
			Play a darts match against someone on a different device, with
			both players seeing the same score and the same leg in real
			time. Connection is direct (peer to peer) — no game server
			sees the darts.
		</p>
		<p class="hint">
			Coming soon. The lobby will let you create a session and share
			its QR code with your opponent, or paste their session code to
			join.
		</p>
	</div>
</div>

<style>
	.card { padding: var(--space-md); }
	.card-header h1 { margin: 0 0 var(--space-sm); }
	.muted { color: var(--muted); }
	.hint {
		font-size: var(--text-sm);
		color: var(--muted);
		margin-top: var(--space-md);
	}
</style>

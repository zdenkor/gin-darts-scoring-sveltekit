<script>
	import { onMount } from 'svelte';
	import { fetchTournaments, parseTournamentEvent, deleteTournament, DEFAULT_RELAYS } from '$lib/nostr/calendar.js';
	import { getStoredKeypair } from '$lib/nostr/identity.js';
	import { deleteCompetition, listChildTournaments } from '$lib/db/competitions.js';
	import { log } from '$lib/debug/logger.js';
	// Bits UI month grid. We use the headless
	// Calendar primitive and lay our own week
	// header on top so the column labels match
	// the rest of the app (Sun-first, English).
	// @internationalized/date gives us a
	// timezone-aware DateValue that the Calendar
	// uses for `placeholder` / `value`.
	import { Calendar } from 'bits-ui';
	import { CalendarDate, getLocalTimeZone, today } from '@internationalized/date';
	// `base` is the configured URL prefix (empty in dev,
	// `/gin-darts-scoring-sveltekit` on GitHub Pages).
	// Raw `href="/..."` strings would otherwise resolve
	// against the bare origin and skip the prefix, so we
	// prepend `base` to every internal link below.
	import { base } from '$app/paths';

	let loading = $state(true);
	let error = $state(/** @type {string} */ (''));
	let tournaments = $state(/** @type {any[]} */ ([]));
	let query = $state(/** @type {string} */ (''));
	// x-only public key of the currently signed-in user,
	// or empty string for anonymous. Used to flag the
	// user's own events with an Edit link in the list
	// below. Recomputed on mount; we don't watch for
	// sign-in changes because the calendar is already
	// pulled on every Reload.
	let myPubkey = $state(/** @type {string} */ (''));
	// Tracks which event id the user has just asked to
	// delete, so we can show "deleting…" feedback. Keyed
	// by NOSTR event id.
	let deletingId = $state(/** @type {string} */ (''));
	// View mode: list (default), month, week. Persisted in
	// localStorage so the choice survives reloads. The
	// underlying data fetch is the same regardless of view —
	// only the render layout changes.
	let view = $state(/** @type {'list' | 'month' | 'week'} */ (
		(typeof localStorage !== 'undefined' && localStorage.getItem('gin-darts-calendar-view')) || 'list'
	));
	function setView(/** @type {'list' | 'month' | 'week'} */ v) {
		view = v;
		try { localStorage.setItem('gin-darts-calendar-view', v); } catch { /* ignore */ }
	}
	// Reference date for the month/week views. New Date()
	// on mount keeps the user on the month they're
	// looking at; prev/next buttons move the cursor.
	let cursor = $state(new Date());
	// Bits UI Calendar placeholder. A CalendarDate
	// (timezone-aware DateValue) is the only thing
	// `bind:placeholder` accepts on <Calendar.Root>.
	// We sync it both ways with the native `cursor`
	// above so the prev / next / Today buttons keep
	// working without re-implementing the nav.
	const localTZ = getLocalTimeZone();
	const t = today(localTZ);
	let calendarPlaceholder = $state(new CalendarDate(t.year, t.month, t.day));
	// YYYY-MM-DD key for "today", used to mark
	// the day cell with the .today class.
	let todayKey = dayKeyImpl(new Date());
	function dayKeyImpl(/** @type {Date} */ d) {
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	}

	// The NOSTR event carries the start time in an ISO
	// stamp like "2026-04-15" or "2026-04-15T18:00". The
	// raw stamp is fine for sorting, but the user
	// wants to read the day and the hour at a glance,
	// so we project it into a friendly "Sat 15 Apr
	// 2026, 18:00" string. Date-only stamps render
	// without the time bit so we don't mislead the
	// reader into thinking the time is known.
	function formatStarts(/** @type {string} */ iso) {
		if (!iso) return '';
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return iso;
		const datePart = d.toLocaleDateString(undefined, {
			weekday: 'short',
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
		// The time component is only present when the
		// stamp contains a "T" (e.g. "2026-04-15T18:00").
		// Pure date strings ("2026-04-15") skip it.
		if (!iso.includes('T')) return datePart;
		const timePart = d.toLocaleTimeString(undefined, {
			hour: '2-digit',
			minute: '2-digit'
		});
		return `${datePart}, ${timePart}`;
	}

	function formatLeagueRange(/** @type {any[]} */ rounds) {
		const dates = (rounds || [])
			.map((/** @type {any} */ r) => r?.date)
			.filter((/** @type {any} */ d) => typeof d === 'string' && d.length > 0)
			.sort();
		if (!dates.length) return '';
		const first = formatStarts(dates[0]);
		const last = formatStarts(dates[dates.length - 1]);
		if (first === last) return first;
		return `${first} – ${last}`;
	}

	// Fetch a fresh calendar on mount. The user can
	// pull to refresh later via the Reload button; we
	// deliberately keep the page static (no polling)
	// so it doesn't pin a websocket open in the
	// background.
	async function load() {
		loading = true;
		error = '';
		try {
			const events = await fetchTournaments();
			tournaments = events.map(parseTournamentEvent);
		} catch (e) {
			error = String(e?.message || e);
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		// Hydrate `myPubkey` so the Edit link in the list
		// below can light up for the signed-in user. We
		// read once; if the user signs in later they can
		// just hit Reload.
		try {
			const kp = getStoredKeypair();
			myPubkey = kp?.publicKey || '';
		} catch {
			myPubkey = '';
		}
		load();
	});

	// Issue a NIP-09 deletion request for one of the
	// signed-in user's own events. Relays that respect
	// NIP-09 will drop the original event; the rest
	// may keep it (the spec is best-effort). Either
	// way, we hide the row locally so the user
	// immediately sees their intent take effect.
	async function handleDelete(/** @type {any} */ t) {
		if (!t?.id) return;
		const ok = confirm(
			`Delete "${t.name || 'this tournament'}"?\n\n` +
			`A NOSTR NIP-09 deletion request will be sent to all relays. ` +
			`Relays that respect NIP-09 will remove the event; others may keep it.`
		);
		if (!ok) return;
		const kp = getStoredKeypair();
		if (!kp?.secretKey) {
			alert('Not signed in.');
			return;
		}
		deletingId = t.id;
		try {
			const success = await deleteTournament({
				secretKey: kp.secretKey,
				event: {
					id: t.id,
					kind: 30001,
					pubkey: t.pubkey,
					// parseTournamentEvent exposes the raw
					// tags, so we can hand them straight
					// through and let the delete function
					// pick out the `d` identifier.
					tags: t._rawTags || []
				}
			});
			if (success) {
				// Local cascade. Calendar is the
				// canonical view: deleting here also
				// removes the competition from the
				// device's IDB store so the offline
				// list / brackets stay in sync.
				// We resolve the underlying
				// competition id (strip the
				// `round-` prefix used by child
				// round events) and pull the
				// sibling child tournaments from
				// IDB so the parent + every round
				// disappear together.
				const compId = t.tournamentId
					? (t.tournamentId.startsWith('round-')
						? t.tournamentId.replace(/^round-/, '')
						: t.tournamentId)
					: null;
				if (compId) {
					try {
						const children = await listChildTournaments(compId);
						for (const child of children) {
							await deleteCompetition(child.id);
						}
						await deleteCompetition(compId);
					} catch (e) {
						// Non-fatal — the NIP-09
						// deletion already succeeded
						// on the relay. Log it so the
						// user can investigate.
						await log('nostr', `handleDelete: local cascade failed for ${compId} — ${e?.message || e}`);
					}
				}
				// Hide the row optimistically — the next
				// Reload will confirm the relay dropped it.
				tournaments = tournaments.filter((/** @type {any} */ x) => x.id !== t.id);
			} else {
				alert('No relay accepted the deletion request. Check the NOSTR logs for details.');
			}
		} catch (e) {
			alert('Delete failed: ' + (e?.message || e));
		} finally {
			deletingId = '';
		}
	}

	// In-memory filter: matches the user query against
	// the name, location, and format fields. Kept on
	// the client side because the relay has already
	// returned everything we want — re-querying with
	// extra filters would be slower and would force
	// us to surface an additional form.
	let visible = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return tournaments;
		return tournaments.filter((t) => {
			return (
				(t.name || '').toLowerCase().includes(q) ||
				(t.location || '').toLowerCase().includes(q) ||
				(t.format || '').toLowerCase().includes(q)
			);
		});
	});

	// Tiptap stores rules as HTML. The calendar shows
	// just a short plain-text teaser so the row stays
	// scannable — strip tags, collapse whitespace, cut
	// to ~160 chars with an ellipsis.
	function rulesExcerpt(/** @type {string} */ html) {
		if (!html) return '';
		const text = html
			.replace(/<[^>]+>/g, ' ')   // strip tags
			.replace(/&nbsp;/g, ' ')
			.replace(/&amp;/g, '&')
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/\s+/g, ' ')
			.trim();
		if (text.length <= 160) return text;
		return text.slice(0, 160).trim() + '…';
	}

	// The "More info" link target. We prefer an explicit
	// data_url if the publisher set one (a bracket / live
	// scoring page), and fall back to the in-app Edit
	// route when the viewer is the owner — that way a
	// league can ship just a parent event and the owner
	// still gets a one-click jump to the editor.
	function moreInfoHref(/** @type {any} */ t) {
		if (t.data_url) return t.data_url;
		if (myPubkey && t.pubkey === myPubkey && t.tournamentId && !t.legacy) {
			const id = t.tournamentId.startsWith('round-')
				? t.tournamentId.replace(/^round-/, '')
				: t.tournamentId;
			return `${base}/competitions/${id}/edit`;
		}
		return '';
	}

	// Calendar grid helpers for month / week views.
	// We index events by their YYYY-MM-DD start day so
	// the cell render is O(1) per day. Events without a
	// start date fall into the "undated" bucket and are
	// only shown in the list view.
	function dayKey(/** @type {Date} */ d) {
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	}
	/** @type {Record<string, any[]>} */
	let eventsByDay = $derived.by(() => {
		const out = /** @type {Record<string, any[]>} */ ({});
		for (const t of tournaments) {
			if (!t.date) continue;
			// t.date may be "2026-04-15" or
			// "2026-04-15T18:00" — take the prefix.
			const k = String(t.date).slice(0, 10);
			if (!out[k]) out[k] = [];
			out[k].push(t);
		}
		return out;
	});
	// 42-cell grid (6 weeks × 7 days) anchored on the
	// first day of the week that contains the 1st of the
	// cursor's month.
	let monthCells = $derived.by(() => {
		const y = cursor.getFullYear();
		const m = cursor.getMonth();
		const first = new Date(y, m, 1);
		// 0 = Sunday, so the offset to the first cell is
		// the weekday of `first` itself.
		const offset = first.getDay();
		const start = new Date(y, m, 1 - offset);
		const cells = [];
		for (let i = 0; i < 42; i++) {
			const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
			cells.push({
				date: d,
				key: dayKey(d),
				inMonth: d.getMonth() === m,
				today: dayKey(d) === dayKey(new Date())
			});
		}
		return cells;
	});
	function monthLabel(/** @type {Date} */ d) {
		return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
	}
	function shiftCursor(/** @type {number} */ days) {
		cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + days);
		// Sync to the Bits UI Calendar placeholder.
		calendarPlaceholder = new CalendarDate(cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate());
	}
	function jumpToToday() {
		cursor = new Date();
		const tn = today(localTZ);
		calendarPlaceholder = new CalendarDate(tn.year, tn.month, tn.day);
	}
</script>

<div class="screen scrollable">
	<div class="card">
		<header class="head">
			<h1>Calendar</h1>
			<div class="head-actions">
				<!-- View toggle. List keeps the
				     scannable rows; month shows a
				     6-week grid with event dots;
				     week shows the current 7 days
				     stacked. Choice persists in
				     localStorage. -->
				<div class="view-toggle" role="tablist" aria-label="Calendar view">
					<button type="button" class="view-btn" class:active={view === 'list'} aria-pressed={view === 'list'} onclick={() => setView('list')}>List</button>
					<button type="button" class="view-btn" class:active={view === 'month'} aria-pressed={view === 'month'} onclick={() => setView('month')}>Month</button>
				</div>
				<button class="btn ghost" type="button" onclick={load} disabled={loading}>
					{loading ? 'Loading…' : 'Reload'}
				</button>
			</div>
		</header>

		<p class="muted">
			Darts tournaments published on the public NOSTR relays
			(kind <code>30001</code>, tag <code>darts-tournament</code>).
			This view is read-only — to publish a tournament you need to
			sign in and create it from the Competitions tab.
		</p>

		{#if view === 'list'}
			<input
				class="search"
				type="search"
				placeholder="Search by name, location, or format…"
				bind:value={query}
			/>
		{/if}

		{#if view !== 'list'}
			<!-- Month / week cursor: prev/next/labelled
			     header. The label updates live as the
			     cursor changes; "Today" snaps back to
			     the current month/week. -->
			<div class="cursor-row">
				<button type="button" class="btn ghost small" onclick={() => shiftCursor(-30)} aria-label="Previous month">‹</button>
				<span class="cursor-label">
					{monthLabel(cursor)}
				</span>
				<button type="button" class="btn ghost small" onclick={() => shiftCursor(30)} aria-label="Next month">›</button>
				<button type="button" class="btn ghost small" onclick={jumpToToday}>Today</button>
			</div>
		{/if}

		{#if error}
			<p class="error">Couldn't reach the relays: {error}</p>
		{/if}

		{#if loading && tournaments.length === 0}
			<p class="muted">Loading tournaments…</p>
		{:else if view === 'list' && visible.length === 0}
			<p class="muted">No tournaments matched the search.</p>
		{:else if view === 'list'}
			<ul class="list">
				{#each visible as t (t.id)}
					<!-- (list row markup below) -->
					{@const _ = ''}
					<li class="row">
						<div class="row-main">
							<strong class="name">
								{#if t.legacy}
									Untitled (legacy event)
								{:else}
									{t.name || 'Untitled competition'}
								{/if}
							</strong>
							<!-- v0.4.26: league / tournament /
							     round label surfaces the kind of
							     event this row represents. The
							     NOSTR event ships `type` in its
							     content JSON; older events that
							     pre-date the field fall through
							     to the legacy placeholder. -->
							<div class="kind-row">
								{#if t.type === 'league'}
									<span class="kind-badge kind-league">League</span>
								{:else if t.type === 'tournament'}
									<span class="kind-badge kind-tournament">Tournament</span>
								{:else}
									<span class="kind-badge kind-unknown">Event</span>
								{/if}
							</div>
							<div class="meta">
								{#if t.type === 'league' && Array.isArray(t.rounds) && t.rounds.length > 0}
									<span>{formatLeagueRange(t.rounds)}</span>
								{:else if t.date}
									<span>{formatStarts(t.date)}</span>
								{/if}
								{#if t.location}<span> · {t.location}</span>{/if}
								{#if t.format}<span> · {t.format}</span>{/if}
							</div>
							{#if Array.isArray(t.rounds) && t.rounds.length > 0}
								<!-- Round list. For a league the
								     publisher ships one event per
								     round, but the parent event
								     also carries a summary so the
								     reader can see the whole
								     schedule at a glance. -->
								<ul class="rounds-list">
									{#each t.rounds as r, i (i)}
										<li>
											<span class="round-name">{r.name || `Round ${i + 1}`}</span>
											{#if r.date}<span class="round-when"> · {formatStarts(r.time ? `${r.date}T${r.time}` : r.date)}</span>{/if}
											{#if r.location && r.location !== t.location}<span class="round-where"> · {r.location}</span>{/if}
										</li>
									{/each}
								</ul>
							{/if}
							{#if t.rules}
								<p class="rules-excerpt">{rulesExcerpt(t.rules)}</p>
							{/if}
						</div>
						<div class="row-actions">
							{#if myPubkey && t.pubkey === myPubkey}
								<!-- The signed-in user is the
								     author of this NOSTR event.
								     Surface an Edit shortcut
								     that takes them straight
								     to the existing edit
								     route. We only render the
								     link when we have a
								     usable `tournamentId`
								     (parsed from the `d`
								     tag). Round events use
								     `round-{roundId}` and
								     can be edited through
								     their parent league.
								     Legacy events (JSON
								     parse failed) and events
								     without a stable `d` tag
								     are skipped — clicking
								     through to a non-existent
								     IDB record would land on
								     GitHub Pages' raw 404
								     page. -->
								{#if t.tournamentId && !t.legacy}
									{@const editId = t.tournamentId.startsWith('round-')
										? t.tournamentId.replace(/^round-/, '')
										: t.tournamentId}
									<a
										class="btn ghost small"
										href={`${base}/competitions/${editId}/edit`}
										aria-label="Edit this competition"
									>
										Edit
									</a>
								{/if}
							{/if}
							{#if moreInfoHref(t)}
								<a
									class="btn ghost small"
									href={moreInfoHref(t)}
									target={t.data_url ? '_blank' : undefined}
									rel={t.data_url ? 'noopener' : undefined}
									aria-label="More info about this competition"
								>
									More info
								</a>
							{/if}
							{#if t.data_url}
								<a class="btn ghost small" href={t.data_url} target="_blank" rel="noopener">Open bracket</a>
							{/if}
							{#if myPubkey && t.pubkey === myPubkey && t.tournamentId && !t.legacy}
								<button
									type="button"
									class="btn danger small"
									onclick={() => handleDelete(t)}
									disabled={deletingId === t.id}
									aria-label="Delete this competition from NOSTR"
									title="Send a NIP-09 deletion request"
								>
									{deletingId === t.id ? 'Deleting…' : 'Delete'}
								</button>
								{/if}
								</div>
								</li>
								{/each}
								</ul>
								{:else if view === 'month'}
								<!-- Month grid: Bits UI Calendar. We supply
								     our own week header (Sun-first, English)
								     and render events inside the cell
								     snippet via a tiny helper. We use a
								     one-way \`placeholder\` binding (no
								     \`bind:\`) — the two-way variant was
								     re-entering the cell snippet on every
								     placeholder tick and crashing the
								     cell with 'date.calendar' undefined
								     because each rebuild lost the DateValue
								     proxy before the cell could read it.
								     Our own prev / next / Today buttons
								     drive \`calendarPlaceholder\` directly,
								     which is enough to navigate. -->
								<Calendar.Root
									class="cal-grid"
									weekdayFormat="short"
									fixedWeeks={true}
									type="single"
									placeholder={calendarPlaceholder}
								>
									{#snippet children({ months, weekdays })}
											<Calendar.Header class="cal-row cal-head">
												{#each weekdays as wd (wd)}
													<div class="cal-cell cal-weekday">{wd}</div>
												{/each}
											</Calendar.Header>
											{#each months as month (month.value.toString())}
												<Calendar.GridBody class="cal-month">
													{#each month.weeks as weekDates, wi (wi)}
														<Calendar.GridRow class="cal-row">
															{#each weekDates as date, di (di)}
																{#if date}
																	{@const key = `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`}
																	{@const dayEvents = eventsByDay[key] || []}
																	<Calendar.Cell {date} class={date.month !== calendarPlaceholder.month ? 'cal-cell out' : (key === todayKey ? 'cal-cell today' : 'cal-cell')}>
																		<!-- Render the day number directly (avoids
																	     <Calendar.Day>'s internal `date.calendar`
																	     access which throws when the date comes
																	     from a custom snippet). The class still
																	     gives the cell the same hover / focus
																	     styling Bits UI provides. -->
																		<div class="cal-day-num">{date.day}</div>
																		{#each dayEvents.slice(0, 3) as e (e.id)}
																			<div class="cal-event" title={e.name || ''}>
																				<span class="kind-dot kind-{e.type === 'tournament' ? 'tournament' : (e.type === 'league' ? 'league' : 'unknown')}"></span>
																				<span class="cal-event-name">{e.name || 'Untitled'}</span>
																			</div>
																		{/each}
																		{#if dayEvents.length > 3}
																			<div class="cal-more">+{dayEvents.length - 3} more</div>
																		{/if}
																	</Calendar.Cell>
																{/if}
															{/each}
														</Calendar.GridRow>
													{/each}
												</Calendar.GridBody>
											{/each}
									{/snippet}
								</Calendar.Root>
								{/if}

		<footer class="foot muted">
			Read from {DEFAULT_RELAYS.length} relays: {DEFAULT_RELAYS.join(', ')}
		</footer>
	</div>
</div>

<style>
	.head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-sm); }
	.head-actions { display: flex; align-items: center; gap: var(--space-sm); flex-wrap: wrap; }
	.view-toggle {
		display: inline-flex;
		gap: 2px;
		padding: 2px;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 8px;
	}
	.view-btn {
		padding: 4px 10px;
		font: inherit;
		font-size: var(--text-sm);
		background: transparent;
		color: var(--muted);
		border: 1px solid transparent;
		border-radius: 6px;
		cursor: pointer;
	}
	.view-btn.active {
		background: var(--bg);
		color: var(--text);
		border-color: var(--line);
	}
	.cursor-row {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		margin: var(--space-sm) 0;
	}
	.cursor-label {
		font-weight: 600;
		min-width: 12em;
		text-align: center;
	}
	.cal-grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 2px;
		margin-top: var(--space-sm);
	}
	.cal-row {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 2px;
	}
	.cal-cell {
		min-height: 80px;
		padding: 4px 6px;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 6px;
		display: flex;
		flex-direction: column;
		gap: 2px;
		overflow: hidden;
	}
	.cal-cell.out { opacity: 0.45; }
	.cal-cell.today {
		border-color: var(--accent);
		box-shadow: inset 0 0 0 1px var(--accent);
	}
	.cal-cell.cal-weekday {
		min-height: 0;
		padding: 4px 6px;
		background: transparent;
		border: 0;
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.cal-day-num {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--muted);
	}
	.cal-event {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: var(--text-xs);
		padding: 1px 4px;
		border-radius: 3px;
		background: color-mix(in srgb, var(--accent) 14%, transparent);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.cal-event-name { overflow: hidden; text-overflow: ellipsis; }
	.kind-dot {
		width: 6px; height: 6px;
		border-radius: 50%;
		flex: 0 0 auto;
		background: var(--muted);
	}
	.kind-dot.kind-league { background: var(--accent); }
	.kind-dot.kind-tournament { background: var(--warn, #e8b923); }
	.cal-more { font-size: var(--text-xs); color: var(--muted); padding-left: 10px; }
	/* Stack the layout vertically on small viewports
	   so the rows still fit one screen wide. */
	@media (max-width: 480px) {
		.cal-cell { min-height: 60px; }
	}
	.rounds-list {
		list-style: none;
		padding: 0;
		margin: var(--space-xs) 0 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.rounds-list li {
		font-size: var(--text-sm);
		color: var(--muted);
	}
	.round-name { color: var(--text); font-weight: 500; }
	.round-when, .round-where { color: var(--muted); }
	.rules-excerpt {
		margin: var(--space-xs) 0 0;
		padding: var(--space-xs) var(--space-sm);
		background: var(--surface-2, var(--surface));
		border-left: 2px solid var(--line);
		font-size: var(--text-sm);
		color: var(--muted);
		border-radius: 4px;
	}
	.search {
		width: 100%;
		padding: var(--space-sm);
		margin: var(--space-sm) 0;
		background: var(--bg);
		color: var(--text);
		border: 1px solid var(--line);
		border-radius: var(--radius, 8px);
		font: inherit;
	}
	.list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: var(--space-sm); }
	.row {
		display: flex; align-items: center; gap: var(--space-sm);
		padding: var(--space-sm);
		background: var(--bg-2, #14181f);
		border: 1px solid var(--line);
		border-radius: var(--radius, 8px);
	}
	.row-main { flex: 1 1 auto; min-width: 0; }
	.name { display: block; }
	.kind-row { margin-top: 2px; }
	.kind-badge {
		display: inline-block;
		font-size: var(--text-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 1px 6px;
		border-radius: 4px;
		border: 1px solid var(--line);
		background: var(--surface);
		color: var(--muted);
	}
	.kind-badge.kind-league {
		/* League parent: blue-tinted accent so the
		   reader can tell a season-long league from
		   a one-off tournament at a glance. */
		border-color: color-mix(in srgb, var(--accent) 60%, transparent);
		color: var(--accent);
	}
	.kind-badge.kind-tournament {
		/* Tournament: warm orange so it reads as a
		   different category, not just a copy of
		   the league badge. */
		border-color: var(--warn, #e8b923);
		color: var(--warn, #e8b923);
	}
	.meta { font-size: var(--text-sm); color: var(--muted); }
	.foot { margin-top: var(--space-md); font-size: var(--text-xs); }
	.error { color: #ff6b6b; font-size: var(--text-sm); }
	.btn.small { font-size: var(--text-sm); padding: 4px 8px; }
</style>

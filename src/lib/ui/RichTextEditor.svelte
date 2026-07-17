<script>
	/**
	 * Lightweight Tiptap-backed rich text editor. The
	 * parent binds `content` (HTML string) and we hand
	 * the value back on every keystroke. Toolbar lives
	 * inline above the editor — B, I, U, H1/H2/H3,
	 * lists, blockquote, code, link, undo/redo. We use
	 * StarterKit for paragraphs, headings, lists, marks
	 * (bold, italic, strike, code), blockquote, code
	 * block, history (undo/redo), hard break, horizontal
	 * rule, and link.
	 */
	import { onMount, onDestroy } from 'svelte';
	import { Editor } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';

	let { content = $bindable(''), placeholder = 'Type here…' } = $props();

	/** @type {HTMLElement | undefined} */
	let mount;
	// `$state` so the toolbar re-renders as the editor
	// instance becomes available after `onMount`. A plain
	// `let` is not reactive in Svelte 5 — `{#if editor}`
	// would never flip to true.
	let editor = $state(/** @type {any} */ (undefined));

	onMount(() => {
		if (!mount) return;
		editor = new Editor({
			element: mount,
			extensions: [
				StarterKit.configure({
					heading: { levels: [1, 2, 3] }
				})
			],
			content: content || '',
			onUpdate({ editor: e }) {
				content = e.getHTML();
			}
		});
	});

	$effect(() => {
		// Keep the editor in sync when `content` changes
		// from outside (e.g. loading an existing competition
		// for edit). We skip when the new value matches the
		// current editor HTML, otherwise we'd reset the
		// cursor on every keystroke.
		if (!editor) return;
		if (editor.getHTML() !== content) {
			editor.commands.setContent(content || '', { emitUpdate: false });
		}
	});

	onDestroy(() => {
		editor?.destroy();
	});

	function exec(/** @type {() => void} */ cmd) {
		editor?.chain().focus()[cmd]().run();
	}
</script>

<div class="rte">
	{#if editor}
		<div class="toolbar" role="toolbar" aria-label="Formatting">
			<button type="button" class="rtb" class:on={editor.isActive('bold')}
				onclick={() => exec('toggleBold')} title="Bold (Ctrl+B)"><strong>B</strong></button>
			<button type="button" class="rtb" class:on={editor.isActive('italic')}
				onclick={() => exec('toggleItalic')} title="Italic (Ctrl+I)"><em>I</em></button>
			<button type="button" class="rtb" class:on={editor.isActive('strike')}
				onclick={() => exec('toggleStrike')} title="Strike"><s>S</s></button>
			<button type="button" class="rtb" class:on={editor.isActive('code')}
				onclick={() => exec('toggleCode')} title="Inline code"><code>{'<>'}</code></button>
			<span class="sep"></span>
			<button type="button" class="rtb" class:on={editor.isActive('heading', { level: 1 })}
				onclick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}>H1</button>
			<button type="button" class="rtb" class:on={editor.isActive('heading', { level: 2 })}
				onclick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>H2</button>
			<button type="button" class="rtb" class:on={editor.isActive('heading', { level: 3 })}
				onclick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}>H3</button>
			<span class="sep"></span>
			<button type="button" class="rtb" class:on={editor.isActive('bulletList')}
				onclick={() => exec('toggleBulletList')} title="Bullet list">• List</button>
			<button type="button" class="rtb" class:on={editor.isActive('orderedList')}
				onclick={() => exec('toggleOrderedList')} title="Ordered list">1. List</button>
			<button type="button" class="rtb" class:on={editor.isActive('blockquote')}
				onclick={() => exec('toggleBlockquote')} title="Blockquote">❝</button>
			<button type="button" class="rtb" class:on={editor.isActive('codeBlock')}
				onclick={() => exec('toggleCodeBlock')} title="Code block">{'{ }'}</button>
			<span class="sep"></span>
			<button type="button" class="rtb"
				onclick={() => exec('setHorizontalRule')} title="Divider">―</button>
			<button type="button" class="rtb"
				onclick={() => {
					const url = window.prompt('Link URL');
					if (!url) return;
					editor?.chain().focus().setLink({ href: url }).run();
				}} title="Link">🔗</button>
			<span class="sep"></span>
			<button type="button" class="rtb" onclick={() => exec('undo')} title="Undo (Ctrl+Z)">↶</button>
			<button type="button" class="rtb" onclick={() => exec('redo')} title="Redo (Ctrl+Shift+Z)">↷</button>
		</div>
	{/if}
	<div class="editor" bind:this={mount} data-placeholder={placeholder}></div>
</div>

<style>
	.rte {
		display: flex; flex-direction: column;
		border: 1px solid var(--line, #2c3343);
		border-radius: 8px;
		background: var(--bg, #0b0f17);
		color: var(--text, #e6ecf5);
	}
	.toolbar {
		display: flex; flex-wrap: wrap; gap: 2px;
		padding: 4px;
		border-bottom: 1px solid var(--line, #2c3343);
		background: var(--surface-2, #11161f);
	}
	.rtb {
		min-width: 32px; min-height: 32px;
		padding: 4px 8px;
		font: inherit; font-size: 0.9rem;
		background: transparent;
		color: inherit;
		border: 1px solid transparent;
		border-radius: 4px;
		cursor: pointer;
	}
	.rtb:hover { background: var(--surface, #161c27); }
	.rtb.on { background: var(--accent, #ff7849); color: #fff; }
	.sep { width: 1px; background: var(--line, #2c3343); margin: 2px 4px; }
	.editor {
		min-height: 140px;
		padding: 8px 12px;
		font: inherit; font-size: 0.95rem;
	}
	.editor :global(.ProseMirror) { outline: none; min-height: 120px; }
	.editor :global(.ProseMirror p) { margin: 0 0 0.5em; }
	.editor :global(.ProseMirror h1) { font-size: 1.4rem; margin: 0.4em 0; }
	.editor :global(.ProseMirror h2) { font-size: 1.2rem; margin: 0.4em 0; }
	.editor :global(.ProseMirror h3) { font-size: 1.05rem; margin: 0.4em 0; }
	.editor :global(.ProseMirror ul),
	.editor :global(.ProseMirror ol) { padding-left: 1.4em; }
	.editor :global(.ProseMirror blockquote) {
		border-left: 3px solid var(--accent, #ff7849);
		padding-left: 0.6em; color: var(--muted, #99a3b3);
	}
	.editor :global(.ProseMirror code) {
		background: var(--surface, #161c27);
		padding: 1px 4px; border-radius: 3px; font-size: 0.9em;
	}
	.editor :global(.ProseMirror pre) {
		background: var(--surface, #161c27);
		padding: 8px; border-radius: 4px; overflow-x: auto;
	}
	.editor :global(.ProseMirror a) { color: var(--accent, #ff7849); }
	.editor :global(.ProseMirror p.is-editor-empty:first-child::before) {
		content: attr(data-placeholder);
		color: var(--muted, #99a3b3);
		float: left; height: 0; pointer-events: none;
	}
</style>

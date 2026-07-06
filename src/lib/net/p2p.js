// =================================================================
// Simple P2P signalling for online darts matches.
// Uses WebRTC data channel. Signalling is manual (copy-paste offer/answer)
// so it works on static GitHub Pages without a server.
// =================================================================

export class P2PChannel extends EventTarget {
	/** @type {RTCPeerConnection | null} */
	#pc = null;
	/** @type {RTCDataChannel | null} */
	#dc = null;
	#role = 'unknown';
	#iceQueue = [];
	#hasRemoteDesc = false;

	get role() { return this.#role; }
	get connected() { return this.#dc?.readyState === 'open'; }

	async #config() {
		const ice = await fetch('https://api.github.com/')
			.then(() => {
				// Public STUN only; no TURN credentials in repo.
				return {
					iceServers: [
						{ urls: 'stun:stun.l.google.com:19302' },
						{ urls: 'stun:stun1.l.google.com:19302' }
					]
				};
			})
			.catch(() => ({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }));
		return ice;
	}

	async host() {
		this.#role = 'host';
		this.#pc = new RTCPeerConnection(await this.#config());
		this.#wirePc();
		this.#dc = this.#pc.createDataChannel('gindarts', { ordered: true });
		this.#wireDc();
		const offer = await this.#pc.createOffer();
		await this.#pc.setLocalDescription(offer);
		return this.#localDescJson();
	}

	async join(offerJson) {
		this.#role = 'join';
		this.#pc = new RTCPeerConnection(await this.#config());
		this.#wirePc();
		this.#pc.ondatachannel = (e) => {
			this.#dc = e.channel;
			this.#wireDc();
		};
		await this.#applyRemoteDesc(offerJson);
		const answer = await this.#pc.createAnswer();
		await this.#pc.setLocalDescription(answer);
		return this.#localDescJson();
	}

	async acceptAnswer(answerJson) {
		await this.#applyRemoteDesc(answerJson);
	}

	async addIce(iceJson) {
		const candidates = Array.isArray(iceJson) ? iceJson : [iceJson];
		if (!this.#hasRemoteDesc) {
			this.#iceQueue.push(...candidates);
			return;
		}
		for (const c of candidates) {
			try {
				await this.#pc.addIceCandidate(c);
			} catch (e) {
				console.warn('addIceCandidate failed', e);
			}
		}
	}

	send(data) {
		const s = typeof data === 'string' ? data : JSON.stringify(data);
		if (this.#dc?.readyState === 'open') this.#dc.send(s);
		else throw new Error('Data channel not open');
	}

	close() {
		this.#dc?.close();
		this.#pc?.close();
		this.#dc = null;
		this.#pc = null;
	}

	#localDescJson() {
		return {
			type: this.#pc.localDescription.type,
			sdp: this.#pc.localDescription.sdp
		};
	}

	async #applyRemoteDesc(json) {
		await this.#pc.setRemoteDescription(new RTCSessionDescription(json));
		this.#hasRemoteDesc = true;
		for (const c of this.#iceQueue) await this.addIce(c);
		this.#iceQueue = [];
	}

	#wirePc() {
		this.#pc.onicecandidate = (e) => {
			if (e.candidate) {
				this.dispatchEvent(new CustomEvent('ice', { detail: e.candidate.toJSON() }));
			}
		};
		this.#pc.onconnectionstatechange = () => {
			this.dispatchEvent(new CustomEvent('state', { detail: this.#pc.connectionState }));
		};
	}

	#wireDc() {
		if (!this.#dc) return;
		this.#dc.onopen = () => this.dispatchEvent(new Event('open'));
		this.#dc.onclose = () => this.dispatchEvent(new Event('close'));
		this.#dc.onmessage = (e) => {
			let data = e.data;
			try { data = JSON.parse(e.data); } catch {}
			this.dispatchEvent(new CustomEvent('message', { detail: data }));
		};
	}
}

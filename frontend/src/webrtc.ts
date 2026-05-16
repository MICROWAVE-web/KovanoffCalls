import {
  callDebug,
  callDebugWarn,
  iceServersForLog,
  summarizeIceCandidate,
  summarizeSdp,
} from "./callDebug";
import { signaling } from "./websocket";
import { useAppStore } from "./store";

function buildIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [];

  const turnUrl = import.meta.env.VITE_TURN_URL;
  const turnUser = import.meta.env.VITE_TURN_USERNAME;
  const turnPass = import.meta.env.VITE_TURN_PASSWORD;
  if (turnUrl && turnUser && turnPass) {
    // List TURN before STUN so browsers prioritize relay candidates on difficult NATs.
    servers.push({
      urls: [`${turnUrl}?transport=udp`, `${turnUrl}?transport=tcp`],
      username: turnUser,
      credential: turnPass,
    });
  }

  servers.push({ urls: "stun:stun.l.google.com:19302" });

  return servers;
}

const PC_CONFIG: RTCConfiguration = {
  iceServers: buildIceServers(),
};

export class CallSession {
  readonly callId: string;
  private pc: RTCPeerConnection;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream;
  private pendingRemoteIce: RTCIceCandidateInit[] = [];
  private remoteDescriptionSet = false;
  private closed = false;
  private failureHandled = false;

  constructor(callId: string) {
    this.callId = callId;
    callDebug("webrtc.constructor", {
      callId,
      iceServers: iceServersForLog(),
      ua: typeof navigator !== "undefined" ? navigator.userAgent : "",
    });
    this.pc = new RTCPeerConnection(PC_CONFIG);
    this.remoteStream = new MediaStream();
    useAppStore.getState().setRemoteStream(this.remoteStream);

    this.pc.ontrack = (event) => {
      const streams = event.streams[0];
      const tracks = streams?.getTracks().map((t) => `${t.kind}:${t.id}:${t.readyState}`) ?? [];
      callDebug("webrtc.ontrack", { callId: this.callId, streams: event.streams.length, tracks });
      event.streams[0]?.getTracks().forEach((track) => {
        if (!this.remoteStream.getTracks().includes(track)) {
          this.remoteStream.addTrack(track);
        }
      });
      // Force store update by replacing the stream reference
      useAppStore.getState().setRemoteStream(this.remoteStream);
    };

    this.pc.onicecandidate = (event) => {
      const json = event.candidate ? event.candidate.toJSON() : null;
      callDebug("webrtc.localIce", {
        callId: this.callId,
        line: summarizeIceCandidate(json),
      });
      signaling.send({
        type: "ice_candidate",
        call_id: this.callId,
        candidate: json,
      });
    };

    this.pc.onsignalingstatechange = () => {
      callDebug("webrtc.signalingState", {
        callId: this.callId,
        signalingState: this.pc.signalingState,
      });
    };

    this.pc.onicegatheringstatechange = () => {
      callDebug("webrtc.iceGatheringState", {
        callId: this.callId,
        iceGatheringState: this.pc.iceGatheringState,
      });
    };

    this.pc.onconnectionstatechange = () => {
      const state = this.pc.connectionState;
      callDebug("webrtc.connectionState", { callId: this.callId, connectionState: state });
      if (state === "connected") {
        useAppStore.getState().updateActiveCall({
          status: "active",
          startedAt: useAppStore.getState().activeCall?.startedAt ?? Date.now(),
        });
        callDebug("webrtc.connected", {
          callId: this.callId,
          connectionState: this.pc.connectionState,
          iceConnectionState: this.pc.iceConnectionState,
          iceGatheringState: this.pc.iceGatheringState,
        });
      } else if (state === "failed") {
        this.endCallDueToMediaFailure("peer_connection_failed");
      } else if (state === "disconnected") {
        callDebugWarn("webrtc.connectionState.disconnected", { callId: this.callId });
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      const ice = this.pc.iceConnectionState;
      callDebug("webrtc.iceConnectionState", { callId: this.callId, iceConnectionState: ice });
      if (ice === "failed") {
        this.endCallDueToMediaFailure("ice_failed");
      }
    };
  }

  private endCallDueToMediaFailure(reason: string): void {
    if (this.failureHandled || this.closed) return;
    this.failureHandled = true;
    callDebugWarn("webrtc.mediaFailure.start", {
      reason,
      callId: this.callId,
      connectionState: this.pc.connectionState,
      iceConnectionState: this.pc.iceConnectionState,
      signalingState: this.pc.signalingState,
    });
    void this.finalizeMediaFailure(reason);
  }

  private async finalizeMediaFailure(reason: string): Promise<void> {
    await this.logConnectivitySnapshot(`mediaFailure:${reason}`);
    callDebugWarn("webrtc.mediaFailure.end", { reason, callId: this.callId });
    try {
      signaling.send({ type: "call_end", call_id: this.callId, reason: `webrtc:${reason}` });
    } catch {
      // ignore
    }
    this.hangup();
    if (activeSession === this) {
      activeSession = null;
    }
    useAppStore.getState().setActiveCall(null);
    useAppStore.getState().setIncomingCall(null);
  }

  private async logConnectivitySnapshot(context: string): Promise<void> {
    if (this.closed) return;
    const snap = {
      context,
      callId: this.callId,
      connectionState: this.pc.connectionState,
      iceConnectionState: this.pc.iceConnectionState,
      iceGatheringState: this.pc.iceGatheringState,
      signalingState: this.pc.signalingState,
      localDescription: this.pc.localDescription
        ? summarizeSdp(this.pc.localDescription)
        : null,
      remoteDescription: this.pc.remoteDescription
        ? summarizeSdp(this.pc.remoteDescription)
        : null,
    };
    callDebug("webrtc.snapshot", snap);
    try {
      const stats = await this.pc.getStats();
      const pairs: Array<Record<string, unknown>> = [];
      const locals: Array<Record<string, unknown>> = [];
      const remotes: Array<Record<string, unknown>> = [];
      stats.forEach((r) => {
        if (r.type === "candidate-pair") {
          const x = r as unknown as {
            state?: string;
            nominated?: boolean;
            localCandidateId?: string;
            remoteCandidateId?: string;
            priority?: number;
          };
          pairs.push({
            id: r.id,
            state: x.state,
            nominated: x.nominated,
            localCandidateId: x.localCandidateId,
            remoteCandidateId: x.remoteCandidateId,
            priority: x.priority,
          });
        } else if (r.type === "local-candidate") {
          const x = r as unknown as { candidateType?: string; protocol?: string; address?: string };
          locals.push({
            id: r.id,
            candidateType: x.candidateType,
            protocol: x.protocol,
            address: x.address,
          });
        } else if (r.type === "remote-candidate") {
          const x = r as unknown as { candidateType?: string; protocol?: string; address?: string };
          remotes.push({
            id: r.id,
            candidateType: x.candidateType,
            protocol: x.protocol,
            address: x.address,
          });
        }
      });
      callDebug("webrtc.getStats", {
        context,
        callId: this.callId,
        candidatePairCount: pairs.length,
        pairs,
        localCandidateCount: locals.length,
        locals,
        remoteCandidateCount: remotes.length,
        remotes,
      });
    } catch (err) {
      callDebugWarn("webrtc.getStats.error", { callId: this.callId, err: String(err) });
    }
  }

  async startLocalMedia(options: { video: boolean } = { video: true }): Promise<MediaStream> {
    callDebug("webrtc.startLocalMedia.begin", { callId: this.callId, video: options.video });
    const { facing } = useAppStore.getState().mediaState;
    const constraints: MediaStreamConstraints = options.video
      ? { audio: true, video: { facingMode: facing } }
      : { audio: true, video: false };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.localStream = stream;
    useAppStore.getState().setLocalStream(stream);

    const { micOn, camOn } = useAppStore.getState().mediaState;
    stream.getAudioTracks().forEach((t) => (t.enabled = micOn));
    stream.getVideoTracks().forEach((t) => (t.enabled = camOn));

    stream.getTracks().forEach((track) => this.pc.addTrack(track, stream));
    callDebug("webrtc.startLocalMedia.done", {
      callId: this.callId,
      tracks: stream.getTracks().map((t) => ({ kind: t.kind, id: t.id, label: t.label })),
    });
    return stream;
  }

  private wantsVideo(): boolean {
    return (this.localStream?.getVideoTracks().length ?? 0) > 0;
  }

  async createOffer(): Promise<void> {
    callDebug("webrtc.createOffer.begin", { callId: this.callId });
    const offer = await this.pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: this.wantsVideo(),
    });
    await this.pc.setLocalDescription(offer);
    callDebug("webrtc.createOffer.sent", {
      callId: this.callId,
      sdp: summarizeSdp(offer),
    });
    signaling.send({ type: "offer", call_id: this.callId, sdp: offer });
  }

  async handleRemoteOffer(sdp: RTCSessionDescriptionInit): Promise<void> {
    callDebug("webrtc.handleRemoteOffer", { callId: this.callId, sdp: summarizeSdp(sdp) });
    await this.pc.setRemoteDescription(sdp);
    this.remoteDescriptionSet = true;
    await this.drainPendingIce();
    const answer = await this.pc.createAnswer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: this.wantsVideo(),
    });
    await this.pc.setLocalDescription(answer);
    callDebug("webrtc.handleRemoteOffer.answer", { callId: this.callId, sdp: summarizeSdp(answer) });
    signaling.send({ type: "answer", call_id: this.callId, sdp: answer });
  }

  async handleRemoteAnswer(sdp: RTCSessionDescriptionInit): Promise<void> {
    callDebug("webrtc.handleRemoteAnswer", { callId: this.callId, sdp: summarizeSdp(sdp) });
    await this.pc.setRemoteDescription(sdp);
    this.remoteDescriptionSet = true;
    await this.drainPendingIce();
  }

  async addRemoteIce(candidate: RTCIceCandidateInit | null): Promise<void> {
    if (!candidate) {
      callDebug("webrtc.remoteIce.endOfCandidates", { callId: this.callId });
      return;
    }
    if (!this.remoteDescriptionSet) {
      callDebug("webrtc.remoteIce.buffered", {
        callId: this.callId,
        line: summarizeIceCandidate(candidate),
        bufferLen: this.pendingRemoteIce.length + 1,
      });
      this.pendingRemoteIce.push(candidate);
      return;
    }
    try {
      await this.pc.addIceCandidate(candidate);
      callDebug("webrtc.remoteIce.added", { callId: this.callId, line: summarizeIceCandidate(candidate) });
    } catch (err) {
      callDebugWarn("webrtc.remoteIce.addFailed", { callId: this.callId, err: String(err), line: summarizeIceCandidate(candidate) });
    }
  }

  private async drainPendingIce(): Promise<void> {
    const pending = this.pendingRemoteIce.splice(0);
    if (pending.length) {
      callDebug("webrtc.remoteIce.drain", { callId: this.callId, count: pending.length });
    }
    for (const cand of pending) {
      try {
        await this.pc.addIceCandidate(cand);
      } catch (err) {
        callDebugWarn("webrtc.remoteIce.drainFailed", { callId: this.callId, err: String(err) });
      }
    }
  }

  toggleMic(): boolean {
    if (!this.localStream) return false;
    const next = !useAppStore.getState().mediaState.micOn;
    this.localStream.getAudioTracks().forEach((t) => (t.enabled = next));
    useAppStore.getState().setMediaState({ micOn: next });
    return next;
  }

  toggleCam(): boolean {
    if (!this.localStream) return false;
    if (this.localStream.getVideoTracks().length === 0) return false;
    const next = !useAppStore.getState().mediaState.camOn;
    this.localStream.getVideoTracks().forEach((t) => (t.enabled = next));
    useAppStore.getState().setMediaState({ camOn: next });
    return next;
  }

  async switchCamera(): Promise<void> {
    if (!this.localStream || this.localStream.getVideoTracks().length === 0) return;
    const current = useAppStore.getState().mediaState.facing;
    const nextFacing: "user" | "environment" =
      current === "user" ? "environment" : "user";

    let newStream: MediaStream;
    try {
      newStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { exact: nextFacing } },
      });
    } catch {
      try {
        newStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: nextFacing },
        });
      } catch (err) {
        console.warn("Failed to switch camera", err);
        return;
      }
    }

    const newVideoTrack = newStream.getVideoTracks()[0];
    if (!newVideoTrack) return;

    const sender = this.pc.getSenders().find((s) => s.track?.kind === "video");
    if (sender) await sender.replaceTrack(newVideoTrack);

    this.localStream.getVideoTracks().forEach((t) => {
      this.localStream?.removeTrack(t);
      t.stop();
    });
    this.localStream.addTrack(newVideoTrack);
    useAppStore.getState().setLocalStream(this.localStream);
    useAppStore.getState().setMediaState({ facing: nextFacing });
  }

  hangup(): void {
    if (this.closed) return;
    callDebug("webrtc.hangup", {
      callId: this.callId,
      connectionState: this.pc.connectionState,
      iceConnectionState: this.pc.iceConnectionState,
    });
    this.closed = true;
    try {
      this.pc.getSenders().forEach((s) => s.track?.stop());
    } catch {
      // ignore
    }
    try {
      this.pc.close();
    } catch {
      // ignore
    }
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    useAppStore.getState().setLocalStream(null);
    useAppStore.getState().setRemoteStream(null);
  }
}

let activeSession: CallSession | null = null;

export function getActiveSession(): CallSession | null {
  return activeSession;
}

export function startSession(callId: string): CallSession {
  if (activeSession) {
    callDebugWarn("webrtc.startSession.replacing", {
      previousCallId: activeSession.callId,
      nextCallId: callId,
    });
    activeSession.hangup();
  }
  activeSession = new CallSession(callId);
  return activeSession;
}

export function clearSession(): void {
  if (activeSession) {
    callDebug("webrtc.clearSession", { callId: activeSession.callId });
    activeSession.hangup();
    activeSession = null;
  }
}

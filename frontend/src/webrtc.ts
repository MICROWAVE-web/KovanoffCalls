import { signaling } from "./websocket";
import { useAppStore } from "./store";

function buildIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

  const turnUrl = import.meta.env.VITE_TURN_URL;
  const turnUser = import.meta.env.VITE_TURN_USERNAME;
  const turnPass = import.meta.env.VITE_TURN_PASSWORD;
  if (turnUrl && turnUser && turnPass) {
    servers.push({
      urls: [`${turnUrl}?transport=udp`, `${turnUrl}?transport=tcp`],
      username: turnUser,
      credential: turnPass,
    });
  }

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

  constructor(callId: string) {
    this.callId = callId;
    this.pc = new RTCPeerConnection(PC_CONFIG);
    this.remoteStream = new MediaStream();
    useAppStore.getState().setRemoteStream(this.remoteStream);

    this.pc.ontrack = (event) => {
      event.streams[0]?.getTracks().forEach((track) => {
        if (!this.remoteStream.getTracks().includes(track)) {
          this.remoteStream.addTrack(track);
        }
      });
      // Force store update by replacing the stream reference
      useAppStore.getState().setRemoteStream(this.remoteStream);
    };

    this.pc.onicecandidate = (event) => {
      signaling.send({
        type: "ice_candidate",
        call_id: this.callId,
        candidate: event.candidate ? event.candidate.toJSON() : null,
      });
    };

    this.pc.onconnectionstatechange = () => {
      const state = this.pc.connectionState;
      if (state === "connected") {
        useAppStore.getState().updateActiveCall({
          status: "active",
          startedAt: useAppStore.getState().activeCall?.startedAt ?? Date.now(),
        });
      } else if (state === "failed" || state === "closed") {
        // upstream caller decides what to do
      }
    };
  }

  async startLocalMedia(): Promise<MediaStream> {
    const { facing } = useAppStore.getState().mediaState;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: { facingMode: facing },
    });
    this.localStream = stream;
    useAppStore.getState().setLocalStream(stream);

    const { micOn, camOn } = useAppStore.getState().mediaState;
    stream.getAudioTracks().forEach((t) => (t.enabled = micOn));
    stream.getVideoTracks().forEach((t) => (t.enabled = camOn));

    stream.getTracks().forEach((track) => this.pc.addTrack(track, stream));
    return stream;
  }

  async createOffer(): Promise<void> {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    signaling.send({ type: "offer", call_id: this.callId, sdp: offer });
  }

  async handleRemoteOffer(sdp: RTCSessionDescriptionInit): Promise<void> {
    await this.pc.setRemoteDescription(sdp);
    this.remoteDescriptionSet = true;
    await this.drainPendingIce();
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    signaling.send({ type: "answer", call_id: this.callId, sdp: answer });
  }

  async handleRemoteAnswer(sdp: RTCSessionDescriptionInit): Promise<void> {
    await this.pc.setRemoteDescription(sdp);
    this.remoteDescriptionSet = true;
    await this.drainPendingIce();
  }

  async addRemoteIce(candidate: RTCIceCandidateInit | null): Promise<void> {
    if (!candidate) return;
    if (!this.remoteDescriptionSet) {
      this.pendingRemoteIce.push(candidate);
      return;
    }
    try {
      await this.pc.addIceCandidate(candidate);
    } catch (err) {
      console.warn("Failed to add ICE candidate", err);
    }
  }

  private async drainPendingIce(): Promise<void> {
    const pending = this.pendingRemoteIce.splice(0);
    for (const cand of pending) {
      try {
        await this.pc.addIceCandidate(cand);
      } catch (err) {
        console.warn("Failed to add buffered ICE candidate", err);
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
    const next = !useAppStore.getState().mediaState.camOn;
    this.localStream.getVideoTracks().forEach((t) => (t.enabled = next));
    useAppStore.getState().setMediaState({ camOn: next });
    return next;
  }

  async switchCamera(): Promise<void> {
    if (!this.localStream) return;
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
  if (activeSession) activeSession.hangup();
  activeSession = new CallSession(callId);
  return activeSession;
}

export function clearSession(): void {
  if (activeSession) {
    activeSession.hangup();
    activeSession = null;
  }
}

import { callDebug, callDebugWarn } from "./callDebug";
import { api } from "./api";
import { useAppStore } from "./store";
import type { CallMediaMode, OnlineUser, PublicUser, SignalingIncoming } from "./types";
import { signaling } from "./websocket";
import { clearSession, getActiveSession, startSession } from "./webrtc";

let directoryDebounce: ReturnType<typeof setTimeout> | null = null;

function scheduleDirectoryRefresh(): void {
  if (directoryDebounce) clearTimeout(directoryDebounce);
  directoryDebounce = setTimeout(() => {
    directoryDebounce = null;
    void refreshFriendsDirectory();
  }, 400);
}

export async function refreshFriendsDirectory(): Promise<void> {
  const { jwt } = useAppStore.getState();
  if (!jwt) return;
  try {
    const data = await api.friendsDirectory(jwt);
    useAppStore.getState().setFriendsDirectory(data);
  } catch (err) {
    console.warn("Failed to refresh friends directory", err);
  }
}

/** @deprecated use refreshFriendsDirectory */
export const refreshDirectory = refreshFriendsDirectory;

function parseMediaMode(raw: string | undefined): CallMediaMode {
  return raw === "audio" ? "audio" : "video";
}

function prepareMediaForCall(mode: CallMediaMode): void {
  useAppStore.getState().setMediaState({
    micOn: true,
    camOn: mode === "video",
    facing: "user",
  });
}

function currentCallMediaMode(): CallMediaMode {
  const call = useAppStore.getState().activeCall;
  const incoming = useAppStore.getState().incomingCall;
  return call?.mediaMode ?? incoming?.mediaMode ?? "video";
}

function endCallLocally(reason: string): void {
  const ac = useAppStore.getState().activeCall;
  const inc = useAppStore.getState().incomingCall;
  callDebug("callFlow.endCallLocally", {
    reason,
    activeCallId: ac?.callId ?? null,
    activeRole: ac?.role ?? null,
    activeStatus: ac?.status ?? null,
    incomingCallId: inc?.callId ?? null,
  });
  clearSession();
  useAppStore.getState().setActiveCall(null);
  useAppStore.getState().setIncomingCall(null);
}

async function startLocalMediaForActiveCall(): Promise<void> {
  const mode = currentCallMediaMode();
  const session = getActiveSession();
  if (!session) return;
  await session.startLocalMedia({ video: mode === "video" });
}

async function handleIncomingOffer(
  callId: string,
  sdp: RTCSessionDescriptionInit,
): Promise<void> {
  let session = getActiveSession();
  if (!session || session.callId !== callId) {
    session = startSession(callId);
    try {
      await startLocalMediaForActiveCall();
    } catch (err) {
      console.error("Local media failed", err);
      signaling.send({
        type: "call_end",
        call_id: callId,
        reason: "callee_local_media_failed_on_offer",
      });
      endCallLocally("incoming_offer_local_media_failed");
      return;
    }
  }
  await session.handleRemoteOffer(sdp);
}

export function installCallFlow(): () => void {
  const offSignaling = signaling.on(async (msg: SignalingIncoming) => {
    switch (msg.type) {
      case "hello":
        await refreshFriendsDirectory();
        break;

      case "presence":
        if (msg.online && msg.user) {
          const u: OnlineUser = { ...msg.user, last_seen: null };
          useAppStore.getState().upsertOnlineUser(u);
        } else {
          useAppStore.getState().removeOnlineUser(msg.user_id);
        }
        scheduleDirectoryRefresh();
        break;

      case "incoming_call":
        if (useAppStore.getState().activeCall || useAppStore.getState().incomingCall) {
          callDebugWarn("callFlow.incoming_call.busy_decline", { call_id: msg.call_id });
          signaling.send({ type: "call_decline", call_id: msg.call_id });
          break;
        }
        useAppStore.getState().setIncomingCall({
          callId: msg.call_id,
          caller: msg.caller,
          mediaMode: parseMediaMode(msg.media_mode),
        });
        break;

      case "call_invited": {
        const mediaMode = parseMediaMode(msg.media_mode);
        prepareMediaForCall(mediaMode);
        const peer =
          useAppStore.getState().onlineUsers.find((u) => u.id === msg.target_user_id) ??
          useAppStore
            .getState()
            .friendsDirectory.offline.find((u) => u.id === msg.target_user_id) ??
          null;
        const fallback: PublicUser = peer ?? {
          id: msg.target_user_id,
          telegram_id: 0,
          username: null,
          first_name: null,
          last_name: null,
          photo_url: null,
          name: `Пользователь №${msg.target_user_id}`,
        };
        useAppStore.getState().setActiveCall({
          callId: msg.call_id,
          peer: fallback,
          role: "caller",
          status: "ringing",
          startedAt: null,
          mediaMode,
        });
        break;
      }

      case "call_accepted": {
        const call = useAppStore.getState().activeCall;
        if (!call || call.callId !== msg.call_id || call.role !== "caller") {
          callDebugWarn("callFlow.call_accepted.ignored", {
            msgCallId: msg.call_id,
            activeCallId: call?.callId,
            role: call?.role,
          });
          break;
        }
        callDebug("callFlow.call_accepted", { callId: msg.call_id, by_user_id: msg.by_user_id });
        useAppStore.getState().updateActiveCall({ status: "connecting" });
        let session = getActiveSession();
        if (!session || session.callId !== call.callId) {
          session = startSession(call.callId);
          try {
            await session.startLocalMedia({ video: call.mediaMode === "video" });
          } catch (err) {
            console.error("Local media failed", err);
            signaling.send({
              type: "call_end",
              call_id: call.callId,
              reason: "caller_local_media_failed_after_accept",
            });
            endCallLocally("caller_local_media_failed");
            break;
          }
        }
        await session.createOffer();
        break;
      }

      case "call_active":
        callDebug("callFlow.call_active", { callId: msg.call_id, peer_user_id: msg.peer_user_id });
        break;

      case "call_declined":
        endCallLocally(`server:call_declined:by=${msg.by_user_id}`);
        break;
      case "call_missed":
        endCallLocally("server:call_missed");
        break;
      case "call_cancelled":
        endCallLocally("server:call_cancelled");
        break;
      case "call_ended":
        endCallLocally(
          `server:call_ended:reason=${msg.reason ?? "?"}:by=${msg.by_user_id ?? "?"}`,
        );
        break;

      case "offer":
        await handleIncomingOffer(msg.call_id, msg.sdp);
        break;

      case "answer": {
        const session = getActiveSession();
        if (session && session.callId === msg.call_id) {
          await session.handleRemoteAnswer(msg.sdp);
        }
        break;
      }

      case "ice_candidate": {
        const session = getActiveSession();
        if (session && session.callId === msg.call_id) {
          await session.addRemoteIce(msg.candidate);
        }
        break;
      }

      case "error":
        callDebugWarn("callFlow.server_error", { message: msg.message, call_id: msg.call_id });
        if (!msg.call_id) {
          window.alert(msg.message);
        } else {
          endCallLocally(`server_error:${msg.message}`);
        }
        break;

      case "pong":
        break;
    }
  });

  const offConn = signaling.onConnection((connected) => {
    callDebug("callFlow.ws.socket", { connected });
    useAppStore.getState().setWsConnected(connected);
    if (connected) void refreshFriendsDirectory();
  });

  return () => {
    offSignaling();
    offConn();
  };
}

export async function placeCall(
  targetUserId: number,
  mode: CallMediaMode = "video",
): Promise<void> {
  if (useAppStore.getState().activeCall) return;
  prepareMediaForCall(mode);
  callDebug("callFlow.placeCall", { targetUserId, mode });
  signaling.send({ type: "call_invite", target_user_id: targetUserId, media_mode: mode });
}

export async function acceptIncomingCall(): Promise<void> {
  const incoming = useAppStore.getState().incomingCall;
  if (!incoming) return;

  prepareMediaForCall(incoming.mediaMode);
  callDebug("callFlow.acceptIncomingCall", {
    callId: incoming.callId,
    mediaMode: incoming.mediaMode,
  });
  const session = startSession(incoming.callId);
  try {
    await session.startLocalMedia({ video: incoming.mediaMode === "video" });
  } catch (err) {
    callDebugWarn("callFlow.acceptIncomingCall.local_media_failed", { err: String(err) });
    signaling.send({ type: "call_decline", call_id: incoming.callId });
    useAppStore.getState().setIncomingCall(null);
    clearSession();
    return;
  }

  useAppStore.getState().setActiveCall({
    callId: incoming.callId,
    peer: incoming.caller,
    role: "callee",
    status: "connecting",
    startedAt: null,
    mediaMode: incoming.mediaMode,
  });
  useAppStore.getState().setIncomingCall(null);

  signaling.send({ type: "call_accept", call_id: incoming.callId });
}

export function declineIncomingCall(): void {
  const incoming = useAppStore.getState().incomingCall;
  if (!incoming) return;
  callDebug("callFlow.declineIncomingCall", { callId: incoming.callId });
  signaling.send({ type: "call_decline", call_id: incoming.callId });
  useAppStore.getState().setIncomingCall(null);
}

export function hangUp(): void {
  const call = useAppStore.getState().activeCall;
  if (call) {
    callDebug("callFlow.hangUp.user", { callId: call.callId });
    signaling.send({ type: "call_end", call_id: call.callId, reason: "user_hangup" });
  }
  endCallLocally("user_hangUp");
}

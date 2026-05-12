export interface PublicUser {
  id: number;
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  name: string;
}

export interface OnlineUser extends PublicUser {
  last_seen: string | null;
}

export type CallStatus = "ringing" | "incoming" | "connecting" | "active" | "ended";

export interface ActiveCall {
  callId: string;
  peer: PublicUser;
  role: "caller" | "callee";
  status: CallStatus;
  startedAt: number | null;
}

export interface IncomingCall {
  callId: string;
  caller: PublicUser;
}

export interface MediaState {
  micOn: boolean;
  camOn: boolean;
  facing: "user" | "environment";
}

export type SignalingOutgoing =
  | { type: "ping" }
  | { type: "call_invite"; target_user_id: number }
  | { type: "call_accept"; call_id: string }
  | { type: "call_decline"; call_id: string }
  | { type: "offer"; call_id: string; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; call_id: string; sdp: RTCSessionDescriptionInit }
  | { type: "ice_candidate"; call_id: string; candidate: RTCIceCandidateInit | null }
  | { type: "call_end"; call_id: string };

export interface ServerHello {
  type: "hello";
  user: PublicUser;
}
export interface IncomingCallMessage {
  type: "incoming_call";
  call_id: string;
  caller: PublicUser;
}
export interface CallInvitedMessage {
  type: "call_invited";
  call_id: string;
  target_user_id: number;
}
export interface CallAcceptedMessage {
  type: "call_accepted";
  call_id: string;
  by_user_id: number;
}
export interface CallActiveMessage {
  type: "call_active";
  call_id: string;
  peer_user_id: number;
}
export interface CallDeclinedMessage {
  type: "call_declined";
  call_id: string;
  by_user_id: number;
}
export interface CallEndedMessage {
  type: "call_ended";
  call_id: string;
  by_user_id?: number;
  reason?: string;
}
export interface CallMissedMessage {
  type: "call_missed";
  call_id: string;
}
export interface CallCancelledMessage {
  type: "call_cancelled";
  call_id: string;
}
export interface OfferMessage {
  type: "offer";
  call_id: string;
  sdp: RTCSessionDescriptionInit;
}
export interface AnswerMessage {
  type: "answer";
  call_id: string;
  sdp: RTCSessionDescriptionInit;
}
export interface IceCandidateMessage {
  type: "ice_candidate";
  call_id: string;
  candidate: RTCIceCandidateInit | null;
}
export interface PresenceMessage {
  type: "presence";
  user_id: number;
  online: boolean;
  user?: PublicUser;
}
export interface PongMessage {
  type: "pong";
}
export interface ErrorMessage {
  type: "error";
  message: string;
  call_id?: string;
}

export type SignalingIncoming =
  | ServerHello
  | IncomingCallMessage
  | CallInvitedMessage
  | CallAcceptedMessage
  | CallActiveMessage
  | CallDeclinedMessage
  | CallEndedMessage
  | CallMissedMessage
  | CallCancelledMessage
  | OfferMessage
  | AnswerMessage
  | IceCandidateMessage
  | PresenceMessage
  | PongMessage
  | ErrorMessage;

import { create } from "zustand";
import type {
  ActiveCall,
  IncomingCall,
  MediaState,
  OnlineUser,
  PublicUser,
} from "./types";

interface AppState {
  jwt: string | null;
  user: PublicUser | null;
  authLoading: boolean;
  authError: string | null;

  wsConnected: boolean;

  onlineUsers: OnlineUser[];

  incomingCall: IncomingCall | null;
  activeCall: ActiveCall | null;

  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  mediaState: MediaState;

  setAuth: (jwt: string, user: PublicUser) => void;
  setAuthLoading: (loading: boolean) => void;
  setAuthError: (msg: string | null) => void;
  clearAuth: () => void;

  setWsConnected: (connected: boolean) => void;

  setOnlineUsers: (users: OnlineUser[]) => void;
  upsertOnlineUser: (user: OnlineUser) => void;
  removeOnlineUser: (userId: number) => void;

  setIncomingCall: (call: IncomingCall | null) => void;
  setActiveCall: (call: ActiveCall | null) => void;
  updateActiveCall: (patch: Partial<ActiveCall>) => void;

  setLocalStream: (stream: MediaStream | null) => void;
  setRemoteStream: (stream: MediaStream | null) => void;
  setMediaState: (patch: Partial<MediaState>) => void;
}

export const useAppStore = create<AppState>((set) => ({
  jwt: null,
  user: null,
  authLoading: false,
  authError: null,

  wsConnected: false,

  onlineUsers: [],

  incomingCall: null,
  activeCall: null,

  localStream: null,
  remoteStream: null,
  mediaState: { micOn: true, camOn: true, facing: "user" },

  setAuth: (jwt, user) => set({ jwt, user, authError: null }),
  setAuthLoading: (authLoading) => set({ authLoading }),
  setAuthError: (authError) => set({ authError }),
  clearAuth: () =>
    set({
      jwt: null,
      user: null,
      onlineUsers: [],
      incomingCall: null,
      activeCall: null,
      wsConnected: false,
    }),

  setWsConnected: (wsConnected) => set({ wsConnected }),

  setOnlineUsers: (onlineUsers) => set({ onlineUsers }),
  upsertOnlineUser: (user) =>
    set((state) => {
      const others = state.onlineUsers.filter((u) => u.id !== user.id);
      return { onlineUsers: [...others, user] };
    }),
  removeOnlineUser: (userId) =>
    set((state) => ({
      onlineUsers: state.onlineUsers.filter((u) => u.id !== userId),
    })),

  setIncomingCall: (incomingCall) => set({ incomingCall }),
  setActiveCall: (activeCall) => set({ activeCall }),
  updateActiveCall: (patch) =>
    set((state) =>
      state.activeCall ? { activeCall: { ...state.activeCall, ...patch } } : state,
    ),

  setLocalStream: (localStream) => set({ localStream }),
  setRemoteStream: (remoteStream) => set({ remoteStream }),
  setMediaState: (patch) =>
    set((state) => ({ mediaState: { ...state.mediaState, ...patch } })),
}));

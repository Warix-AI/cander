/**
 * GPT-Live-1 duplex conversation — WebRTC mic ↔ model audio.
 * Client delegation routes tool/search/reasoning through Candor's assistant.
 */

import { getRawOpenAIAuthHeaders } from "@/lib/ai/raw-openai/upload-client";
import { fetchPrivateAiReply } from "@/lib/ai/send-thread-reply";
import {
  buildVoiceDelegationMessages,
  resolveDelegationRequest,
  summarizeForVoiceSpeech,
  voiceDelegationLog,
  type VoiceTranscriptEntry,
} from "@/lib/voice/live-delegation";
import {
  DEFAULT_LIVE_VOICE,
  readLiveVoicePreference,
  type LiveVoiceId,
} from "@/lib/voice/live-voices";

export type LiveConversationHandlers = {
  onSpeakingChange?: (speaking: boolean) => void;
  onError?: (message: string) => void;
  onTranscript?: (role: "user" | "assistant", text: string) => void;
  onSessionStarted?: (sessionId: string) => void;
  workspaceId?: string | null;
  threadId?: string | null;
  voice?: LiveVoiceId;
};

export type LiveConversationSession = {
  stop: () => Promise<void>;
  sessionId: string | null;
};

async function finishConversationMetering(
  aiExecutionId: string,
  status: "completed" | "cancelled" | "failed" | "interrupted",
): Promise<void> {
  try {
    const headers = await getRawOpenAIAuthHeaders();
    if (!headers.Authorization) return;
    await fetch("/api/ai/raw-openai/realtime-conversation-end", {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ aiExecutionId, status }),
    });
  } catch {
    /* best-effort */
  }
}

function sendEvent(dc: RTCDataChannel, event: Record<string, unknown>) {
  if (dc.readyState !== "open") return;
  dc.send(JSON.stringify(event));
}

function appendTranscriptDelta(
  buckets: Map<string, { role: "user" | "assistant"; text: string }>,
  key: string,
  role: "user" | "assistant",
  delta: string,
): string {
  const existing = buckets.get(key);
  const next = (existing?.text ?? "") + delta;
  buckets.set(key, { role, text: next });
  return next;
}

export async function startLiveConversation(
  handlers?: LiveConversationHandlers,
): Promise<LiveConversationSession> {
  let stopped = false;
  let aiExecutionId: string | null = null;
  let sessionId: string | null = null;
  let peer: RTCPeerConnection | null = null;
  let localStream: MediaStream | null = null;
  let remoteAudio: HTMLAudioElement | null = null;
  let dataChannel: RTCDataChannel | null = null;
  let speaking = false;
  let sessionReady = false;

  const transcript: VoiceTranscriptEntry[] = [];
  const openTranscripts = new Map<
    string,
    { role: "user" | "assistant"; text: string }
  >();
  const inFlightDelegations = new Set<string>();

  const setSpeaking = (next: boolean) => {
    if (speaking === next) return;
    speaking = next;
    handlers?.onSpeakingChange?.(next);
  };

  const pushFinalTranscript = (role: "user" | "assistant", text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const last = transcript[transcript.length - 1];
    if (last && last.role === role && last.text === trimmed) return;
    transcript.push({ role, text: trimmed, at: Date.now() });
    handlers?.onTranscript?.(role, trimmed);
  };

  const runDelegation = async (delegationId: string) => {
    if (inFlightDelegations.has(delegationId)) return;
    inFlightDelegations.add(delegationId);

    const requestText = resolveDelegationRequest(transcript);
    voiceDelegationLog("delegation_created", {
      sessionId,
      delegationId,
      requestText: requestText.slice(0, 240),
      transcriptLen: transcript.length,
    });

    if (!requestText) {
      voiceDelegationLog("delegation_missing_request", {
        sessionId,
        delegationId,
      });
      if (dataChannel) {
        sendEvent(dataChannel, {
          type: "session.commentary.append",
          event_id: `commentary_${crypto.randomUUID().slice(0, 12)}`,
          delegation_id: delegationId,
          content:
            "I need a bit more detail on what you want me to check.",
        });
      }
      inFlightDelegations.delete(delegationId);
      return;
    }

    if (!handlers?.workspaceId) {
      if (dataChannel) {
        sendEvent(dataChannel, {
          type: "session.commentary.append",
          event_id: `commentary_${crypto.randomUUID().slice(0, 12)}`,
          delegation_id: delegationId,
          content: "I couldn't reach Candor for that request.",
        });
      }
      inFlightDelegations.delete(delegationId);
      return;
    }

    try {
      voiceDelegationLog("backend_started", {
        sessionId,
        delegationId,
        workspaceId: handlers.workspaceId,
        threadId: handlers.threadId ?? null,
      });

      const messages = buildVoiceDelegationMessages(transcript);
      const result = await fetchPrivateAiReply({
        threadId: handlers.threadId ?? null,
        title: "Voice",
        content: requestText,
        workspaceId: handlers.workspaceId,
        messages,
      });

      const spoken = summarizeForVoiceSpeech(result.content);
      voiceDelegationLog("backend_completed", {
        sessionId,
        delegationId,
        runtime: result.runtime ?? null,
        toolCount: result.toolResults?.length ?? 0,
        spokenPreview: spoken.slice(0, 240),
        pausedForUser: Boolean(result.pausedForUser),
      });

      if (dataChannel) {
        sendEvent(dataChannel, {
          type: "session.commentary.append",
          event_id: `commentary_${crypto.randomUUID().slice(0, 12)}`,
          delegation_id: delegationId,
          content: spoken,
        });
        voiceDelegationLog("commentary_appended", {
          sessionId,
          delegationId,
        });
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Backend request failed.";
      voiceDelegationLog("backend_failed", {
        sessionId,
        delegationId,
        error: message.slice(0, 300),
      });
      if (dataChannel) {
        sendEvent(dataChannel, {
          type: "session.commentary.append",
          event_id: `commentary_${crypto.randomUUID().slice(0, 12)}`,
          delegation_id: delegationId,
          content:
            "I couldn't get that lookup to complete. Want me to try again?",
        });
      }
      handlers?.onError?.(message);
    } finally {
      inFlightDelegations.delete(delegationId);
    }
  };

  const handleServerEvent = (raw: string) => {
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }
    const type = typeof event.type === "string" ? event.type : "";

    if (type === "session.started") {
      sessionReady = true;
      const session = event.session as { id?: string } | undefined;
      if (typeof session?.id === "string") {
        sessionId = session.id;
        handlers?.onSessionStarted?.(session.id);
      }
      return;
    }

    if (type === "session.input_transcript.delta") {
      const delta = typeof event.delta === "string" ? event.delta : "";
      const itemId =
        (typeof event.item_id === "string" && event.item_id) ||
        (typeof event.event_id === "string" && event.event_id) ||
        "input";
      if (delta) {
        appendTranscriptDelta(openTranscripts, `in:${itemId}`, "user", delta);
        setSpeaking(true);
      }
      return;
    }

    if (type === "session.output_transcript.delta") {
      const delta = typeof event.delta === "string" ? event.delta : "";
      const itemId =
        (typeof event.item_id === "string" && event.item_id) ||
        (typeof event.event_id === "string" && event.event_id) ||
        "output";
      if (delta) {
        appendTranscriptDelta(
          openTranscripts,
          `out:${itemId}`,
          "assistant",
          delta,
        );
        setSpeaking(true);
      }
      return;
    }

    // Finalize incomplete streams when a new turn boundary is useful.
    if (
      type === "session.input_audio.speech_started" ||
      type === "session.input_audio.speech_stopped"
    ) {
      for (const [key, value] of openTranscripts) {
        if (!key.startsWith("in:")) continue;
        pushFinalTranscript(value.role, value.text);
        openTranscripts.delete(key);
      }
      if (type === "session.input_audio.speech_stopped") setSpeaking(false);
      if (type === "session.input_audio.speech_started") setSpeaking(true);
      return;
    }

    if (type === "session.delegation.created") {
      // Flush pending user transcript before reconstructing the request.
      for (const [key, value] of openTranscripts) {
        if (!key.startsWith("in:")) continue;
        pushFinalTranscript(value.role, value.text);
        openTranscripts.delete(key);
      }
      const delegation = event.delegation as { id?: string } | undefined;
      const delegationId =
        typeof delegation?.id === "string" ? delegation.id : "";
      if (delegationId) void runDelegation(delegationId);
      return;
    }

    if (type === "error") {
      const err = event.error as { message?: string } | undefined;
      handlers?.onError?.(err?.message || "Live voice error.");
      return;
    }

    // Legacy Realtime event names — tolerate during migration.
    if (
      type === "conversation.item.input_audio_transcription.completed" &&
      typeof event.transcript === "string"
    ) {
      pushFinalTranscript("user", event.transcript);
    }
    if (
      (type === "response.output_audio_transcript.done" ||
        type === "response.audio_transcript.done") &&
      typeof event.transcript === "string"
    ) {
      pushFinalTranscript("assistant", event.transcript);
    }
  };

  peer = new RTCPeerConnection();
  peer.addTransceiver("audio", { direction: "sendrecv" });

  remoteAudio = document.createElement("audio");
  remoteAudio.autoplay = true;
  remoteAudio.setAttribute("playsinline", "true");
  remoteAudio.style.display = "none";
  document.body.appendChild(remoteAudio);

  peer.ontrack = (event) => {
    if (!remoteAudio) return;
    const stream = event.streams[0] ?? new MediaStream([event.track]);
    remoteAudio.srcObject = stream;
    void remoteAudio.play().catch(() => {
      /* orb click usually unlocks autoplay */
    });
  };

  localStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  for (const track of localStream.getAudioTracks()) {
    peer.addTrack(track, localStream);
  }

  dataChannel = peer.createDataChannel("oai-events");
  dataChannel.addEventListener("message", (ev) => {
    if (typeof ev.data === "string") handleServerEvent(ev.data);
  });

  peer.ondatachannel = (ev) => {
    if (!ev.channel) return;
    dataChannel = ev.channel;
    dataChannel.addEventListener("message", (msg) => {
      if (typeof msg.data === "string") handleServerEvent(msg.data);
    });
  };

  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);

  await new Promise<void>((resolve, reject) => {
    if (!peer) {
      resolve();
      return;
    }
    if (peer.iceGatheringState === "complete") {
      resolve();
      return;
    }
    const timer = window.setTimeout(() => {
      peer?.removeEventListener("icegatheringstatechange", onState);
      reject(new Error("Timed out while gathering ICE candidates."));
    }, 10_000);
    const onState = () => {
      if (peer?.iceGatheringState !== "complete") return;
      window.clearTimeout(timer);
      peer.removeEventListener("icegatheringstatechange", onState);
      resolve();
    };
    peer.addEventListener("icegatheringstatechange", onState);
  });

  if (stopped) {
    throw new Error("Voice session cancelled.");
  }

  const localSdp = peer.localDescription?.sdp ?? offer.sdp ?? "";
  const headers = await getRawOpenAIAuthHeaders();
  if (!headers.Authorization) {
    throw new Error("Sign in to use voice.");
  }

  const voice = handlers?.voice ?? readLiveVoicePreference() ?? DEFAULT_LIVE_VOICE;
  const response = await fetch(
    "/api/ai/raw-openai/realtime-conversation-token",
    {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        "Idempotency-Key": `rt-conversation:${Date.now()}`,
      },
      body: JSON.stringify({
        sdp: localSdp,
        workspaceId: handlers?.workspaceId ?? undefined,
        voice,
      }),
    },
  );

  const data = (await response.json().catch(() => ({}))) as {
    sdp?: string;
    sessionId?: string;
    aiExecutionId?: string;
    error?: string;
  };

  if (!response.ok || !data.sdp || !data.aiExecutionId) {
    throw new Error(data.error || "Could not start Live voice session.");
  }

  aiExecutionId = data.aiExecutionId;
  sessionId = data.sessionId ?? null;
  await peer.setRemoteDescription({ type: "answer", sdp: data.sdp });

  // Flush partial transcripts periodically when speech ends via inactivity.
  const flushTimer = window.setInterval(() => {
    if (stopped) return;
    for (const [key, value] of openTranscripts) {
      if (value.text.trim().length < 8) continue;
      // Keep accumulating until a clearer boundary; only finalize long idle outs.
      if (key.startsWith("out:") && value.text.trim().endsWith(".")) {
        pushFinalTranscript(value.role, value.text);
        openTranscripts.delete(key);
        setSpeaking(false);
      }
    }
  }, 2_500);

  const stop = async () => {
    if (stopped) return;
    stopped = true;
    window.clearInterval(flushTimer);
    setSpeaking(false);
    for (const value of openTranscripts.values()) {
      pushFinalTranscript(value.role, value.text);
    }
    openTranscripts.clear();

    try {
      if (dataChannel && dataChannel.readyState === "open" && sessionReady) {
        sendEvent(dataChannel, { type: "session.close" });
        await new Promise((r) => window.setTimeout(r, 250));
      }
    } catch {
      /* ignore */
    }
    try {
      dataChannel?.close();
    } catch {
      /* ignore */
    }
    dataChannel = null;
    try {
      for (const track of localStream?.getTracks() ?? []) track.stop();
    } catch {
      /* ignore */
    }
    localStream = null;
    try {
      peer?.close();
    } catch {
      /* ignore */
    }
    peer = null;
    if (remoteAudio) {
      try {
        remoteAudio.pause();
        remoteAudio.srcObject = null;
        remoteAudio.remove();
      } catch {
        /* ignore */
      }
      remoteAudio = null;
    }
    if (aiExecutionId) {
      await finishConversationMetering(aiExecutionId, "completed");
      aiExecutionId = null;
    }
  };

  return { stop, sessionId };
}

export function isLiveConversationSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof RTCPeerConnection !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

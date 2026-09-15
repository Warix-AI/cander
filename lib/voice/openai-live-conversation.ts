/**
 * GPT-Live-1 duplex conversation — WebRTC mic ↔ model audio.
 * Search/reasoning uses OpenAI Responses delegation (fast Live path).
 *
 * Connection order matches OpenAI's Live WebRTC quickstart:
 * ontrack → getUserMedia → addTrack → oai-events → offer → ICE →
 * POST /v1/live/sessions (via our API) → setRemoteDescription → wait session.started.
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
import { getAssistantProfileSnapshot } from "@/lib/voice/assistant-profile";
import { prepareVoiceDelegationTurn } from "@/lib/voice/voice-delegation-context";
import { createVoiceDelegationNarrator } from "@/lib/voice/voice-delegation-progress";
import { playVoiceReadyChime } from "@/lib/voice/voice-ready-chime";
import {
  LIVE_IDLE_TIMEOUT_MS,
  isLiveSessionBusyForIdle,
} from "@/lib/voice/live-idle";
import {
  delegationStatusForRequest,
  type VoiceLiveStatus,
} from "@/lib/voice/voice-status";

export type LiveConversationHandlers = {
  onSpeakingChange?: (speaking: boolean) => void;
  onStatusChange?: (status: VoiceLiveStatus) => void;
  onError?: (message: string) => void;
  onTranscript?: (role: "user" | "assistant", text: string) => void;
  onSessionStarted?: (sessionId: string) => void;
  /** Fired when the session ends due to true idle (~60s). */
  onIdleTimeout?: () => void;
  workspaceId?: string | null;
  threadId?: string | null;
  voice?: LiveVoiceId;
  /** When set, multi-step / tool work delegates through this Expert's runAgent. */
  expertProjectId?: string | null;
  expertAgentId?: string | null;
};

const IDLE_TIMEOUT_MS = LIVE_IDLE_TIMEOUT_MS;

export type LiveConversationSession = {
  stop: () => Promise<void>;
  sessionId: string | null;
  /** Append updated personality prose mid-session (non-voice profile changes). */
  appendPersonalityInstructions: (text: string) => void;
};

export { LIVE_IDLE_TIMEOUT_MS, isLiveSessionBusyForIdle } from "@/lib/voice/live-idle";

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

function sendEvent(dc: RTCDataChannel | null, event: Record<string, unknown>) {
  if (!dc || dc.readyState !== "open") return;
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

async function waitForIceComplete(
  peer: RTCPeerConnection,
  timeoutMs = 1_200,
): Promise<void> {
  if (peer.iceGatheringState === "complete") return;
  await new Promise<void>((resolve) => {
    const timer = window.setTimeout(() => {
      peer.removeEventListener("icegatheringstatechange", onState);
      resolve();
    }, timeoutMs);
    const onState = () => {
      if (peer.iceGatheringState !== "complete") return;
      window.clearTimeout(timer);
      peer.removeEventListener("icegatheringstatechange", onState);
      resolve();
    };
    peer.addEventListener("icegatheringstatechange", onState);
    onState();
  });
}

function waitForDataChannelOpen(
  channel: RTCDataChannel,
  timeoutMs = 12_000,
): Promise<void> {
  if (channel.readyState === "open") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      channel.removeEventListener("open", onOpen);
      reject(new Error("Timed out waiting for the Live data channel."));
    }, timeoutMs);
    const onOpen = () => {
      window.clearTimeout(timer);
      channel.removeEventListener("open", onOpen);
      resolve();
    };
    channel.addEventListener("open", onOpen);
    if (channel.readyState === "open") onOpen();
  });
}

/** Keep autoplay unlocked after the click gesture (awaits break user activation). */
function primeAudioPlayback(): HTMLAudioElement {
  const el = document.createElement("audio");
  el.autoplay = true;
  el.setAttribute("playsinline", "true");
  el.volume = 1;
  el.muted = false;
  el.style.position = "fixed";
  el.style.left = "-9999px";
  el.style.width = "1px";
  el.style.height = "1px";
  document.body.appendChild(el);
  // Tiny silent wav — play() during / right after click unlocks later remote audio.
  el.src =
    "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==";
  void el.play().catch(() => {});
  return el;
}

function notifyVoiceReady() {
  playVoiceReadyChime();
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
  let liveStatus: VoiceLiveStatus = "connecting";
  let idleTimer: number | null = null;
  let idleTimedOut = false;
  const inFlightDelegations = new Set<string>();

  const isBusyForIdle = () =>
    isLiveSessionBusyForIdle({
      speaking,
      status: liveStatus,
      inFlightDelegations: inFlightDelegations.size,
    });

  const clearIdleTimer = () => {
    if (idleTimer != null) {
      window.clearTimeout(idleTimer);
      idleTimer = null;
    }
  };

  const armIdleTimer = () => {
    clearIdleTimer();
    if (stopped || idleTimedOut) return;
    idleTimer = window.setTimeout(() => {
      if (stopped || idleTimedOut) return;
      if (isBusyForIdle()) {
        armIdleTimer();
        return;
      }
      idleTimedOut = true;
      voiceDelegationLog("idle_timeout", { sessionId });
      handlers?.onIdleTimeout?.();
      void stop();
    }, IDLE_TIMEOUT_MS);
  };

  const bumpIdle = () => {
    if (stopped || idleTimedOut) return;
    armIdleTimer();
  };

  const setStatus = (next: VoiceLiveStatus) => {
    if (liveStatus === next) return;
    liveStatus = next;
    handlers?.onStatusChange?.(next);
    bumpIdle();
  };

  const transcript: VoiceTranscriptEntry[] = [];
  const openTranscripts = new Map<
    string,
    { role: "user" | "assistant"; text: string }
  >();

  const setSpeaking = (next: boolean) => {
    if (speaking === next) return;
    speaking = next;
    handlers?.onSpeakingChange?.(next);
    bumpIdle();
    if (next) {
      if (liveStatus !== "thinking" && liveStatus !== "searching") {
        setStatus("speaking");
      }
    } else if (
      sessionReady &&
      liveStatus !== "thinking" &&
      liveStatus !== "searching" &&
      liveStatus !== "listening"
    ) {
      setStatus("listening");
    }
  };

  const pushFinalTranscript = (role: "user" | "assistant", text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const last = transcript[transcript.length - 1];
    if (last && last.role === role && last.text === trimmed) return;
    transcript.push({ role, text: trimmed, at: Date.now() });
    handlers?.onTranscript?.(role, trimmed);
    bumpIdle();
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
      sendEvent(dataChannel, {
        type: "session.commentary.append",
        event_id: `commentary_${crypto.randomUUID().slice(0, 12)}`,
        delegation_id: delegationId,
        content: "I need a bit more detail on what you want me to check.",
      });
      inFlightDelegations.delete(delegationId);
      setStatus("listening");
      return;
    }

    if (!handlers?.workspaceId) {
      sendEvent(dataChannel, {
        type: "session.commentary.append",
        event_id: `commentary_${crypto.randomUUID().slice(0, 12)}`,
        delegation_id: delegationId,
        content: "I couldn't reach Candor for that request.",
      });
      inFlightDelegations.delete(delegationId);
      setStatus("listening");
      return;
    }

    setStatus(delegationStatusForRequest(requestText));
    bumpIdle();

    const sendCommentary = (content: string) => {
      sendEvent(dataChannel, {
        type: "session.commentary.append",
        event_id: `commentary_${crypto.randomUUID().slice(0, 12)}`,
        delegation_id: delegationId,
        content,
      });
      setStatus("speaking");
      bumpIdle();
    };

    const narrator = createVoiceDelegationNarrator({
      sendCommentary,
    });

    try {
      voiceDelegationLog("backend_started", {
        sessionId,
        delegationId,
        workspaceId: handlers.workspaceId,
        threadId: handlers.threadId ?? null,
        expertAgentId: handlers.expertAgentId ?? null,
      });

      // Expert voice: progress cue, then specialized runAgent path.
      if (
        handlers.expertAgentId &&
        handlers.expertProjectId &&
        handlers.workspaceId
      ) {
        narrator.open({ requestText });
        setStatus("thinking");
        const { runAgentClient } = await import("@/lib/agents/client");
        const { notifyAgentRuntimeRefresh } = await import(
          "@/components/agents/AgentRuntimeTranscript"
        );
        const result = await runAgentClient({
          workspaceId: handlers.workspaceId,
          projectId: handlers.expertProjectId,
          agentId: handlers.expertAgentId,
          message: requestText,
        });
        notifyAgentRuntimeRefresh({
          projectId: handlers.expertProjectId,
          agentId: handlers.expertAgentId,
        });
        const spoken = summarizeForVoiceSpeech(
          result.content || result.run.summary || "Done.",
        );
        voiceDelegationLog("expert_backend_completed", {
          sessionId,
          delegationId,
          runId: result.run.id,
          toolCount: result.toolCount,
          spokenPreview: spoken.slice(0, 240),
        });
        narrator.finish();
        sendCommentary(spoken);
        setStatus("speaking");
        return;
      }

      const turn = prepareVoiceDelegationTurn({
        workspaceId: handlers.workspaceId,
        requestText,
      });

      narrator.open({
        requestText,
        connectorId: turn.connectorId,
        focusedTitle: turn.focusedTitle,
        needsBrowser: turn.needsBrowserPreflight && !turn.focusedItemId,
      });

      // Browser tabs: read the visible page client-side (same as chat preflight).
      let browserEvidence = "";
      if (turn.needsBrowserPreflight && !turn.focusedItemId) {
        narrator.say("Looking at the page you're on…");
        try {
          const { preflightActiveBrowserContext } = await import(
            "@/lib/ai/orchestrator/browser-context-preflight"
          );
          const preflight = await preflightActiveBrowserContext(
            {
              content: requestText,
              title: "Live voice",
              workspaceId: handlers.workspaceId,
              messages: [],
            },
            {
              onProgress: (progress) => {
                narrator.fromProgress(progress);
              },
            },
          );
          const okChunks = preflight.toolResults
            .filter((r) => r.ok && r.output.trim())
            .map((r) => r.output.trim());
          if (okChunks.length) {
            browserEvidence = [
              "## Active browser page (already read)",
              ...okChunks,
            ].join("\n\n");
            narrator.say("Got the page — reading it now…");
          }
        } catch (err) {
          voiceDelegationLog("browser_preflight_failed", {
            sessionId,
            delegationId,
            error: err instanceof Error ? err.message.slice(0, 200) : "unknown",
          });
        }
      }

      const systemContent = [turn.systemContent, browserEvidence]
        .filter(Boolean)
        .join("\n\n");

      const messages = [
        { role: "system" as const, content: systemContent },
        ...buildVoiceDelegationMessages(transcript, {
          maxEntries: 10,
          maxChars: 4_000,
        }),
      ];

      voiceDelegationLog("backend_scoped", {
        sessionId,
        delegationId,
        connectorId: turn.connectorId,
        focusedItemId: turn.focusedItemId,
        selectedConnectionIds: turn.selectedConnectionIds,
        projectId: turn.projectId,
        hasBrowserEvidence: Boolean(browserEvidence),
      });

      // Opening line already covers the focused App/item; only add a
      // mid-flight cue when we have a specific item title beyond the app label.
      if (
        turn.focusedItemId &&
        turn.focusedTitle &&
        turn.connectorLabel &&
        turn.focusedTitle !== turn.connectorLabel
      ) {
        narrator.say(`Looking at ${turn.focusedTitle.slice(0, 64)}…`);
      }

      const result = await fetchPrivateAiReply({
        threadId: handlers.threadId ?? null,
        title: "Voice",
        content: requestText,
        workspaceId: handlers.workspaceId,
        projectId: turn.projectId,
        selectedConnectionId: turn.selectedConnectionId,
        selectedConnectionIds: turn.selectedConnectionIds,
        messages,
        onProgress: (progress) => {
          narrator.fromProgress(progress);
          if (progress.phase === "tool" || progress.phase === "thinking") {
            setStatus(
              progress.phase === "tool" &&
                /\bsearch|web|look/i.test(
                  `${progress.toolName ?? ""} ${progress.label}`,
                )
                ? "searching"
                : "thinking",
            );
          }
        },
      });

      const spoken = summarizeForVoiceSpeech(result.content);
      voiceDelegationLog("backend_completed", {
        sessionId,
        delegationId,
        runtime: result.runtime ?? null,
        toolCount: result.toolResults?.length ?? 0,
        spokenPreview: spoken.slice(0, 240),
      });

      narrator.finish();
      sendCommentary(spoken);
      voiceDelegationLog("commentary_appended", { sessionId, delegationId });
      setStatus("speaking");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Backend request failed.";
      voiceDelegationLog("backend_failed", {
        sessionId,
        delegationId,
        error: message.slice(0, 300),
      });
      narrator.finish();
      sendCommentary(
        "I couldn't get that lookup to complete. Want me to try again?",
      );
      handlers?.onError?.(message);
      setStatus("listening");
    } finally {
      narrator.finish();
      inFlightDelegations.delete(delegationId);
      bumpIdle();
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
      voiceDelegationLog("session_started", { sessionId });
      setStatus("listening");
      return;
    }

    if (type === "session.input_transcript.delta") {
      const delta = typeof event.delta === "string" ? event.delta : "";
      // Live often omits item_id; never key by event_id or each word becomes its own bubble.
      const itemId =
        typeof event.item_id === "string" && event.item_id
          ? event.item_id
          : "active";
      if (delta) {
        appendTranscriptDelta(openTranscripts, `in:${itemId}`, "user", delta);
        setSpeaking(true);
        setStatus("listening");
      }
      return;
    }

    if (type === "session.output_transcript.delta") {
      const delta = typeof event.delta === "string" ? event.delta : "";
      const itemId =
        typeof event.item_id === "string" && event.item_id
          ? event.item_id
          : "active";
      if (delta) {
        appendTranscriptDelta(
          openTranscripts,
          `out:${itemId}`,
          "assistant",
          delta,
        );
        setSpeaking(true);
        if (liveStatus !== "thinking" && liveStatus !== "searching") {
          setStatus("speaking");
        }
      }
      return;
    }

    if (type === "session.input_audio.speech_stopped") {
      const parts: string[] = [];
      for (const [key, value] of [...openTranscripts.entries()]) {
        if (!key.startsWith("in:")) continue;
        if (value.text.trim()) parts.push(value.text.trim());
        openTranscripts.delete(key);
      }
      if (parts.length) {
        pushFinalTranscript("user", parts.join(" "));
      }
      setSpeaking(false);
      if (liveStatus !== "thinking" && liveStatus !== "searching") {
        setStatus("listening");
      }
      return;
    }

    if (type === "session.input_audio.speech_started") {
      setSpeaking(true);
      setStatus("listening");
      return;
    }

    if (type === "session.delegation.created") {
      const parts: string[] = [];
      for (const [key, value] of [...openTranscripts.entries()]) {
        if (!key.startsWith("in:")) continue;
        if (value.text.trim()) parts.push(value.text.trim());
        openTranscripts.delete(key);
      }
      if (parts.length) {
        pushFinalTranscript("user", parts.join(" "));
      }
      // Responses delegation: OpenAI runs the backend; no Candor agent loop.
      const delegation = event.delegation as
        | { id?: string; target?: string }
        | undefined;
      const target =
        typeof delegation?.target === "string" ? delegation.target : "";
      if (target === "responses" || !target) {
        setStatus("thinking");
        bumpIdle();
        return;
      }
      // Legacy client-delegation sessions (should not start anymore).
      const delegationId =
        typeof delegation?.id === "string" ? delegation.id : "";
      if (delegationId) void runDelegation(delegationId);
      return;
    }

    if (type === "error") {
      const err = event.error as { message?: string } | undefined;
      const message = err?.message || "Live voice error.";
      voiceDelegationLog("session_error", { sessionId, message });
      handlers?.onError?.(message);
      return;
    }

    // Legacy Realtime event names — tolerate if a fallback path is used.
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
  remoteAudio = primeAudioPlayback();
  setStatus("connecting");

  peer.ontrack = (event) => {
    if (!remoteAudio) return;
    const stream = event.streams[0] ?? new MediaStream([event.track]);
    remoteAudio.srcObject = stream;
    void remoteAudio.play().catch((err) => {
      const message =
        err instanceof Error ? err.message : String(err);
      voiceDelegationLog("audio_play_failed", { error: message });
      handlers?.onError?.(
        "Could not play assistant audio. Check that sound is unmuted.",
      );
    });
  };

  // Official Live WebRTC order: mic tracks first, then data channel, then offer.
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  } catch (err) {
    throw new Error(
      err instanceof Error && /Permission|NotAllowed/i.test(err.message)
        ? "Microphone permission is required for Voice."
        : "Could not access the microphone.",
    );
  }

  for (const track of localStream.getAudioTracks()) {
    track.enabled = true;
    peer.addTrack(track, localStream);
  }

  dataChannel = peer.createDataChannel("oai-events");
  dataChannel.addEventListener("message", (ev) => {
    if (typeof ev.data === "string") handleServerEvent(ev.data);
  });
  dataChannel.addEventListener("open", () => {
    voiceDelegationLog("data_channel_open", { sessionId });
  });

  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);
  await waitForIceComplete(peer);

  if (stopped) {
    throw new Error("Voice session cancelled.");
  }

  const localSdp = peer.localDescription?.sdp ?? offer.sdp ?? "";
  if (!localSdp.trim()) {
    throw new Error("Missing local SDP offer.");
  }

  const headers = await getRawOpenAIAuthHeaders();
  if (!headers.Authorization) {
    throw new Error("Sign in to use voice.");
  }

  const voice =
    handlers?.voice ?? readLiveVoicePreference() ?? DEFAULT_LIVE_VOICE;
  const profile = getAssistantProfileSnapshot();
  voiceDelegationLog("session_create_request", {
    voice,
    workspaceId: handlers?.workspaceId ?? null,
  });
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
        profile,
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
  voiceDelegationLog("session_create_ok", {
    sessionId,
    aiExecutionId,
  });
  await peer.setRemoteDescription({ type: "answer", sdp: data.sdp });

  // Open the data channel quickly; don't block UI on session.started.
  await waitForDataChannelOpen(dataChannel, 5_000);
  if (stopped) throw new Error("Voice session cancelled.");

  let readyChimePlayed = false;
  const tryReadyCue = () => {
    if (stopped || readyChimePlayed) return;
    readyChimePlayed = true;
    notifyVoiceReady();
    voiceDelegationLog("ready_chime_played", { sessionId });
  };

  if (sessionReady) {
    tryReadyCue();
  } else {
    // Chime as soon as the Live engine confirms start (non-blocking).
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (stopped) {
        window.clearInterval(timer);
        return;
      }
      if (sessionReady) {
        window.clearInterval(timer);
        tryReadyCue();
        setStatus("listening");
        return;
      }
      if (Date.now() - startedAt > 8_000) {
        window.clearInterval(timer);
        voiceDelegationLog("session_started_timeout", { sessionId });
        // Still cue so the user knows mic path is up.
        tryReadyCue();
      }
    }, 50);
  }

  setStatus("listening");
  armIdleTimer();

  const flushTimer = window.setInterval(() => {
    if (stopped) return;
    for (const [key, value] of [...openTranscripts.entries()]) {
      if (!key.startsWith("out:")) continue;
      const trimmed = value.text.trim();
      // Finalize only when we have a real spoken sentence, not a lone "."
      if (trimmed.length > 1 && /[.!?]$/.test(trimmed)) {
        pushFinalTranscript(value.role, value.text);
        openTranscripts.delete(key);
        setSpeaking(false);
        if (liveStatus !== "thinking" && liveStatus !== "searching") {
          setStatus("listening");
        }
      }
    }
  }, 2_500);

  const stop = async () => {
    if (stopped) return;
    stopped = true;
    clearIdleTimer();
    window.clearInterval(flushTimer);
    setSpeaking(false);
    // Join leftover fragments so stop doesn't dump word-per-bubble.
    const userParts: string[] = [];
    const assistantParts: string[] = [];
    for (const [key, value] of openTranscripts.entries()) {
      const t = value.text.trim();
      if (!t) continue;
      if (key.startsWith("in:")) userParts.push(t);
      else if (key.startsWith("out:")) assistantParts.push(t);
    }
    openTranscripts.clear();
    if (userParts.length) {
      pushFinalTranscript("user", userParts.join(" "));
    }
    if (assistantParts.length) {
      pushFinalTranscript("assistant", assistantParts.join(" "));
    }

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

  const appendPersonalityInstructions = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || stopped) return;
    sendEvent(dataChannel, {
      type: "session.instructions.append",
      event_id: `instr_${crypto.randomUUID().slice(0, 12)}`,
      instructions: trimmed,
    });
    bumpIdle();
  };

  return { stop, sessionId, appendPersonalityInstructions };
}

export function isLiveConversationSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof RTCPeerConnection !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

/**
 * OpenAI Realtime Live conversation — WebRTC mic ↔ model audio.
 * Composer mic stays dictation-only; this is for the header voice orb.
 */

import { getRawOpenAIAuthHeaders } from "@/lib/ai/raw-openai/upload-client";

const CALLS_URL = "https://api.openai.com/v1/realtime/calls";

export type LiveConversationHandlers = {
  onSpeakingChange?: (speaking: boolean) => void;
  onError?: (message: string) => void;
  onTranscript?: (role: "user" | "assistant", text: string) => void;
  workspaceId?: string | null;
};

export type LiveConversationSession = {
  stop: () => Promise<void>;
};

type PendingToolCall = {
  callId: string;
  name: string;
  arguments: string;
};

async function fetchConversationClientSecret(
  workspaceId?: string | null,
): Promise<{ clientSecret: string; aiExecutionId: string }> {
  const headers = await getRawOpenAIAuthHeaders();
  if (!headers.Authorization) {
    throw new Error("Sign in to use voice.");
  }
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
        workspaceId: workspaceId ?? undefined,
      }),
    },
  );
  const data = (await response.json().catch(() => ({}))) as {
    clientSecret?: string;
    aiExecutionId?: string;
    error?: string;
  };
  if (!response.ok || !data.clientSecret || !data.aiExecutionId) {
    throw new Error(data.error || "Could not start Live voice session.");
  }
  return {
    clientSecret: data.clientSecret,
    aiExecutionId: data.aiExecutionId,
  };
}

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

async function executeRealtimeTool(input: {
  name: string;
  arguments: string;
  callId: string;
  workspaceId?: string | null;
}): Promise<string> {
  const headers = await getRawOpenAIAuthHeaders();
  if (!headers.Authorization) {
    return JSON.stringify({ error: "Unauthorized." });
  }
  const response = await fetch("/api/ai/raw-openai/realtime-tool", {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: input.name,
      arguments: input.arguments,
      callId: input.callId,
      workspaceId: input.workspaceId ?? undefined,
    }),
  });
  const data = (await response.json().catch(() => ({}))) as {
    output?: string;
    error?: string;
  };
  if (typeof data.output === "string") return data.output;
  if (data.error) return JSON.stringify({ error: data.error });
  return JSON.stringify({ error: "Tool execution failed." });
}

function sendEvent(dc: RTCDataChannel, event: Record<string, unknown>) {
  if (dc.readyState !== "open") return;
  dc.send(JSON.stringify(event));
}

function attachDataChannelHandlers(
  dc: RTCDataChannel,
  onMessage: (raw: string) => void,
) {
  dc.addEventListener("message", (ev) => {
    if (typeof ev.data === "string") onMessage(ev.data);
  });
}

export async function startLiveConversation(
  handlers?: LiveConversationHandlers,
): Promise<LiveConversationSession> {
  let stopped = false;
  let aiExecutionId: string | null = null;
  let peer: RTCPeerConnection | null = null;
  let localStream: MediaStream | null = null;
  let remoteAudio: HTMLAudioElement | null = null;
  let dataChannel: RTCDataChannel | null = null;
  let speaking = false;
  const pendingCalls = new Map<string, PendingToolCall>();
  const completedCallIds = new Set<string>();

  const setSpeaking = (next: boolean) => {
    if (speaking === next) return;
    speaking = next;
    handlers?.onSpeakingChange?.(next);
  };

  const { clientSecret, aiExecutionId: executionId } =
    await fetchConversationClientSecret(handlers?.workspaceId);
  aiExecutionId = executionId;

  if (stopped) {
    await finishConversationMetering(executionId, "cancelled");
    throw new Error("Voice session cancelled.");
  }

  peer = new RTCPeerConnection();
  // Ensure we negotiate bidirectional audio (mic out + model in).
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
      /* user gesture from orb click usually unlocks autoplay */
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

  const handleServerEvent = async (raw: string) => {
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }
    const type = typeof event.type === "string" ? event.type : "";

    if (
      type === "input_audio_buffer.speech_started" ||
      type === "output_audio_buffer.started" ||
      type === "response.output_audio.delta" ||
      type === "response.audio.delta"
    ) {
      setSpeaking(true);
    }
    if (
      type === "input_audio_buffer.speech_stopped" ||
      type === "output_audio_buffer.stopped" ||
      type === "response.done" ||
      type === "response.output_audio.done" ||
      type === "response.audio.done"
    ) {
      setSpeaking(false);
    }

    if (
      type === "conversation.item.input_audio_transcription.completed" &&
      typeof event.transcript === "string" &&
      event.transcript.trim()
    ) {
      handlers?.onTranscript?.("user", event.transcript.trim());
    }
    if (
      (type === "response.output_audio_transcript.done" ||
        type === "response.audio_transcript.done") &&
      typeof event.transcript === "string" &&
      event.transcript.trim()
    ) {
      handlers?.onTranscript?.("assistant", event.transcript.trim());
    }

    if (type === "response.output_item.added") {
      const item = event.item as Record<string, unknown> | undefined;
      if (item?.type === "function_call") {
        const callId =
          (typeof item.call_id === "string" && item.call_id) ||
          (typeof item.id === "string" && item.id) ||
          "";
        const name = typeof item.name === "string" ? item.name : "";
        if (callId && name) {
          pendingCalls.set(callId, {
            callId,
            name,
            arguments: typeof item.arguments === "string" ? item.arguments : "",
          });
        }
      }
    }

    if (type === "response.function_call_arguments.delta") {
      const callId =
        (typeof event.call_id === "string" && event.call_id) || "";
      const delta = typeof event.delta === "string" ? event.delta : "";
      if (callId && delta) {
        const existing = pendingCalls.get(callId);
        if (existing) {
          existing.arguments += delta;
        }
      }
    }

    const runToolCall = async (call: PendingToolCall) => {
      if (!dataChannel || completedCallIds.has(call.callId)) return;
      completedCallIds.add(call.callId);
      setSpeaking(false);
      const output = await executeRealtimeTool({
        name: call.name,
        arguments: call.arguments || "{}",
        callId: call.callId,
        workspaceId: handlers?.workspaceId,
      });
      sendEvent(dataChannel, {
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: call.callId,
          output,
        },
      });
      sendEvent(dataChannel, { type: "response.create" });
      pendingCalls.delete(call.callId);
    };

    if (type === "response.function_call_arguments.done") {
      const callId =
        (typeof event.call_id === "string" && event.call_id) ||
        (typeof event.item_id === "string" && event.item_id) ||
        "";
      const name =
        (typeof event.name === "string" && event.name) ||
        pendingCalls.get(callId)?.name ||
        "";
      const args =
        typeof event.arguments === "string"
          ? event.arguments
          : pendingCalls.get(callId)?.arguments || "{}";
      if (callId && name) {
        await runToolCall({ callId, name, arguments: args });
      }
    }

    if (type === "response.output_item.done") {
      const item = event.item as Record<string, unknown> | undefined;
      if (item?.type === "function_call") {
        const callId =
          (typeof item.call_id === "string" && item.call_id) ||
          (typeof item.id === "string" && item.id) ||
          "";
        const name = typeof item.name === "string" ? item.name : "";
        const args =
          typeof item.arguments === "string" ? item.arguments : "{}";
        if (callId && name) {
          await runToolCall({ callId, name, arguments: args });
        }
      }
    }

    if (type === "error") {
      const err = event.error as { message?: string } | undefined;
      handlers?.onError?.(err?.message || "Live voice error.");
    }
  };

  dataChannel = peer.createDataChannel("oai-events");
  attachDataChannelHandlers(dataChannel, (raw) => {
    void handleServerEvent(raw);
  });

  peer.ondatachannel = (ev) => {
    if (!ev.channel) return;
    dataChannel = ev.channel;
    attachDataChannelHandlers(ev.channel, (raw) => {
      void handleServerEvent(raw);
    });
  };

  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);

  // Wait briefly for ICE candidates so the SDP is more complete.
  await new Promise<void>((resolve) => {
    if (!peer) {
      resolve();
      return;
    }
    if (peer.iceGatheringState === "complete") {
      resolve();
      return;
    }
    const done = () => {
      peer?.removeEventListener("icegatheringstatechange", onState);
      window.clearTimeout(timer);
      resolve();
    };
    const onState = () => {
      if (peer?.iceGatheringState === "complete") done();
    };
    const timer = window.setTimeout(done, 1500);
    peer.addEventListener("icegatheringstatechange", onState);
  });

  const localSdp = peer.localDescription?.sdp ?? offer.sdp ?? "";
  const sdpResponse = await fetch(CALLS_URL, {
    method: "POST",
    body: localSdp,
    headers: {
      Authorization: `Bearer ${clientSecret}`,
      "Content-Type": "application/sdp",
    },
  });

  if (!sdpResponse.ok) {
    const errText = await sdpResponse.text().catch(() => "");
    await finishConversationMetering(executionId, "failed");
    aiExecutionId = null;
    throw new Error(
      errText.slice(0, 200) ||
        `Live voice connect failed (${sdpResponse.status}).`,
    );
  }

  const answerSdp = await sdpResponse.text();
  await peer.setRemoteDescription({ type: "answer", sdp: answerSdp });

  const stop = async () => {
    if (stopped) return;
    stopped = true;
    setSpeaking(false);
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

  return { stop };
}

export function isLiveConversationSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof RTCPeerConnection !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

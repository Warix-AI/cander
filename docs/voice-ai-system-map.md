# Cander Voice AI — System Map

Paste this into ChatGPT for review. Scope: Live voice, Voice Settings, AssistantProfile, dictation-adjacent paths, and how preferences persist.

## 1. Product surfaces

| Surface | What it is | Entry |
|---|---|---|
| **Live Voice** | Full-duplex GPT-Live-1 conversation (mic ↔ model audio) via WebRTC | Sidebar / mobile Voice orb |
| **Voice Settings** | Settings → Voice: pick Live voice, rename per voice, suggestion cards | Settings nav |
| **Text chat preferences** | Same profile mutations via `assistant.profile.apply` | Chat / Voice Settings cards → `sendMessage` |
| **Expert Voice** | Separate Expert Projects voice delivery (not per-user personality) | Expert builder `voiceEnabled` |
| **Dictation / TTS** | Separate from Live: `text-to-speech` helpers; Live uses model audio out | Not the Live WebRTC path |

## 2. Core data model — `AssistantProfile`

Source: `lib/voice/assistant-profile.ts`  
Storage: `localStorage` key `cander:assistant-profile:v1` + Supabase `user_assistant_profile`  
Sync: `lib/api/assistant-profile-sync.ts` (hydrate on auth, debounce upsert, flush on apply)

```
assistantName          string|null   // legacy global name
voiceNames             map voiceId → custom name   // per-voice rename
userName               string|null   // how to address the human
voiceId                LiveVoiceId|null
pace, energy, warmth, expressiveness,
humor, sarcasm, formality, conciseness,
directness, backchannelLevel          // each INTEGER 1–10
demeanor               string|null
customStyleInstructions string[]
```

**Scale rule:** every continuous personality knob is **1–10** (integers). User can ask “what’s your humor setting at?” → model answers with the ledger number.

**Name resolution** (`resolveAssistantDisplayName`):
1. `voiceNames[activeVoiceId]` if set  
2. else legacy `assistantName`  
3. else catalog label for that voice (Charlie, Grace, …)

## 3. Live voice catalog (OpenAI GPT-Live-1)

Source: `lib/voice/live-voices.ts` — API ids must match OpenAI Live `audio.output.voice`.

| API id | Default persona label | Presentation | Accent / style |
|---|---|---|---|
| marin | Charlie | masculine | Default warm |
| gleam | Grace | feminine | North American |
| meridian | Miles | masculine | North American |
| vesper | Henry | masculine | British |
| willow | Wren | feminine | Irish |
| stone | Caleb | masculine | Irish |
| quartz | Quinn | feminine | Australian |
| ripple | Riley | masculine | Australian |
| delta | Della | feminine | Southern U.S. |
| cinder | Cole | masculine | Southern U.S. |
| beacon | Ben | masculine | Filipino |
| bossa | Beatriz | feminine | Brazilian Portuguese |
| tempo | Thiago | masculine | Brazilian Portuguese |

Voice change while Live is active → **rollover** (stop session, start new with same thread) in `AppProvider`.

## 4. Live session pipeline

```
User toggles Voice
  → AppProvider.startLiveConversation
  → getUserMedia + RTCPeerConnection + data channel
  → POST /api/ai/raw-openai/realtime-conversation-token
       body: { sdp, workspaceId, voice, profile }
  → OpenAI /v1/live/sessions (model gpt-live-1, client delegation)
  → Ready chime (no spoken “I’m listening”)
  → Duplex audio + oai-events data channel
```

**Instructions baked at session start**
- `buildLivePersonalityInstructions(profile)` → natural style prose + identity + **settings ledger (1–10)**
- `buildLiveConversationInstructions(voice, profile)` wraps Live base policy (delegation, Apps, interruptions)

**Mid-session**
- Non-voice profile changes → `session.instructions.append` with updated personality block
- Voice id change → full stop/start rollover (OpenAI cannot hot-swap voice mid-session)

**Idle**
- `LIVE_IDLE_TIMEOUT_MS = 60_000`
- Busy if speaking / connecting / thinking / searching / speaking status / in-flight delegation
- On idle: teardown mic/peer; transcript note “Voice ended due to inactivity” (no spoken announce)

**Delegation**
- Live frontend stays thin; tool/search/App work → Candor backend via client delegation
- Preference **changes** delegate → `assistant.profile.apply`
- Preference **readouts** (name / humor level) answered locally from ledger — do not need tools
- Long tool turns speak mid-flight via `session.commentary.append` (`lib/voice/voice-delegation-progress.ts`): opening ack, tool/progress lines, throttled heartbeats (“Still checking…”), then final answer commentary

## 5. Preference mutation path (single write path)

```
User speaks / types / taps Settings suggestion card
  → normal chat turn (sendMessage) OR Live delegation turn
  → model calls assistant.profile.apply
  → lib/voice/apply-assistant-profile-tool.ts
  → patchAssistantProfile / renameVoice / undo / reset
  → localStorage + emit event + flushAssistantProfileRemoteSync
  → Live append instructions OR voice rollover
```

**Important:** Voice Settings suggestion cards **never** write the profile directly; they only `sendMessage(phrase)`.

**Voice picker in Settings** *does* write voiceId / rename directly (explicit control surface), then flushes sync.

## 6. Prompt / tool surfaces

| Location | Role |
|---|---|
| `lib/ai/tools/registry.ts` | Tool schema `assistant.profile.apply` |
| `lib/ai/tools/domains.ts` | Domain `preferences`; intent unlock patterns |
| `lib/ai/tools/prompt.ts` | Protocol rules for when to call the tool |
| `lib/ai/runtime/tools.ts` | Client executor |
| `lib/voice/realtime-tools.ts` | Live + VOICE_DELEGATION_SYSTEM |
| `lib/ai/raw-openai/run-turn.ts` | Injects identity + ledger into text chat system |

## 7. Voice Settings UI

`components/settings/VoiceSettings.tsx`

1. **Voice grid** — all LIVE_VOICE_OPTIONS; select sets `voiceId`
2. **Rename field** — per-voice name via `renameVoice`
3. **Try saying… cards** — 10 categories from `voice-suggestion-catalog.ts` (Humor, Sarcasm, Pace, Energy, Personality, Tone, Length, Voice, Name, Expressiveness)

Layout: 2-col desktop / 1-col mobile.

## 8. Persistence & bootstrap

```
Auth → bootstrapSupabaseAssistantProfile
  if remote exists: mergeAssistantProfiles(remote, local)
    (never wipe local assistantName/userName/voiceNames with null)
  else if local non-default: upsert remote

Profile change → debounce 700ms upsert
Apply / rename / voice pick → requestAssistantProfileFlush (immediate)
```

## 9. Related but out of Live path

| Piece | Notes |
|---|---|
| `lib/voice/text-to-speech.ts` | Speak assistant text (non-Live) |
| Expert `voiceEnabled` | Expert dock / scheduled voice delivery |
| On-device identity (`cander-on-device-identity-v1`) | Also updated when `userName` is set |
| Account menu **Admin** | Platform admins: General → Admin (no Cander product dropdown) |

## 10. Known constraints / review prompts for ChatGPT

1. OpenAI Live exposes **~13 voices**, not unlimited custom TTS; accents/style are fixed per id.
2. Voice cannot change mid-session without restart (rollover).
3. Personality style prose intentionally avoids “speak at humor=8”, but a **ledger** exists so the model can report exact 1–10 values when asked.
4. Cards are conversational; voice pick + rename are direct Settings controls (intentional exception).
5. Dictation (speech-to-text for the composer) is **not** the same subsystem as GPT-Live duplex — call that out if proposing unified UX.
6. Expert voice is separate from user AssistantProfile.

## 11. Quick test checklist

- [ ] Settings → Voice: pick British / Australian / female voice; hear change after Live restart/rollover  
- [ ] Rename active voice to “Avery”; new chat + Live both say Avery  
- [ ] Switch to another voice → catalog or that voice’s own name (not Avery unless renamed there)  
- [ ] “What’s your humor setting at?” → integer answer  
- [ ] “Turn humor up” → tool apply → confirm new number  
- [ ] “My name is Matt” → persists across chats  
- [ ] General menu: Admin under Settings (platform admin only); New is top of sidebar  
- [ ] 60s silence ends Voice with inactivity note  


/**
 * Alias for ChatGPT-style dictation clients.
 * Reuses the raw OpenAI transcription endpoint.
 */
export { POST } from "@/app/api/ai/raw-openai/transcribe/route";
export const runtime = "nodejs";

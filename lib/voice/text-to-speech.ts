/**
 * Device text-to-speech for voice-mode replies.
 */

export function isTextToSpeechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function stopTextToSpeech() {
  if (!isTextToSpeechSupported()) return;
  window.speechSynthesis.cancel();
}

export function speakText(
  text: string,
  opts?: { rate?: number; onEnd?: () => void },
): void {
  if (!isTextToSpeechSupported()) {
    opts?.onEnd?.();
    return;
  }
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) {
    opts?.onEnd?.();
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(cleaned.slice(0, 1200));
  utterance.rate = opts?.rate ?? 1.02;
  utterance.onend = () => opts?.onEnd?.();
  utterance.onerror = () => opts?.onEnd?.();
  window.speechSynthesis.speak(utterance);
}

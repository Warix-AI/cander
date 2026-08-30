type DeliverResult =
  | { ok: true }
  | { ok: false; error: string; status: number };

type InputBridge = {
  sendReliable(message: string): Promise<boolean>;
};

const MOUSE_FIELDS = [
  "type",
  "eventType",
  "x",
  "y",
  "button",
  "clickCount",
  "deltaX",
  "deltaY",
  "modifiers",
] as const;

const KEYBOARD_FIELDS = [
  "type",
  "eventType",
  "key",
  "code",
  "text",
  "modifiers",
  "windowsVirtualKeyCode",
] as const;

function isSupportedInputEvent(
  value: unknown,
): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const type = String((value as Record<string, unknown>).type ?? "");
  return type === "input_mouse" || type === "input_keyboard";
}

/** Strip non-protocol fields (e.g. sessionId) so stream servers don't ignore events. */
export function sanitizeStreamInputEvent(
  event: Record<string, unknown>,
): Record<string, unknown> {
  const type = String(event.type ?? "");
  const fields = type === "input_keyboard" ? KEYBOARD_FIELDS : MOUSE_FIELDS;
  const cleaned: Record<string, unknown> = {};
  for (const field of fields) {
    if (event[field] !== undefined) {
      cleaned[field] = event[field];
    }
  }

  if (type === "input_mouse") {
    cleaned.x = Math.round(Number(cleaned.x ?? 0));
    cleaned.y = Math.round(Number(cleaned.y ?? 0));
    const eventType = String(cleaned.eventType ?? "");
    // Match agent-browser dashboard: clickCount only on press.
    if (eventType === "mousePressed") {
      cleaned.clickCount = Number(cleaned.clickCount ?? 1) || 1;
      cleaned.button = cleaned.button ?? "left";
    } else if (eventType === "mouseReleased") {
      cleaned.clickCount = 0;
      cleaned.button = cleaned.button ?? "left";
    } else if (eventType === "mouseMoved") {
      cleaned.button = cleaned.button ?? "none";
      cleaned.clickCount = 0;
    } else if (eventType === "mouseWheel") {
      cleaned.button = cleaned.button ?? "none";
      cleaned.clickCount = 0;
    }
  }

  return cleaned;
}

export async function deliverStreamInput(
  _sessionId: string,
  body: Record<string, unknown>,
  bridge: InputBridge,
): Promise<DeliverResult> {
  const messageType = String(body.type ?? "").trim();
  const payloads: Record<string, unknown>[] = [];

  if (messageType === "input_batch") {
    if (!Array.isArray(body.events) || body.events.length === 0) {
      return {
        ok: false,
        error: "input_batch requires a non-empty events array.",
        status: 400,
      };
    }
    for (const event of body.events) {
      if (!isSupportedInputEvent(event)) {
        return {
          ok: false,
          error: "Each batched event must be input_mouse or input_keyboard.",
          status: 400,
        };
      }
      payloads.push(sanitizeStreamInputEvent(event));
    }
  } else if (messageType === "input_mouse" || messageType === "input_keyboard") {
    payloads.push(sanitizeStreamInputEvent(body));
  } else {
    return {
      ok: false,
      error: "Unsupported input type. Use input_mouse, input_keyboard, or input_batch.",
      status: 400,
    };
  }

  for (const payload of payloads) {
    const sent = await bridge.sendReliable(JSON.stringify(payload));
    if (!sent) {
      return {
        ok: false,
        error:
          "Browser stream is not ready — click was not delivered. Wait for connected and try again.",
        status: 503,
      };
    }
  }

  return { ok: true };
}

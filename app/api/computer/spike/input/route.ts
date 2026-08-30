import { NextResponse } from "next/server";
import { requireComputerAuth } from "@/lib/computer/spike/auth";
import {
  resolveInputBridge,
  resolveSandboxForSession,
} from "@/lib/computer/session-runtime";
import { getOrCreateStreamBridge } from "@/lib/computer/spike/stream-bridge";
import { deliverStreamInput } from "@/lib/computer/stream-input";
import {
  deliverMouseViaCli,
  mouseEventsForCli,
} from "@/lib/computer/mouse-cli-input";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  const auth = await requireComputerAuth(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const sessionId = String(body.sessionId ?? "").trim();
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required." }, { status: 400 });
  }

  const resolved = await resolveInputBridge(sessionId, auth.userId);
  if (!resolved.ok) {
    return NextResponse.json(
      { ok: false, error: resolved.error },
      { status: resolved.status },
    );
  }

  const mouseEvents = mouseEventsForCli(body);
  // #region agent log
  fetch('http://127.0.0.1:7521/ingest/0b7940f7-640a-4835-98e0-f86faa434abe',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'20f195'},body:JSON.stringify({sessionId:'20f195',runId:'pre-fix',hypothesisId:'A_B',location:'spike/input/route.ts:entry',message:'input route received',data:{sessionId,bodyType:body.type,mouseEventCount:mouseEvents.length,mouseEvents,controlMode:resolved.record.controlMode},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  if (mouseEvents.length > 0) {
    // Prefer CLI mouse path — stream WS CDP omits `buttons` and often no-ops.
    try {
      const sandboxResolved = await resolveSandboxForSession(sessionId, auth.userId);
      // #region agent log
      fetch('http://127.0.0.1:7521/ingest/0b7940f7-640a-4835-98e0-f86faa434abe',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'20f195'},body:JSON.stringify({sessionId:'20f195',runId:'pre-fix',hypothesisId:'A_C',location:'spike/input/route.ts:sandbox',message:'sandbox resolve for CLI',data:{hasSandbox:!!sandboxResolved?.sandbox,sandboxControl:sandboxResolved?.record.controlMode},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      if (sandboxResolved?.sandbox) {
        const viaCli = await deliverMouseViaCli(sandboxResolved.sandbox, mouseEvents);
        if (viaCli.ok) {
          // #region agent log
          fetch('http://127.0.0.1:7521/ingest/0b7940f7-640a-4835-98e0-f86faa434abe',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'20f195'},body:JSON.stringify({sessionId:'20f195',runId:'pre-fix',hypothesisId:'A_E',location:'spike/input/route.ts:cli-ok',message:'CLI delivery ok',data:{delivery:'cli',urlBefore:viaCli.urlBefore,urlAfter:viaCli.urlAfter,changed:viaCli.urlBefore!==viaCli.urlAfter},timestamp:Date.now()})}).catch(()=>{});
          // #endregion
          return NextResponse.json({
            ok: true,
            delivery: "cli",
            urlBefore: viaCli.urlBefore,
            urlAfter: viaCli.urlAfter,
          });
        }
        // #region agent log
        fetch('http://127.0.0.1:7521/ingest/0b7940f7-640a-4835-98e0-f86faa434abe',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'20f195'},body:JSON.stringify({sessionId:'20f195',runId:'pre-fix',hypothesisId:'A_C',location:'spike/input/route.ts:cli-fail',message:'CLI failed fallback stream',data:{error:!viaCli.ok?viaCli.error:null},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        console.warn("[computer] mouse CLI delivery failed, falling back to stream", viaCli.error);
      }
    } catch (error) {
      // #region agent log
      fetch('http://127.0.0.1:7521/ingest/0b7940f7-640a-4835-98e0-f86faa434abe',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'20f195'},body:JSON.stringify({sessionId:'20f195',runId:'pre-fix',hypothesisId:'A_C',location:'spike/input/route.ts:cli-throw',message:'CLI resolve threw',data:{error:error instanceof Error?error.message:String(error)},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      console.warn("[computer] mouse CLI unavailable, falling back to stream", error);
    }
  }

  const bridge = getOrCreateStreamBridge(sessionId, resolved.streamUrl);
  const delivered = await deliverStreamInput(sessionId, body, bridge);
  if (!delivered.ok) {
    return NextResponse.json(
      { ok: false, error: delivered.error },
      { status: delivered.status },
    );
  }

  // #region agent log
  fetch('http://127.0.0.1:7521/ingest/0b7940f7-640a-4835-98e0-f86faa434abe',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'20f195'},body:JSON.stringify({sessionId:'20f195',runId:'pre-fix',hypothesisId:'A',location:'spike/input/route.ts:stream',message:'used stream fallback',data:{delivery:'stream'},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  return NextResponse.json({ ok: true, delivery: "stream" });
}

import { runAgentBrowserCommand } from "@agent-browser/sandbox/vercel";
import type { AgentBrowserSandbox } from "@/lib/computer/spike/agent-browser-bootstrap";

/**
 * Deliver mouse input through agent-browser CLI.
 * Stream WS Input.dispatchMouseEvent omits the CDP `buttons` bitfield;
 * the CLI mouse path sets it correctly and actually clicks pages.
 */
export async function deliverMouseViaCli(
  sandbox: AgentBrowserSandbox,
  events: Array<Record<string, unknown>>,
): Promise<{ ok: true; urlBefore?: string; urlAfter?: string } | { ok: false; error: string }> {
  try {
    // #region agent log
    let urlBefore = "";
    try {
      const before = await runAgentBrowserCommand(sandbox, ["get", "url", "--json"]);
      urlBefore = String((before.json as { data?: { url?: string } } | undefined)?.data?.url ?? before.stdout ?? "");
      fetch('http://127.0.0.1:7521/ingest/0b7940f7-640a-4835-98e0-f86faa434abe',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'20f195'},body:JSON.stringify({sessionId:'20f195',runId:'pre-fix',hypothesisId:'C_E',location:'mouse-cli-input.ts:before',message:'CLI url before mouse',data:{urlBefore,events},timestamp:Date.now()})}).catch(()=>{});
    } catch (e) {
      fetch('http://127.0.0.1:7521/ingest/0b7940f7-640a-4835-98e0-f86faa434abe',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'20f195'},body:JSON.stringify({sessionId:'20f195',runId:'pre-fix',hypothesisId:'C',location:'mouse-cli-input.ts:before-fail',message:'CLI get url failed',data:{error:e instanceof Error?e.message:String(e)},timestamp:Date.now()})}).catch(()=>{});
    }
    // #endregion

    for (const event of events) {
      if (String(event.type) !== "input_mouse") {
        continue;
      }
      const eventType = String(event.eventType ?? "");
      const x = Math.round(Number(event.x ?? 0));
      const y = Math.round(Number(event.y ?? 0));
      const button = String(event.button ?? "left");

      if (eventType === "mouseMoved" || eventType === "mousePressed") {
        const moved = await runAgentBrowserCommand(sandbox, ["mouse", "move", String(x), String(y)], {
          json: false,
        });
        // #region agent log
        fetch('http://127.0.0.1:7521/ingest/0b7940f7-640a-4835-98e0-f86faa434abe',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'20f195'},body:JSON.stringify({sessionId:'20f195',runId:'pre-fix',hypothesisId:'C',location:'mouse-cli-input.ts:move',message:'CLI mouse move',data:{x,y,exitCode:moved.exitCode,stdout:String(moved.stdout??'').slice(0,200),stderr:String(moved.stderr??'').slice(0,200)},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
      }

      if (eventType === "mousePressed") {
        const down = await runAgentBrowserCommand(sandbox, ["mouse", "down", button], { json: false });
        // #region agent log
        fetch('http://127.0.0.1:7521/ingest/0b7940f7-640a-4835-98e0-f86faa434abe',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'20f195'},body:JSON.stringify({sessionId:'20f195',runId:'pre-fix',hypothesisId:'C',location:'mouse-cli-input.ts:down',message:'CLI mouse down',data:{button,exitCode:down.exitCode,stdout:String(down.stdout??'').slice(0,200),stderr:String(down.stderr??'').slice(0,200)},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
      } else if (eventType === "mouseReleased") {
        const up = await runAgentBrowserCommand(sandbox, ["mouse", "up", button], { json: false });
        // #region agent log
        fetch('http://127.0.0.1:7521/ingest/0b7940f7-640a-4835-98e0-f86faa434abe',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'20f195'},body:JSON.stringify({sessionId:'20f195',runId:'pre-fix',hypothesisId:'C',location:'mouse-cli-input.ts:up',message:'CLI mouse up',data:{button,exitCode:up.exitCode,stdout:String(up.stdout??'').slice(0,200),stderr:String(up.stderr??'').slice(0,200)},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
      } else if (eventType === "mouseWheel") {
        const dy = Math.round(Number(event.deltaY ?? 0));
        const dx = Math.round(Number(event.deltaX ?? 0));
        await runAgentBrowserCommand(
          sandbox,
          ["mouse", "wheel", String(dy), String(dx)],
          { json: false },
        );
      }
    }

    // #region agent log
    let urlAfter = "";
    try {
      const after = await runAgentBrowserCommand(sandbox, ["get", "url", "--json"]);
      urlAfter = String((after.json as { data?: { url?: string } } | undefined)?.data?.url ?? after.stdout ?? "");
      fetch('http://127.0.0.1:7521/ingest/0b7940f7-640a-4835-98e0-f86faa434abe',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'20f195'},body:JSON.stringify({sessionId:'20f195',runId:'pre-fix',hypothesisId:'E',location:'mouse-cli-input.ts:after',message:'CLI url after mouse',data:{urlBefore,urlAfter,changed:urlBefore!==urlAfter},timestamp:Date.now()})}).catch(()=>{});
    } catch (e) {
      fetch('http://127.0.0.1:7521/ingest/0b7940f7-640a-4835-98e0-f86faa434abe',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'20f195'},body:JSON.stringify({sessionId:'20f195',runId:'pre-fix',hypothesisId:'E',location:'mouse-cli-input.ts:after-fail',message:'CLI get url after failed',data:{error:e instanceof Error?e.message:String(e)},timestamp:Date.now()})}).catch(()=>{});
    }
    // #endregion

    return { ok: true, urlBefore, urlAfter };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // #region agent log
    fetch('http://127.0.0.1:7521/ingest/0b7940f7-640a-4835-98e0-f86faa434abe',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'20f195'},body:JSON.stringify({sessionId:'20f195',runId:'pre-fix',hypothesisId:'C',location:'mouse-cli-input.ts:catch',message:'CLI delivery threw',data:{error:message},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return { ok: false, error: `Mouse CLI delivery failed: ${message}` };
  }
}

/** Collapse a press+release batch into a single move/down/up sequence. */
export function mouseEventsForCli(
  body: Record<string, unknown>,
): Array<Record<string, unknown>> {
  if (String(body.type) === "input_batch" && Array.isArray(body.events)) {
    return body.events.filter(
      (event): event is Record<string, unknown> =>
        typeof event === "object" &&
        event !== null &&
        String((event as Record<string, unknown>).type) === "input_mouse",
    );
  }
  if (String(body.type) === "input_mouse") {
    return [body];
  }
  return [];
}

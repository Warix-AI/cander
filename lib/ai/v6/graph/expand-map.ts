/**
 * Expand map dependencies after parent collection resolves.
 */

import { MAX_MAP_EXPANSION } from "../types.ts";
import type { NormalizedRequest, Request, RequestResult } from "../types.ts";

export function expandMapDependencies(args: {
  normalized: NormalizedRequest[];
  results: Map<string, RequestResult>;
}): NormalizedRequest[] {
  const out: NormalizedRequest[] = [];

  for (const n of args.normalized) {
    const mapDep = n.request.dependencies?.find((d) => d.type === "map");
    if (!mapDep || mapDep.type !== "map") {
      out.push(n);
      continue;
    }

    const parent = args.results.get(mapDep.requestId);
    if (!parent || parent.status === "unresolved" || parent.status === "blocked_upstream") {
      out.push(n);
      continue;
    }

    const members = Array.isArray(parent.value)
      ? parent.value
      : parent.value != null
        ? [parent.value]
        : [];

    const sliced = members.slice(0, MAX_MAP_EXPANSION);
    if (!sliced.length) {
      out.push(n);
      continue;
    }

    for (let i = 0; i < sliced.length; i++) {
      const member = sliced[i];
      const name =
        typeof member === "string"
          ? member
          : typeof member === "object" && member && "name" in member
            ? String((member as { name: unknown }).name)
            : String(member);
      const child: Request = {
        ...n.request,
        id: `${n.request.id}_${i + 1}`,
        subject: { type: "named", value: name },
        dependencies: [{ type: "scalar", requestId: mapDep.requestId }],
        surfaceSpanIds: n.request.surfaceSpanIds,
        qualifiers: {
          ...n.request.qualifiers,
          [mapDep.as]: name,
          mapParent: n.request.id,
        },
      };
      out.push({
        ...n,
        request: child,
      });
    }
  }

  return out;
}

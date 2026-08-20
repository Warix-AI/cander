"use client";

import { useState } from "react";
import { gmailAccount, gmailDrafts } from "@/lib/gmail";

export function ComposePage() {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  return (
    <div className="space-y-4 p-4">
      <div>
        <p className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
          draft_gmail_message · send_gmail_message
        </p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Compose as {gmailAccount}. Drafts stay local until send.
        </p>
      </div>

      <div className="space-y-2 rounded-[10px] border border-border bg-card p-3">
        <Field
          label="To"
          value={to}
          onChange={setTo}
          placeholder="recipient@example.com"
        />
        <Field
          label="Subject"
          value={subject}
          onChange={setSubject}
          placeholder="Subject"
        />
        <label className="block">
          <span className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
            Body
          </span>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={8}
            placeholder="Write your message…"
            className="mt-1 w-full resize-none rounded-lg border border-border bg-card px-3 py-2 text-[13px] outline-none placeholder:text-muted-foreground"
          />
        </label>
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={() =>
              setStatus(
                to && subject
                  ? `draft_gmail_message → draft saved for ${to}`
                  : "Add a recipient and subject to draft.",
              )
            }
            className="inline-flex h-8 items-center rounded-full border border-border px-3 text-[12px] font-medium hover:bg-muted"
          >
            Save draft
          </button>
          <button
            type="button"
            onClick={() =>
              setStatus(
                to && subject
                  ? `send_gmail_message → sent to ${to}`
                  : "Add a recipient and subject to send.",
              )
            }
            className="inline-flex h-8 items-center rounded-full bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:bg-foreground"
          >
            Send
          </button>
        </div>
        {status ? (
          <p className="pt-1 font-mono text-[11px] text-muted-foreground">
            {status}
          </p>
        ) : null}
      </div>

      <div>
        <p className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
          Existing drafts
        </p>
        <ul className="mt-2 space-y-2">
          {gmailDrafts.map((draft) => (
            <li
              key={draft.id}
              className="rounded-[10px] border border-border px-3 py-2.5"
            >
              <p className="text-[13px] font-medium">{draft.subject}</p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                To {draft.to} · {draft.snippet}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-[13px] outline-none placeholder:text-muted-foreground"
      />
    </label>
  );
}

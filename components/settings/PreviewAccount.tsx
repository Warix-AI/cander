"use client";

import { useState } from "react";
import { Check, ChevronDown, ChevronRight } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { Dropdown, MenuRow } from "@/components/ui/Controls";
import { accountPresets } from "@/lib/data";
import { presetForActor } from "@/lib/entitlements";
import type { AccountPresetId } from "@/lib/types";
import { cn } from "@/lib/utils";

const groups = ["Organization", "Personal"] as const;

function RoleList({
  currentId,
  onPick,
}: {
  currentId: AccountPresetId;
  onPick: (id: AccountPresetId) => void;
}) {
  return (
    <>
      {groups.map((group) => (
        <div key={group}>
          <p className="px-3 pt-2 pb-1 font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
            {group}
          </p>
          {accountPresets
            .filter((item) => item.group === group)
            .map((preset) => (
              <div key={preset.id} className="relative pr-7">
                <MenuRow
                  active={preset.id === currentId}
                  title={preset.label}
                  body={preset.hint}
                  onClick={() => onPick(preset.id)}
                />
                {preset.id === currentId ? (
                  <Check
                    className="pointer-events-none absolute top-3 right-3 h-3.5 w-3.5"
                    strokeWidth={1.75}
                  />
                ) : null}
              </div>
            ))}
        </div>
      ))}
    </>
  );
}

export function PreviewAccount({
  compact = false,
  onSelect,
}: {
  compact?: boolean;
  onSelect?: () => void;
}) {
  const { actorId, setPreview } = useApp();
  const currentId = presetForActor(actorId);
  const current =
    accountPresets.find((item) => item.id === currentId) ?? accountPresets[0];

  const pick = (id: AccountPresetId) => {
    setPreview(id);
    onSelect?.();
  };

  if (compact) {
    return <CompactPicker current={current} currentId={currentId} onPick={pick} />;
  }

  return (
    <div className="rounded-[10px] border border-border p-4">
      <p className="font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
        Preview role
      </p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
        Switch who you are signed in as. Same product, different seat and role.
      </p>
      <Dropdown
        className="mt-3 w-full max-w-sm"
        placement="bottom"
        menuClassName="z-[60] max-h-[min(28rem,calc(100vh-2rem))] min-w-[16rem] overflow-y-auto"
        trigger={({ open, toggle }) => (
          <button
            type="button"
            aria-expanded={open}
            aria-haspopup="menu"
            onClick={toggle}
            className="flex h-10 w-full items-center gap-2 rounded-[10px] border border-border bg-background px-3 text-left transition-colors duration-200 hover:bg-muted"
          >
            <span className="min-w-0 flex-1 truncate text-[13.5px]">
              {current.label}
            </span>
            <ChevronDown
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
              strokeWidth={1.6}
            />
          </button>
        )}
      >
        {(close) => (
          <RoleList
            currentId={currentId}
            onPick={(id) => {
              pick(id);
              close();
            }}
          />
        )}
      </Dropdown>
    </div>
  );
}

function CompactPicker({
  current,
  currentId,
  onPick,
}: {
  current: (typeof accountPresets)[number];
  currentId: AccountPresetId;
  onPick: (id: AccountPresetId) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors duration-200 hover:bg-muted"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px]">Preview role</span>
          <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
            {current.label}
          </span>
        </span>
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-90",
          )}
          strokeWidth={1.6}
        />
      </button>
      {open ? (
        <div
          role="menu"
          className="mt-1 max-h-[min(22rem,calc(100vh-12rem))] overflow-y-auto rounded-[10px] border border-border bg-background p-1.5"
        >
          <RoleList
            currentId={currentId}
            onPick={(id) => {
              onPick(id);
              setOpen(false);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

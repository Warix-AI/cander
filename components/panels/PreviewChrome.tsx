"use client";

import type { ReactNode } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  ExternalLink,
  GitCompare,
  Globe,
  Maximize2,
  Minimize2,
  Monitor,
  MousePointer2,
  RotateCw,
  Smartphone,
  SquareStack,
  Tablet,
  Upload,
} from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { PanelToggle } from "@/components/shell/PanelToggle";
import { Dropdown } from "@/components/ui/Controls";
import { useMobileShell } from "@/lib/use-media-query";
import type { BuildTool, ViewportId } from "@/lib/types";
import { cn } from "@/lib/utils";

const ADVANCED_TOOLS: { id: BuildTool; label: string }[] = [
  { id: "files", label: "Files" },
  { id: "editor", label: "Code" },
  { id: "terminal", label: "Terminal" },
  { id: "git", label: "Git" },
  { id: "logs", label: "Logs" },
  { id: "dependencies", label: "Dependencies" },
  { id: "env", label: "Environment variables" },
  { id: "database", label: "Database" },
];

const DEVICES: { id: ViewportId; label: string; icon: typeof Monitor }[] = [
  { id: "desktop", label: "Desktop", icon: Monitor },
  { id: "tablet", label: "Tablet", icon: Tablet },
  { id: "mobile", label: "Mobile", icon: Smartphone },
];

export function previewAddress(name: string | undefined, port = 4100) {
  return {
    url: `http://localhost:${port}`,
    tab: `${name ?? "Preview"} :${port}`,
    port,
  };
}

export function PreviewChrome({
  tool,
  onTool,
  title,
  url,
}: {
  tool: BuildTool;
  onTool: (id: BuildTool) => void;
  title: string;
  url: string;
}) {
  const {
    panelMode,
    setPanelMode,
    viewport,
    setViewport,
    selectMode,
    setSelectMode,
    liveUrl,
    refreshPreview,
    openOverlay,
  } = useApp();
  const mobile = useMobileShell();
  const previewing = tool === "preview";
  const changing = tool === "activity";
  const address = liveUrl ?? url;

  return (
    <div className="min-w-0 shrink-0 overflow-hidden">
      {mobile ? (
        <div className="flex h-10 min-w-0 items-center gap-2 px-3">
          <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={1.6} />
          <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-muted-foreground">
            {address}
          </span>
          <span className="truncate text-[12px] font-medium tracking-[-0.01em]">
            {changing ? "Changes" : title}
          </span>
        </div>
      ) : (
        <>
      <div className="flex h-11 min-w-0 items-center gap-1 px-3">
        <RailBtn
          active={changing}
          label="Changes"
          onClick={() => onTool(changing ? "preview" : "activity")}
        >
          <GitCompare className="h-3.5 w-3.5" strokeWidth={1.6} />
          <span className="text-[12px] font-medium tracking-[-0.01em]">
            Changes
          </span>
        </RailBtn>

        <button
          type="button"
          onClick={() => onTool("preview")}
          className={cn(
            "inline-flex h-7 max-w-[14rem] items-center gap-1.5 rounded-lg px-2 text-[12px] tracking-[-0.01em]",
            previewing
              ? "bg-sidebar-accent text-foreground"
              : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
          )}
        >
          <Globe className="h-3.5 w-3.5 shrink-0" strokeWidth={1.6} />
          <span className="truncate">{title}</span>
        </button>

        <span className="ml-auto flex items-center gap-0.5">
          <RailBtn
            label={panelMode === "immersive" ? "Exit full screen" : "Full screen"}
            onClick={() =>
              setPanelMode(panelMode === "immersive" ? "split" : "immersive")
            }
          >
            {panelMode === "immersive" ? (
              <Minimize2 className="h-3.5 w-3.5" strokeWidth={1.6} />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" strokeWidth={1.6} />
            )}
          </RailBtn>
          <PanelToggle />
        </span>
      </div>

      <div className="flex h-10 min-w-0 items-center gap-0.5 px-3">
        <RailBtn label="Back">
          <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.6} />
        </RailBtn>
        <RailBtn label="Forward">
          <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.6} />
        </RailBtn>
        <RailBtn label="Refresh" onClick={refreshPreview}>
          <RotateCw className="h-3.5 w-3.5" strokeWidth={1.6} />
        </RailBtn>

        <div className="mx-1 flex h-7 min-w-0 flex-1 items-center overflow-hidden rounded-lg border border-border bg-white px-2.5 font-mono text-[11.5px] text-muted-foreground dark:bg-muted/60 dark:border-transparent">
          <span className="truncate">{address}</span>
        </div>

        <span className="ml-0.5 flex shrink-0 items-center gap-0.5">
          {DEVICES.map((device) => {
            const Icon = device.icon;
            return (
              <RailBtn
                key={device.id}
                label={device.label}
                active={viewport === device.id}
                onClick={() => setViewport(device.id)}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={1.6} />
              </RailBtn>
            );
          })}
          <RailBtn
            active={selectMode}
            label="Select element"
            onClick={() => setSelectMode(!selectMode)}
          >
            <MousePointer2 className="h-3.5 w-3.5" strokeWidth={1.6} />
          </RailBtn>
          <RailBtn label="Publish" onClick={() => openOverlay("publish")}>
            <Upload className="h-3.5 w-3.5" strokeWidth={1.6} />
          </RailBtn>
          <AdvancedMenu
            tool={tool}
            onTool={onTool}
            address={address}
            previewing={previewing}
          />
        </span>
      </div>
        </>
      )}
    </div>
  );
}

function AdvancedMenu({
  tool,
  onTool,
  address,
  previewing,
}: {
  tool: BuildTool;
  onTool: (id: BuildTool) => void;
  address: string;
  previewing: boolean;
}) {
  const { advancedMode, setAdvancedMode } = useApp();
  return (
    <Dropdown
      className="shrink-0"
      menuClassName="min-w-[14rem]"
      align="end"
      matchTrigger={false}
      trigger={({ toggle }) => (
        <RailBtn label="More tools" onClick={toggle}>
          <Ellipsis className="h-3.5 w-3.5" strokeWidth={1.6} />
        </RailBtn>
      )}
    >
      {(close) => (
        <>
          <MenuItem
            icon={Globe}
            active={previewing}
            onClick={() => {
              onTool("preview");
              close();
            }}
          >
            Live preview
          </MenuItem>
          <MenuItem
            icon={ExternalLink}
            onClick={() => {
              window.open(address, "_blank");
              close();
            }}
          >
            Open externally
          </MenuItem>
          <div className="my-1.5 mx-2 h-px bg-border" />
          <p className="px-3 py-1 font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
            Advanced tools
          </p>
          {advancedMode ? (
            ADVANCED_TOOLS.map((item) => (
              <MenuItem
                key={item.id}
                active={tool === item.id}
                onClick={() => {
                  onTool(item.id);
                  close();
                }}
              >
                {item.label}
              </MenuItem>
            ))
          ) : (
            <p className="px-3 py-2 text-[12px] leading-relaxed text-muted-foreground">
              Files, Terminal, and Git stay hidden until you need them.
            </p>
          )}
          <MenuItem
            onClick={() => {
              setAdvancedMode(!advancedMode);
              close();
            }}
          >
            {advancedMode ? "Hide advanced tools" : "Show advanced tools"}
          </MenuItem>
        </>
      )}
    </Dropdown>
  );
}

function MenuItem({
  children,
  active,
  onClick,
  icon: Icon,
}: {
  children: string;
  active?: boolean;
  onClick: () => void;
  icon?: typeof Globe;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] tracking-[-0.01em] hover:bg-muted",
        active && "bg-muted",
      )}
    >
      {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.6} /> : null}
      {children}
    </button>
  );
}

function RailBtn({
  label,
  active,
  children,
  onClick,
}: {
  label: string;
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-lg px-1.5 text-muted-foreground transition-colors duration-200 hover:bg-sidebar-accent hover:text-foreground",
        active && "bg-sidebar-accent text-foreground",
      )}
    >
      {children}
    </button>
  );
}

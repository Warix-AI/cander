import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type MarkSize = "xs" | "sm" | "md";

type MarkProps = {
  id: string;
  className?: string;
  size?: MarkSize;
};

export function ConnectorMark({ id, className, size = "md" }: MarkProps) {
  const Mark = marks[id];
  if (Mark) return <Mark className={className} size={size} />;
  return (
    <LetterMark
      letter={id.slice(0, 1).toUpperCase()}
      className={className}
      size={size}
    />
  );
}

function Tile({
  className,
  size = "md",
  children,
}: {
  className?: string;
  size?: MarkSize;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-[10px] bg-muted",
        size === "xs" ? "h-6 w-6" : size === "sm" ? "h-8 w-8" : "h-10 w-10",
        className,
      )}
    >
      {children}
    </span>
  );
}

function Svg({
  children,
  label,
  className,
}: {
  children: ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("h-5 w-5", className)}
      aria-label={label}
      role="img"
    >
      {children}
    </svg>
  );
}

function GmailMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <Tile size={size} className={cn("bg-[#EA4335]/12", className)}>
      <Svg label="Gmail">
        <path fill="#EA4335" d="M1.5 6.75v10.5A2.25 2.25 0 0 0 3.75 19.5h2.25V9.6L12 14.04 18 9.6v9.9h2.25a2.25 2.25 0 0 0 2.25-2.25V6.75L12 13.05Z" />
        <path fill="#4285F4" d="M20.25 4.5H18L12 9.15 6 4.5H3.75A2.25 2.25 0 0 0 1.5 6.75L12 13.05 22.5 6.75A2.25 2.25 0 0 0 20.25 4.5Z" />
        <path fill="#34A853" d="M1.5 6.75 6 9.6v9.9H3.75A2.25 2.25 0 0 1 1.5 17.25Z" />
        <path fill="#FBBC05" d="M18 19.5V9.6l4.5-2.85v10.5A2.25 2.25 0 0 1 20.25 19.5Z" />
      </Svg>
    </Tile>
  );
}

function StripeMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <Tile size={size} className={cn("bg-[#635BFF]/12", className)}>
      <Svg label="Stripe" className="h-[18px] w-[18px]">
        <path
          fill="#635BFF"
          d="M13.98 11.17c0-1.42-.69-2.02-2.02-2.02-1.65 0-3.72.62-5.35 1.62V6.46C8.4 5.9 10.1 5.5 11.92 5.5c3.62 0 6.02 1.9 6.02 5.73v7.27h-3.96v-1.38c-1.13.96-2.74 1.58-4.55 1.58-2.94 0-5.07-1.78-5.07-4.76 0-2.96 2.2-4.7 5.6-4.7 1.56 0 2.8.36 3.98.93v-.73Zm-3.7 5.05c1.5 0 2.9-.7 3.7-1.58v-1.5c-.9-.5-1.98-.82-3.22-.82-1.5 0-2.34.62-2.34 1.84 0 1.2.84 2.06 1.86 2.06Z"
        />
      </Svg>
    </Tile>
  );
}

function GithubMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <Tile size={size} className={className}>
      <Svg label="GitHub">
        <path
          fill="currentColor"
          d="M12 .3C5.37.3 0 5.67 0 12.3c0 5.3 3.44 9.8 8.2 11.39.6.11.82-.26.82-.58 0-.28 0-1.02-.02-2-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.8 1.3 3.49 1 .11-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.11-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.65 1.66.24 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.8 5.62-5.48 5.92.43.37.81 1.1.81 2.22 0 1.6-.01 2.89-.01 3.29 0 .32.22.69.82.57C20.56 22.09 24 17.59 24 12.3 24 5.67 18.63.3 12 .3Z"
        />
      </Svg>
    </Tile>
  );
}

function GcalMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <Tile size={size} className={cn("bg-[#1A73E8]/10", className)}>
      <Svg label="Google Calendar">
        <path fill="#1A73E8" d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
        <path fill="#fff" d="M6.2 5.4h11.6v3.1H6.2z" />
        <path fill="#fff" d="M8.1 11.2h2.2v2.1H8.1zm3.2 0h2.2v2.1h-2.2zm3.2 0h2.2v2.1h-2.2zM8.1 14.3h2.2v2.1H8.1zm3.2 0h2.2v2.1h-2.2z" />
      </Svg>
    </Tile>
  );
}

function SlackMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <Tile size={size} className={className}>
      <Svg label="Slack">
        <path fill="#E01E5A" d="M5.4 15.2a2 2 0 1 1-2-2h2v2Zm1 0a2 2 0 0 1 4 0v5.1a2 2 0 1 1-4 0v-5.1Z" />
        <path fill="#36C5F0" d="M8.8 5.4a2 2 0 1 1 2-2v2h-2Zm0 1a2 2 0 0 1 0 4H3.7a2 2 0 1 1 0-4h5.1Z" />
        <path fill="#2EB67D" d="M18.6 8.8a2 2 0 1 1 2 2h-2v-2Zm-1 0a2 2 0 0 1-4 0V3.7a2 2 0 1 1 4 0v5.1Z" />
        <path fill="#ECB22E" d="M15.2 18.6a2 2 0 1 1-2 2v-2h2Zm0-1a2 2 0 0 1 0-4h5.1a2 2 0 1 1 0 4h-5.1Z" />
      </Svg>
    </Tile>
  );
}

function NotionMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <Tile size={size} className={className}>
      <Svg label="Notion">
        <path
          fill="currentColor"
          d="M4.5 3.6h12.6l3.4 4v12.8H6.7L3.1 16.2V3.6h1.4Zm2.3 2.2v10.8l1.7 1.2h8.8V7.4l-2.2-1.6H6.8Zm2.6 2.1h1.5v7.1l2.7-6.9h1.6l-3.2 7.8H9.4V7.9Z"
        />
      </Svg>
    </Tile>
  );
}

function FigmaMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <Tile size={size} className={className}>
      <Svg label="Figma">
        <path fill="#F24E1E" d="M8.5 2.5h3.5v7H8.5a3.5 3.5 0 1 1 0-7Z" />
        <path fill="#FF7262" d="M12 2.5h3.5a3.5 3.5 0 1 1 0 7H12V2.5Z" />
        <path fill="#A259FF" d="M8.5 9.5h3.5v7H8.5a3.5 3.5 0 0 1 0-7Z" />
        <path fill="#1ABCFE" d="M12 9.5h3.5a3.5 3.5 0 1 1-3.5 3.5V9.5Z" />
        <path fill="#0ACF83" d="M8.5 16.5A3.5 3.5 0 1 1 12 13v3.5H8.5Z" />
      </Svg>
    </Tile>
  );
}

function LinearMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <Tile size={size} className={cn("bg-[#5E6AD2]/12", className)}>
      <Svg label="Linear">
        <path
          fill="#5E6AD2"
          d="M3.4 16.1 16.1 3.4A8.8 8.8 0 0 0 12 2.2 9.8 9.8 0 0 0 2.2 12c0 1.45.43 2.8 1.2 4.1Zm2.3 2.7A9.8 9.8 0 0 0 21.8 12c0-1.45-.43-2.8-1.2-4.1L7.9 20.8c.9.5 1.9.85 3 .95 1.1.1 2.2 0 3.2-.3A9.7 9.7 0 0 1 5.7 18.8Z"
        />
      </Svg>
    </Tile>
  );
}

function HubspotMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <Tile size={size} className={cn("bg-[#FF7A59]/12", className)}>
      <Svg label="HubSpot">
        <circle cx="12" cy="12" r="3.1" fill="#FF7A59" />
        <circle cx="6.2" cy="8" r="1.7" fill="#FF7A59" />
        <circle cx="17.6" cy="7.4" r="1.5" fill="#FF7A59" />
        <circle cx="18.1" cy="16.4" r="1.8" fill="#FF7A59" />
        <circle cx="8.4" cy="17.8" r="1.4" fill="#FF7A59" />
        <path
          fill="none"
          stroke="#FF7A59"
          strokeWidth="1.4"
          d="M7.4 8.8 10 10.6m4.2-.8 2.6-1.8m.6 8.4-2.8-2.1M10.3 14.4 9 16.8"
        />
      </Svg>
    </Tile>
  );
}

function DiscordMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <Tile size={size} className={cn("bg-[#5865F2]/12", className)}>
      <Svg label="Discord">
        <path
          fill="#5865F2"
          d="M19.6 5.2A17.4 17.4 0 0 0 15.4 4l-.4.8a15.2 15.2 0 0 1 3.4 1.4 13.3 13.3 0 0 0-12.8 0A15 15 0 0 1 8.9 4.8L8.6 4A17.5 17.5 0 0 0 4.4 5.2C1.9 9.1 1.2 12.8 1.5 16.5A17.6 17.6 0 0 0 7 19c.3-.5.6-1 .9-1.5a11 11 0 0 1-1.5-.7l.4-.3c3 1.4 6.3 1.4 9.3 0l.4.3c-.5.3-1 .5-1.5.7.3.5.6 1 .9 1.5a17.6 17.6 0 0 0 5.5-2.5c.4-4.2-.6-7.8-3.8-11.3ZM9.3 14.4c-.9 0-1.6-.8-1.6-1.8s.7-1.8 1.6-1.8 1.7.8 1.6 1.8-.7 1.8-1.6 1.8Zm5.4 0c-.9 0-1.6-.8-1.6-1.8s.7-1.8 1.6-1.8 1.7.8 1.6 1.8-.7 1.8-1.6 1.8Z"
        />
      </Svg>
    </Tile>
  );
}

function DropboxMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <Tile size={size} className={cn("bg-[#0061FF]/10", className)}>
      <Svg label="Dropbox">
        <path
          fill="#0061FF"
          d="m12 6.2 4.4 2.8L12 11.8 7.6 9 12 6.2Zm-4.4 4.6L12 13.6l-4.4 2.8L3.2 13.6l4.4-2.8Zm8.8 0 4.4 2.8-4.4 2.8-4.4-2.8 4.4-2.8ZM12 15.4l4.4 2.8L12 21l-4.4-2.8L12 15.4ZM7.6 9 3.2 6.2 7.6 3.4 12 6.2 7.6 9Zm8.8 0L12 6.2l4.4-2.8 4.4 2.8L16.4 9Z"
        />
      </Svg>
    </Tile>
  );
}

function JiraMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <Tile size={size} className={cn("bg-[#2684FF]/12", className)}>
      <Svg label="Jira">
        <path
          fill="#2684FF"
          d="M12.3 12.3 5.2 5.2A8 8 0 0 1 12 3.4c4.4 0 8 3.6 8 8 0 2.6-1.2 4.9-3.2 6.4L12.3 12.3Zm0 0L19 19a8 8 0 0 1-6.9 1.6A8 8 0 0 1 4.4 12C4.4 9.4 5.6 7 7.6 5.6l4.7 6.7Z"
        />
      </Svg>
    </Tile>
  );
}

function LetterMark({
  letter,
  className,
  size,
}: {
  letter: string;
  className?: string;
  size?: MarkSize;
}) {
  return (
    <Tile size={size} className={cn("bg-muted text-foreground/80", className)}>
      <span
        className={cn(
          "font-medium tracking-[-0.04em]",
          size === "xs" ? "text-[10px]" : size === "sm" ? "text-[12px]" : "text-[13px]",
        )}
      >
        {letter}
      </span>
    </Tile>
  );
}

const marks: Record<
  string,
  (props: { className?: string; size?: MarkSize }) => ReactNode
> = {
  gmail: GmailMark,
  stripe: StripeMark,
  github: GithubMark,
  googlecalendar: GcalMark,
  slack: SlackMark,
  notion: NotionMark,
  figma: FigmaMark,
  linear: LinearMark,
  hubspot: HubspotMark,
  discord: DiscordMark,
  dropbox: DropboxMark,
  jira: JiraMark,
};

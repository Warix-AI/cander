import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SHELL_G3_RADIUS } from "@/lib/shell-chrome";

/** `nav` matches lucide sidebar icons (3.5×3.5, no tile). */
type MarkSize = "nav" | "xs" | "sm" | "md";

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

function tileClass(size: MarkSize) {
  if (size === "nav") return "h-3.5 w-3.5 bg-transparent";
  if (size === "xs") return cn("h-6 w-6 bg-muted", SHELL_G3_RADIUS);
  if (size === "sm") return cn("h-8 w-8 bg-muted", SHELL_G3_RADIUS);
  return cn("h-10 w-10 bg-muted", SHELL_G3_RADIUS);
}

function glyphClass(size: MarkSize) {
  if (size === "nav" || size === "xs") return "h-3.5 w-3.5";
  if (size === "sm") return "h-4 w-4";
  return "h-5 w-5";
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
        "inline-flex shrink-0 items-center justify-center",
        tileClass(size),
        className,
        size === "nav" && "!bg-transparent",
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
  size = "md",
}: {
  children: ReactNode;
  label: string;
  className?: string;
  size?: MarkSize;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn(glyphClass(size), className)}
      aria-label={label}
      role="img"
    >
      {children}
    </svg>
  );
}

function GmailMark({ className, size = "md" }: { className?: string; size?: MarkSize }) {
  const uid = useId().replace(/:/g, "");
  const gradA = `gmail-a-${uid}`;
  const gradB = `gmail-b-${uid}`;

  return (
    <Tile
      size={size}
      className={cn("overflow-hidden bg-white p-[3px]", className)}
    >
      <svg
        viewBox="80 0 640 636.36322"
        className="h-full w-full"
        preserveAspectRatio="xMidYMid meet"
        aria-label="Gmail"
        role="img"
      >
        <defs>
          <linearGradient
            id={gradA}
            x1="165"
            x2="165"
            y1="44"
            y2="166"
            gradientUnits="userSpaceOnUse"
            gradientTransform="matrix(4.5454426,0,0,4.5454426,-36.362684,-118.18025)"
          >
            <stop stopColor="#60d673" />
            <stop offset=".17" stopColor="#42c868" />
            <stop offset=".39" stopColor="#0ebc5f" />
            <stop offset=".62" stopColor="#00a9bb" />
            <stop offset=".86" stopColor="#3c90ff" />
            <stop offset="1" stopColor="#3186ff" />
          </linearGradient>
          <linearGradient
            id={gradB}
            x1="8"
            x2="184"
            y1="46.13"
            y2="46.13"
            gradientUnits="userSpaceOnUse"
            gradientTransform="matrix(4.5454426,0,0,4.5454426,-36.362684,-118.18025)"
          >
            <stop offset=".08" stopColor="#ff63a0" />
            <stop offset=".3" stopColor="#fc413d" />
            <stop offset=".5" stopColor="#fc413d" />
            <stop offset=".65" stopColor="#fc413d" />
            <stop offset=".72" stopColor="#fc5c30" />
            <stop offset=".86" stopColor="#feb10c" />
            <stop offset=".91" stopColor="#fec700" />
            <stop offset=".96" stopColor="#ffdb0f" />
          </linearGradient>
        </defs>
        <path
          fill={`url(#${gradA})`}
          d="M627.272 81.819H800V581.818c0 30.123-24.423 54.545-54.545 54.545h-90.909a27.273 27.273 0 0 1-27.273-27.273z"
        />
        <path
          fill="#fc413d"
          d="M172.728 81.819H0V581.818c0 30.123 24.423 54.545 54.545 54.545h90.909a27.273 27.273 0 0 0 27.273-27.273z"
        />
        <path
          fill={`url(#${gradB})`}
          d="M141.937 20.256C105.423-10.435 50.946-5.717 20.255 30.797-10.435 67.306-5.717 121.783 30.796 152.478l345.808 290.677a36.364 36.364 0 0 0 46.795 0L769.208 152.474C805.717 121.783 810.435 67.306 779.744 30.792 749.053-5.717 694.576-10.435 658.067 20.256 399.999 237.182z"
        />
      </svg>
    </Tile>
  );
}

function StripeMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <Tile size={size} className={cn("bg-[#635BFF]/12", className)}>
      <Svg label="Stripe" size={size}>
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
      <Svg label="GitHub" size={size}>
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
      <Svg label="Google Calendar" size={size}>
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
      <Svg label="Slack" size={size}>
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
      <Svg label="Notion" size={size}>
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
      <Svg label="Figma" size={size}>
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
      <Svg label="Linear" size={size}>
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
      <Svg label="HubSpot" size={size}>
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
      <Svg label="Discord" size={size}>
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
      <Svg label="Dropbox" size={size}>
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
      <Svg label="Jira" size={size}>
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
    <Tile size={size} className={cn(size !== "nav" && "bg-muted text-foreground/80", className)}>
      <span
        className={cn(
          "font-medium tracking-[-0.04em]",
          size === "nav" || size === "xs"
            ? "text-[10px]"
            : size === "sm"
              ? "text-[12px]"
              : "text-[13px]",
        )}
      >
        {letter}
      </span>
    </Tile>
  );
}

import { HandshakeIcon } from "@/components/panels/handshake/HandshakeIcon";

function HandshakeMark({ className, size }: { className?: string; size?: MarkSize }) {
  if (size === "nav") {
    return (
      <HandshakeIcon
        size="xs"
        className={cn("!h-3.5 !w-3.5 !rounded-none !shadow-none", className)}
      />
    );
  }
  const iconSize =
    size === "xs" ? "xs" : size === "sm" ? "sm" : size === "md" ? "md" : "lg";
  return <HandshakeIcon size={iconSize} className={className} />;
}

function BrandMark({
  label,
  tintClass,
  className,
  size,
  children,
}: {
  label: string;
  tintClass?: string;
  className?: string;
  size?: MarkSize;
  children: ReactNode;
}) {
  return (
    <Tile size={size} className={cn(tintClass, className)}>
      <Svg label={label} size={size}>
        {children}
      </Svg>
    </Tile>
  );
}

function GdriveMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <BrandMark label="Google Drive" tintClass="bg-[#4285F4]/10" className={className} size={size}>
      <path fill="#4285F4" d="M8.5 3.5h7L22 14.5h-7z" />
      <path fill="#34A853" d="M2 14.5 8.5 3.5 15 14.5z" />
      <path fill="#FBBC04" d="m8.5 20.5 6.5-11H22l-6.5 11z" />
      <path fill="#EA4335" d="M2 14.5h13L8.5 20.5z" />
    </BrandMark>
  );
}

function GdocsMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <BrandMark label="Google Docs" tintClass="bg-[#4285F4]/10" className={className} size={size}>
      <path fill="#4285F4" d="M6 2.5h8.5L19.5 8v13.5A1.5 1.5 0 0 1 18 23H6a1.5 1.5 0 0 1-1.5-1.5v-17A1.5 1.5 0 0 1 6 2.5Z" />
      <path fill="#fff" d="M14.5 2.5V8H19.5Z" opacity=".35" />
      <path fill="#fff" d="M8 11.5h8v1.4H8zm0 3h8v1.4H8zm0 3h5.5v1.4H8z" />
    </BrandMark>
  );
}

function OutlookMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <BrandMark label="Outlook" tintClass="bg-[#0078D4]/12" className={className} size={size}>
      <path fill="#0078D4" d="M3 5.5h10.5v13H3a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 3 5.5Z" />
      <path fill="#28A8EA" d="M13.5 5.5H21A1.5 1.5 0 0 1 22.5 7v11a1.5 1.5 0 0 1-1.5 1.5h-7.5Z" />
      <circle cx="8.2" cy="12" r="3.1" fill="#fff" />
      <path fill="#0078D4" d="M8.2 9.6a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8Z" />
    </BrandMark>
  );
}

function ZoomMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <BrandMark label="Zoom" tintClass="bg-[#2D8CFF]/12" className={className} size={size}>
      <path fill="#2D8CFF" d="M4 7.5h9.5A2.5 2.5 0 0 1 16 10v4a2.5 2.5 0 0 1-2.5 2.5H4A2.5 2.5 0 0 1 1.5 14v-4A2.5 2.5 0 0 1 4 7.5Z" />
      <path fill="#2D8CFF" d="m16.5 10 5-2.5v9l-5-2.5z" />
    </BrandMark>
  );
}

function AsanaMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <BrandMark label="Asana" tintClass="bg-[#F06A6A]/12" className={className} size={size}>
      <circle cx="12" cy="7.2" r="3.2" fill="#F06A6A" />
      <circle cx="7" cy="15.5" r="3.2" fill="#F06A6A" />
      <circle cx="17" cy="15.5" r="3.2" fill="#F06A6A" />
    </BrandMark>
  );
}

function TrelloMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <BrandMark label="Trello" tintClass="bg-[#0052CC]/12" className={className} size={size}>
      <rect x="3" y="3" width="18" height="18" rx="2.5" fill="#0052CC" />
      <rect x="6" y="6" width="5" height="11" rx="1" fill="#fff" />
      <rect x="13" y="6" width="5" height="7" rx="1" fill="#fff" />
    </BrandMark>
  );
}

function TodoistMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <BrandMark label="Todoist" tintClass="bg-[#E44332]/12" className={className} size={size}>
      <path fill="#E44332" d="M4 6.5h16v2.2H4zm0 4.4 7.2 5.4c.5.4 1.1.4 1.6 0L20 10.9v2.5l-6.8 5.1a2.2 2.2 0 0 1-2.4 0L4 13.4z" />
    </BrandMark>
  );
}

function MondayMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <BrandMark label="Monday.com" tintClass="bg-[#FF3D57]/10" className={className} size={size}>
      <circle cx="5.5" cy="16" r="2.8" fill="#FF3D57" />
      <circle cx="12" cy="8" r="2.8" fill="#FFCB00" />
      <circle cx="18.5" cy="16" r="2.8" fill="#00D647" />
    </BrandMark>
  );
}

function ClickupMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <BrandMark label="ClickUp" tintClass="bg-[#7B68EE]/12" className={className} size={size}>
      <path fill="#7B68EE" d="M4.2 9.2 12 15.8l7.8-6.6-2-2.4L12 11.5 6.2 6.8z" />
      <path fill="#FF48A8" d="m5.5 14.2 6.5 5.5 6.5-5.5-2.1-2.5-4.4 3.7-4.4-3.7z" />
    </BrandMark>
  );
}

function CalendlyMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <BrandMark label="Calendly" tintClass="bg-[#006BFF]/12" className={className} size={size}>
      <path fill="#006BFF" d="M7 3.5h10a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-11a3 3 0 0 1 3-3Zm0 4.5v9.5h10V8Z" />
      <circle cx="12" cy="13.5" r="2.2" fill="#006BFF" />
    </BrandMark>
  );
}

function BoxMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <BrandMark label="Box" tintClass="bg-[#0061D5]/12" className={className} size={size}>
      <path fill="#0061D5" d="M3.5 8.5 12 4l8.5 4.5v9L12 22l-8.5-4.5zm2.2 1.3v6.4L12 19.5l6.3-3.3V9.8L12 13.1z" />
    </BrandMark>
  );
}

function ConfluenceMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <BrandMark label="Confluence" tintClass="bg-[#1868DB]/12" className={className} size={size}>
      <path fill="#1868DB" d="M5.2 15.8c1.6 2.6 3.9 4 6.8 4 1.4 0 2.6-.3 3.7-.9l2.6 1.5c-2 1.4-4.3 2.1-6.8 2.1-4.4 0-8-2.6-9.8-6.5z" />
      <path fill="#2684FF" d="M18.8 8.2c-1.6-2.6-3.9-4-6.8-4-1.4 0-2.6.3-3.7.9L5.7 3.6C7.7 2.2 10 1.5 12.5 1.5c4.4 0 8 2.6 9.8 6.5z" />
    </BrandMark>
  );
}

function AirtableMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <BrandMark label="Airtable" tintClass="bg-[#18BFFF]/12" className={className} size={size}>
      <path fill="#18BFFF" d="M12 2.5 21.5 8 12 13.5 2.5 8Z" />
      <path fill="#F82B60" d="M12 13.5v8L21.5 16V8Z" />
      <path fill="#FFD337" d="M12 13.5v8L2.5 16V8Z" />
    </BrandMark>
  );
}

function ZapierMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <BrandMark label="Zapier" tintClass="bg-[#FF4A00]/12" className={className} size={size}>
      <path fill="#FF4A00" d="M10.8 2.5h2.4v4.2l3-3 1.7 1.7-3 3h4.2v2.4h-4.2l3 3-1.7 1.7-3-3v4.2h-2.4v-4.2l-3 3-1.7-1.7 3-3H2.9v-2.4h4.2l-3-3 1.7-1.7 3 3z" />
    </BrandMark>
  );
}

function VercelMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <BrandMark label="Vercel" className={className} size={size}>
      <path fill="currentColor" d="M12 3.5 22 20.5H2Z" />
    </BrandMark>
  );
}

function CloudflareMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <BrandMark label="Cloudflare" tintClass="bg-[#F6821F]/12" className={className} size={size}>
      <path fill="#F6821F" d="M8.2 15.8h12.3c.9 0 1.7-.7 1.7-1.7 0-.7-.4-1.3-1.1-1.6l-5.3-2.1c-.9-.4-1.4-1.3-1.2-2.2.2-.8.9-1.4 1.8-1.4h.7l.8-1.9H16c-2.3 0-4.3 1.6-4.8 3.8l-.2.9-1.5-.4c-1.7-.4-3.4.6-3.8 2.3-.1.4-.1.8 0 1.2.3 1.2 1.4 2.1 2.7 2.1Z" />
      <path fill="#FBAD41" d="M6.4 15.8H3.9c-1.2 0-2.2-1-2.2-2.2 0-1 .7-1.9 1.7-2.1l11.2-2.4.5 2.2-10.4 2.2c-.3.1-.5.3-.5.6 0 .4.3.7.7.7h1.5z" />
    </BrandMark>
  );
}

function SentryMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <BrandMark label="Sentry" tintClass="bg-[#362D59]/20" className={className} size={size}>
      <path fill="#362D59" d="M13.8 4.2 21.5 18a2.2 2.2 0 0 1-1.9 3.3H4.4A2.2 2.2 0 0 1 2.5 18L10.2 4.2a2.2 2.2 0 0 1 3.6 0ZM12 8.2 6.2 18.5h11.6Z" />
    </BrandMark>
  );
}

function DatadogMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <BrandMark label="Datadog" tintClass="bg-[#632CA6]/12" className={className} size={size}>
      <path fill="#632CA6" d="M12 2.5A9.5 9.5 0 1 1 2.5 12 9.5 9.5 0 0 1 12 2.5Zm0 3.2A6.3 6.3 0 1 0 18.3 12 6.3 6.3 0 0 0 12 5.7Zm-1.4 2.8h2.8v7.8h-2.8zm0-3.2h2.8v2h-2.8z" />
    </BrandMark>
  );
}

function GitlabMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <BrandMark label="GitLab" tintClass="bg-[#FC6D26]/12" className={className} size={size}>
      <path fill="#E24329" d="m12 21 4.2-12.9H7.8Z" />
      <path fill="#FC6D26" d="M12 21 7.8 8.1 5.2 16Z" />
      <path fill="#FCA326" d="M12 21 16.2 8.1 18.8 16Z" />
      <path fill="#E24329" d="M5.2 16 2.5 8.1h5.3zm13.6 0 2.7-7.9h-5.3z" />
    </BrandMark>
  );
}

function BitbucketMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <BrandMark label="Bitbucket" tintClass="bg-[#0052CC]/12" className={className} size={size}>
      <path fill="#0052CC" d="M3.2 5.2h17.6l-2.2 13.6a1.6 1.6 0 0 1-1.6 1.4H7a1.6 1.6 0 0 1-1.6-1.4Zm5.6 4.3.9 5.4h4.6l.9-5.4z" />
    </BrandMark>
  );
}

function WebflowMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <BrandMark label="Webflow" tintClass="bg-[#4353FF]/12" className={className} size={size}>
      <path fill="#4353FF" d="M2.5 6.5h5.2l1.8 7.4L12 6.5h4.2l-3.5 11H8.2L6.4 10 4.7 17.5H2.5Z" />
      <path fill="#4353FF" d="M16.5 6.5H21v2.2h-2.3l-1.5 9H14.8Z" />
    </BrandMark>
  );
}

function SupabaseMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <BrandMark label="Supabase" tintClass="bg-[#3ECF8E]/12" className={className} size={size}>
      <path fill="#3ECF8E" d="M13.5 2.5v11.2h7.2Z" />
      <path fill="#3ECF8E" d="M10.5 21.5V10.3H3.3Z" opacity=".7" />
    </BrandMark>
  );
}

function FirebaseMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <BrandMark label="Firebase" tintClass="bg-[#FFA000]/12" className={className} size={size}>
      <path fill="#FFA000" d="m12 2.8 3.2 5.8-7.8 13.1L4.2 8.4Z" />
      <path fill="#F57C00" d="m12 2.8 7.8 13.9H7.4Z" />
      <path fill="#FFCA28" d="m7.4 16.7 4.6 4.9 7.8-13.9z" />
    </BrandMark>
  );
}

function NeonMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <BrandMark label="Neon" tintClass="bg-[#00E599]/12" className={className} size={size}>
      <path fill="#00E599" d="M5 3.5h6.5L19 12v8.5h-6.5L5 12Z" />
    </BrandMark>
  );
}

function MixpanelMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <BrandMark label="Mixpanel" tintClass="bg-[#7856FF]/12" className={className} size={size}>
      <circle cx="7" cy="12" r="3.2" fill="#7856FF" />
      <circle cx="14.5" cy="7.5" r="2.4" fill="#7856FF" />
      <circle cx="16.5" cy="15.5" r="2.8" fill="#7856FF" />
    </BrandMark>
  );
}

function AmplitudeMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <BrandMark label="Amplitude" tintClass="bg-[#1E61F0]/12" className={className} size={size}>
      <path fill="#1E61F0" d="M4 18.5 12 4.5l8 14H4Zm4.2-2.4h7.6L12 9.2Z" />
    </BrandMark>
  );
}

function SegmentMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <BrandMark label="Segment" tintClass="bg-[#52BD95]/12" className={className} size={size}>
      <circle cx="12" cy="12" r="3" fill="#52BD95" />
      <circle cx="5" cy="7" r="2" fill="#52BD95" />
      <circle cx="19" cy="7" r="2" fill="#52BD95" />
      <circle cx="5" cy="17" r="2" fill="#52BD95" />
      <circle cx="19" cy="17" r="2" fill="#52BD95" />
    </BrandMark>
  );
}

function SnowflakeMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <BrandMark label="Snowflake" tintClass="bg-[#29B5E8]/12" className={className} size={size}>
      <path fill="#29B5E8" d="M12 2.5v19M4.5 7.5l15 9M4.5 16.5l15-9M12 6.2l3.2-1.8M12 6.2 8.8 4.4M12 17.8l3.2 1.8M12 17.8l-3.2 1.8M7.2 9.2 5 7.8M7.2 14.8 5 16.2M16.8 9.2 19 7.8M16.8 14.8 19 16.2" stroke="#29B5E8" strokeWidth="1.6" strokeLinecap="round" />
    </BrandMark>
  );
}

function BigqueryMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <BrandMark label="BigQuery" tintClass="bg-[#669DF6]/12" className={className} size={size}>
      <path fill="#669DF6" d="M12 2.5A9.5 9.5 0 1 1 2.5 12 9.5 9.5 0 0 1 12 2.5Zm0 3A6.5 6.5 0 1 0 18.5 12 6.5 6.5 0 0 0 12 5.5Zm-1.2 2.8h2.4v4.4l3.2 1.9-1.2 2-4.4-2.6z" />
    </BrandMark>
  );
}

function TeamsMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <BrandMark label="Microsoft Teams" tintClass="bg-[#6264A7]/12" className={className} size={size}>
      <path fill="#5059C9" d="M10.5 7.5h8A2.5 2.5 0 0 1 21 10v7.5a2.5 2.5 0 0 1-2.5 2.5h-8Z" />
      <path fill="#7B83EB" d="M3.5 5.5h9v13h-9A1.5 1.5 0 0 1 2 17V7a1.5 1.5 0 0 1 1.5-1.5Z" />
      <circle cx="16.5" cy="5.5" r="2.2" fill="#5059C9" />
    </BrandMark>
  );
}

function IntercomMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <BrandMark label="Intercom" tintClass="bg-[#1F8DED]/12" className={className} size={size}>
      <path fill="#1F8DED" d="M4.5 5.5h15A1.5 1.5 0 0 1 21 7v8.5a1.5 1.5 0 0 1-1.5 1.5H14l-2 2.5-2-2.5H4.5A1.5 1.5 0 0 1 3 15.5V7a1.5 1.5 0 0 1 1.5-1.5Z" />
      <path fill="#fff" d="M7 9.2h1.6v4.2H7zm3 0h1.6v4.2H10zm3 0h1.6v4.2H13zm3 0h1.6v4.2H16z" />
    </BrandMark>
  );
}

function TwilioMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <BrandMark label="Twilio" tintClass="bg-[#F22F46]/12" className={className} size={size}>
      <circle cx="12" cy="12" r="9" fill="#F22F46" />
      <circle cx="8.8" cy="9.2" r="1.6" fill="#fff" />
      <circle cx="15.2" cy="9.2" r="1.6" fill="#fff" />
      <circle cx="8.8" cy="14.8" r="1.6" fill="#fff" />
      <circle cx="15.2" cy="14.8" r="1.6" fill="#fff" />
    </BrandMark>
  );
}

function FrontMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <BrandMark label="Front" tintClass="bg-[#2B2E34]/20" className={className} size={size}>
      <path fill="#2B2E34" d="M5 4.5h9.5a5.5 5.5 0 0 1 0 11H9.5V19.5H5Zm4.5 3.5v4h5a2 2 0 1 0 0-4z" />
    </BrandMark>
  );
}

function ResendMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <BrandMark label="Resend" className={className} size={size}>
      <path fill="currentColor" d="M4.5 5.5h15v3.2l-7.5 5.6-7.5-5.6zm0 5.2 7.5 5.6 7.5-5.6V18.5h-15z" />
    </BrandMark>
  );
}

function SalesforceMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <BrandMark label="Salesforce" tintClass="bg-[#00A1E0]/12" className={className} size={size}>
      <path
        fill="#00A1E0"
        d="M8.5 9.2a3.4 3.4 0 0 1 3.1-2 3.3 3.3 0 0 1 3 1.8 3 3 0 0 1 2.6 2.9 3 3 0 0 1-3 3H7.8A3.2 3.2 0 0 1 4.6 12a3.2 3.2 0 0 1 3-3.1c.3 0 .6 0 .9.3Z"
      />
    </BrandMark>
  );
}

function ShopifyMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <BrandMark label="Shopify" tintClass="bg-[#95BF47]/12" className={className} size={size}>
      <path fill="#95BF47" d="M6.8 7.4 17.5 5l1.2 14.2-8.4 2.3L5.2 19.8Zm3.4 1.1.6 7.4 2.2.5.6-8.2z" />
      <path fill="#5E8E3E" d="m10.2 8.5.6 7.4 2.2.5V6.8Z" />
    </BrandMark>
  );
}

function CustomerioMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <BrandMark label="Customer.io" tintClass="bg-[#FFC107]/15" className={className} size={size}>
      <circle cx="12" cy="12" r="8.5" fill="#FFC107" />
      <circle cx="12" cy="12" r="3.2" fill="#1A1A1A" />
    </BrandMark>
  );
}

function ClerkMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <BrandMark label="Clerk" tintClass="bg-[#6C47FF]/12" className={className} size={size}>
      <path fill="#6C47FF" d="M12 2.5A9.5 9.5 0 1 1 2.5 12 9.5 9.5 0 0 1 12 2.5Zm0 4.2A5.3 5.3 0 1 0 17.3 12 5.3 5.3 0 0 0 12 6.7Z" />
      <circle cx="12" cy="12" r="2.2" fill="#6C47FF" />
    </BrandMark>
  );
}

function OpenaiMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <BrandMark label="OpenAI" className={className} size={size}>
      <path fill="currentColor" d="M22 11.4a5.2 5.2 0 0 0-2.8-7.1 5.3 5.3 0 0 0-5.7-2.5A5.3 5.3 0 0 0 4.6 4a5.2 5.2 0 0 0-3.5 4.8 5.2 5.2 0 0 0 2 6.8 5.2 5.2 0 0 0 2.8 7.1 5.3 5.3 0 0 0 5.7 2.5A5.3 5.3 0 0 0 19.4 20a5.2 5.2 0 0 0 3.5-4.8 5.2 5.2 0 0 0-.9-3.8ZM12.4 21a3.9 3.9 0 0 1-2.5-.9l.1-.1 4.2-2.4a.2.2 0 0 0 .1-.2v-5.8l1.8 1v4.8A3.9 3.9 0 0 1 12.4 21Zm-8-3.4a3.9 3.9 0 0 1-1.5-3.3l.1.1 4.2 2.4a.2.2 0 0 0 .2 0l5.1-3v2.1l-4.3 2.5a3.9 3.9 0 0 1-3.8-.8Zm-1-9.1a3.9 3.9 0 0 1 2-1.7v5l-1.8 1V8.9a.2.2 0 0 0-.1-.2L4 7.6Zm14.4 3.3-5.1 3V9.2l1.8-1v4.8a.2.2 0 0 0 .1.2l4.2 2.4v.1a3.9 3.9 0 0 1-1 2Zm1.6-3.4-.1-.1-4.2-2.4a.2.2 0 0 0-.2 0l-5.1 3V7.4l4.3-2.5a3.9 3.9 0 0 1 5.3 2.5ZM8.4 14.4l-1.8-1V8.6a.2.2 0 0 0-.1-.2L3.3 7.4v-.1A3.9 3.9 0 0 1 9.1 4l-.1.1 4.2 2.4a.2.2 0 0 0 .2 0l5.1-3V5.5L14.2 8a3.9 3.9 0 0 1-.2 6.4Z" />
    </BrandMark>
  );
}

function AnthropicMark({ className, size }: { className?: string; size?: MarkSize }) {
  return (
    <BrandMark label="Anthropic" className={className} size={size}>
      <path fill="currentColor" d="M16.2 4.5h3.3L12.9 19.5h-3.3L16.2 4.5ZM4.5 4.5h3.3l6.6 15H11Z" />
    </BrandMark>
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
  handshake: HandshakeMark,
  gdrive: GdriveMark,
  gdocs: GdocsMark,
  outlook: OutlookMark,
  zoom: ZoomMark,
  asana: AsanaMark,
  trello: TrelloMark,
  todoist: TodoistMark,
  monday: MondayMark,
  clickup: ClickupMark,
  calendly: CalendlyMark,
  box: BoxMark,
  confluence: ConfluenceMark,
  airtable: AirtableMark,
  zapier: ZapierMark,
  vercel: VercelMark,
  cloudflare: CloudflareMark,
  sentry: SentryMark,
  datadog: DatadogMark,
  gitlab: GitlabMark,
  bitbucket: BitbucketMark,
  webflow: WebflowMark,
  supabase: SupabaseMark,
  firebase: FirebaseMark,
  neon: NeonMark,
  mixpanel: MixpanelMark,
  amplitude: AmplitudeMark,
  segment: SegmentMark,
  snowflake: SnowflakeMark,
  bigquery: BigqueryMark,
  teams: TeamsMark,
  intercom: IntercomMark,
  twilio: TwilioMark,
  front: FrontMark,
  resend: ResendMark,
  salesforce: SalesforceMark,
  shopify: ShopifyMark,
  customerio: CustomerioMark,
  clerk: ClerkMark,
  openai: OpenaiMark,
  anthropic: AnthropicMark,
};

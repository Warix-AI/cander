"use client";

import { useSyncExternalStore } from "react";
import {
  getProfilePhotosServerSnapshot,
  getProfilePhotosSnapshot,
  profilePhotoFor,
  subscribeProfilePhotos,
} from "@/lib/profile-photos";
import { cn } from "@/lib/utils";

export function AccountAvatar({
  memberId,
  name,
  initials,
  size = "md",
  className,
}: {
  memberId: string;
  name: string;
  initials: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const photos = useSyncExternalStore(
    subscribeProfilePhotos,
    getProfilePhotosSnapshot,
    getProfilePhotosServerSnapshot,
  );
  const photo = profilePhotoFor(memberId, photos);
  const dim =
    size === "lg" ? "h-14 w-14 text-[15px]" : size === "sm" ? "h-7 w-7 text-[10px]" : "h-8 w-8 text-[11px]";

  if (photo) {
    return (
      <span
        className={cn(
          "relative inline-flex shrink-0 overflow-hidden rounded-[10px]",
          dim,
          className,
        )}
      >
        <img src={photo} alt="" className="h-full w-full object-cover" />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-[10px] bg-muted font-semibold",
        dim,
        className,
      )}
      title={name}
    >
      {initials}
    </span>
  );
}

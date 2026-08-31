/**
 * NativeMedia — camera / photo library. Wraps existing composer-attach behavior.
 */

import {
  pickWithCapacitorCamera,
  type CapImagePickResult as LegacyPickResult,
} from "../composer-attach.ts";
import type { CapImagePickResult } from "./types.ts";

export type NativeMedia = {
  pickCameraPhoto(): Promise<CapImagePickResult>;
  pickLibraryImages(): Promise<CapImagePickResult>;
};

function mapResult(r: LegacyPickResult): CapImagePickResult {
  return r;
}

export function createNativeMedia(): NativeMedia {
  return {
    async pickCameraPhoto() {
      return mapResult(await pickWithCapacitorCamera("camera"));
    },
    async pickLibraryImages() {
      return mapResult(await pickWithCapacitorCamera("photos"));
    },
  };
}

/**
 * NativeKeyboard — wraps mobile-shell (behavior-identical).
 */

import {
  dismissNativeKeyboard,
  syncNativeKeyboardStyle,
} from "../mobile-shell.ts";

export type NativeKeyboard = {
  dismiss(): void;
  syncStyle(): void;
};

export function createNativeKeyboard(): NativeKeyboard {
  return {
    dismiss() {
      dismissNativeKeyboard();
    },
    syncStyle() {
      syncNativeKeyboardStyle();
    },
  };
}

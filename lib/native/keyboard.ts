/**
 * NativeKeyboard — wraps mobile-shell (behavior-identical).
 */

import {
  dismissNativeKeyboard,
  showNativeKeyboard,
  syncNativeKeyboardStyle,
} from "../mobile-shell.ts";

export type NativeKeyboard = {
  dismiss(): void;
  show(): void;
  syncStyle(): void;
};

export function createNativeKeyboard(): NativeKeyboard {
  return {
    dismiss() {
      dismissNativeKeyboard();
    },
    show() {
      showNativeKeyboard();
    },
    syncStyle() {
      syncNativeKeyboardStyle();
    },
  };
}

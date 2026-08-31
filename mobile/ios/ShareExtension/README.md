# Share Extension (iOS)

Pending composer input only — **never auto-send**.

1. In Xcode: File → New → Target → Share Extension.
2. Replace the generated `ShareViewController` with `ShareViewController.swift` in this folder.
3. App Group / URL scheme: main app already registers `cander://`.
4. Activation: text and URLs; images can be added later via `image` query (data URL size limits apply).

Android: `ACTION_SEND` intent filters are on `MainActivity`; the web layer listens for `cander://share` via `ShareInListener`.

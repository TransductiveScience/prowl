/// <reference types="vite/client" />
import type {} from "../electron/preload"

/* Prowl — Electron desktop app type augmentations */

/** Environment variables exposed by Vite at build time */
interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

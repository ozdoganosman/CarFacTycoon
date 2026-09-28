// Build-time settings Vite fills in (import.meta.env.VITE_*).
interface ImportMetaEnv {
  /** The playtest collector for the public build (see src/ui/collector.ts). */
  readonly VITE_PLAYTEST_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

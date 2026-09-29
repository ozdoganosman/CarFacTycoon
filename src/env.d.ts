// Build-time settings Vite fills in (import.meta.env.VITE_*).
interface ImportMetaEnv {
  /** The Supabase project the public build sends playtests to (see src/ui/collector.ts). */
  readonly VITE_SUPABASE_URL?: string;
  /** Its publishable key. */
  readonly VITE_SUPABASE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** App-only styles and fonts in the Android build; empty elsewhere (see vite.config.ts). */
declare module 'virtual:app-extras';

import { createContext } from "react";

export type Theme = "dark" | "light" | "system";

export interface RelayMetadata {
  /** List of relays with read/write permissions */
  relays: { url: string; read: boolean; write: boolean }[];
  /** Unix timestamp of when the relay list was last updated */
  updatedAt: number;
}

export interface AppConfig {
  /** Current theme */
  theme: Theme;
  /** NIP-65 relay list metadata */
  relayMetadata: RelayMetadata;
  /**
   * Base URL of the scheduling backend that stores pre-signed events and
   * publishes them at the scheduled time.
   *
   * - Leave empty ('') to use the default same-origin Netlify function
   *   at `/.netlify/functions/scheduler` (the built-in behavior).
   * - Set to a full URL (e.g. `https://scheduler.example.com` or
   *   `https://my-vps.com/scheduler`) to point at a self-hosted backend.
   *
   * The backend must implement the scheduler API:
   *   POST   /              → schedule a pre-signed event
   *   GET    /?id=<id>       → check status
   *   DELETE /?id=<id>       → cancel
   *   GET    /               → health check
   */
  schedulerBackendUrl: string;
}

export interface AppContextType {
  /** Current application configuration */
  config: AppConfig;
  /** Update configuration using a callback that receives current config and returns new config */
  updateConfig: (updater: (currentConfig: Partial<AppConfig>) => Partial<AppConfig>) => void;
}

export const AppContext = createContext<AppContextType | undefined>(undefined);

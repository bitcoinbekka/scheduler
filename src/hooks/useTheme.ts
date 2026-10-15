import { type Theme, type AccentColor, type EditorFont, type Look } from "@/contexts/AppContext";
import { useAppContext } from "@/hooks/useAppContext";
import { resolveLook } from "@/lib/looks";

/**
 * Hook to get and set appearance: light/dark, named website look, and article font.
 */
export function useTheme(): {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  look: Look;
  setLook: (look: Look) => void;
  accentColor: AccentColor;
  setAccentColor: (accentColor: AccentColor) => void;
  editorFont: EditorFont;
  setEditorFont: (editorFont: EditorFont) => void;
} {
  const { config, updateConfig } = useAppContext();

  return {
    theme: config.theme,
    setTheme: (theme: Theme) => {
      updateConfig((currentConfig) => ({
        ...currentConfig,
        theme,
      }));
    },
    look: resolveLook(config.look, config.accentColor),
    setLook: (look: Look) => {
      updateConfig((currentConfig) => ({
        ...currentConfig,
        look,
      }));
    },
    accentColor: config.accentColor ?? 'rose',
    setAccentColor: (accentColor: AccentColor) => {
      updateConfig((currentConfig) => ({
        ...currentConfig,
        accentColor,
      }));
    },
    editorFont: config.editorFont ?? 'sans',
    setEditorFont: (editorFont: EditorFont) => {
      updateConfig((currentConfig) => ({
        ...currentConfig,
        editorFont,
      }));
    },
  };
}
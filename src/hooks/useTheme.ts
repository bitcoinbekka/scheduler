import { type Theme, type AccentColor, type EditorFont } from "@/contexts/AppContext";
import { useAppContext } from "@/hooks/useAppContext";

/**
 * Hook to get and set appearance: theme, accent colour, and editor font.
 */
export function useTheme(): {
  theme: Theme;
  setTheme: (theme: Theme) => void;
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
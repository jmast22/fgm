import { useTheme } from "../../context/ThemeContext";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="p-2.5 rounded-xl glass hover:border-primary-500/40 hover:bg-surface-800 transition-all flex items-center justify-center group"
      aria-label="Toggle Theme"
    >
      <span className="text-xl group-hover:scale-125 transition-transform duration-300">
        {theme === 'dark' ? '☀️' : '🌙'}
      </span>
    </button>
  );
}

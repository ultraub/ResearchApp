/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Primary colors - uses CSS variable for dynamic theming
        // The CSS variable --color-primary contains RGB values (e.g., "139 92 246")
        primary: {
          50: "rgb(var(--color-primary-50, 245 243 255) / <alpha-value>)",
          100: "rgb(var(--color-primary-100, 237 233 254) / <alpha-value>)",
          200: "rgb(var(--color-primary-200, 221 214 254) / <alpha-value>)",
          300: "rgb(var(--color-primary-300, 196 181 253) / <alpha-value>)",
          400: "rgb(var(--color-primary-400, 167 139 250) / <alpha-value>)",
          500: "rgb(var(--color-primary, 139 92 246) / <alpha-value>)",
          600: "rgb(var(--color-primary-600, 124 58 237) / <alpha-value>)",
          700: "rgb(var(--color-primary-700, 109 40 217) / <alpha-value>)",
          800: "rgb(var(--color-primary-800, 91 33 182) / <alpha-value>)",
          900: "rgb(var(--color-primary-900, 76 29 149) / <alpha-value>)",
          950: "rgb(var(--color-primary-950, 59 20 133) / <alpha-value>)",
        },
        // Accent colors - uses CSS variable for dynamic theming
        accent: {
          50: "rgb(var(--color-accent-50, 255 247 237) / <alpha-value>)",
          100: "rgb(var(--color-accent-100, 255 237 213) / <alpha-value>)",
          200: "rgb(var(--color-accent-200, 254 215 170) / <alpha-value>)",
          300: "rgb(var(--color-accent-300, 253 186 116) / <alpha-value>)",
          400: "rgb(var(--color-accent-400, 251 146 60) / <alpha-value>)",
          500: "rgb(var(--color-accent, 249 115 22) / <alpha-value>)",
          600: "rgb(var(--color-accent-600, 234 88 12) / <alpha-value>)",
          700: "rgb(var(--color-accent-700, 194 65 12) / <alpha-value>)",
          800: "rgb(var(--color-accent-800, 154 52 18) / <alpha-value>)",
          900: "rgb(var(--color-accent-900, 124 45 18) / <alpha-value>)",
        },
        // Warm neutral grays (slightly warmed up)
        gray: {
          50: "#faf9f7",   // Warm off-white (was #f9fafb)
          100: "#f5f4f2",  // Warm gray (was #f3f4f6)
          200: "#e7e5e4",  // Stone-tinted (was #e5e7eb)
          300: "#d6d3d1",
          400: "#a8a29e",
          500: "#78716c",
          600: "#57534e",
          700: "#44403c",
          800: "#292524",
          900: "#1c1917",
          950: "#0c0a09",
        },
        // Warm backgrounds
        warm: {
          50: "#faf9f7",
          100: "#f5f4f2",
          200: "#e7e5e4",
        },
        // Dark mode - navy-purple tones (not pure gray)
        dark: {
          base: "#1a1a2e",
          card: "#252547",
          elevated: "#2d2d5a",
          border: "#3d3d6b",
        },
        // Semantic colors (warmer green)
        success: {
          50: "#ecfdf5",
          100: "#d1fae5",
          500: "#10b981",  // Emerald (warmer)
          600: "#059669",
        },
        warning: {
          50: "#fffbeb",
          100: "#fef3c7",
          500: "#f59e0b",
          600: "#d97706",
        },
        error: {
          50: "#fef2f2",
          100: "#fee2e2",
          500: "#ef4444",
          600: "#dc2626",
        },
        // Info - harmonizes with primary
        info: {
          50: "#eef2ff",
          100: "#e0e7ff",
          500: "#6366f1",
          600: "#4f46e5",
        },
      },
      fontFamily: {
        sans: [
          "Inter var",
          "Inter",
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      fontSize: {
        xs: ["0.75rem", { lineHeight: "1rem" }],
        sm: ["0.875rem", { lineHeight: "1.25rem" }],
        base: ["1rem", { lineHeight: "1.5rem" }],
        lg: ["1.125rem", { lineHeight: "1.75rem" }],
        xl: ["1.25rem", { lineHeight: "1.75rem" }],
        "2xl": ["1.5rem", { lineHeight: "2rem" }],
        "3xl": ["1.875rem", { lineHeight: "2.25rem" }],
      },
      spacing: {
        18: "4.5rem",
        88: "22rem",
        112: "28rem",
        128: "32rem",
      },
      borderRadius: {
        "4xl": "2rem",
      },
      boxShadow: {
        // Soft shadow (warmed with subtle primary tint)
        soft: "0 2px 15px -3px rgba(139, 92, 246, 0.05), 0 10px 20px -2px rgba(0, 0, 0, 0.04)",
        // Card shadows with primary color tinting
        "card": "0 1px 3px rgb(var(--color-primary, 139 92 246) / 0.04), 0 4px 12px rgba(0, 0, 0, 0.03)",
        "card-hover": "0 4px 12px rgb(var(--color-primary, 139 92 246) / 0.08), 0 8px 24px rgba(0, 0, 0, 0.04)",
        // Elevated elements
        "elevated": "0 10px 40px -10px rgb(var(--color-primary, 139 92 246) / 0.15), 0 20px 25px -5px rgba(0, 0, 0, 0.05)",
        // Accent glow for interactive elements
        "glow": "0 0 20px 2px rgb(var(--color-primary, 139 92 246) / 0.25)",
        "glow-accent": "0 0 20px 2px rgb(var(--color-accent, 249 115 22) / 0.25)",
      },
      animation: {
        "fade-in": "fadeIn 0.2s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
        "slide-down": "slideDown 0.3s ease-out",
        // New delightful animations
        "scale-in": "scaleIn 0.2s ease-out",
        "glow-pulse": "glowPulse 2s ease-in-out infinite",
        "success-pop": "successPop 0.3s ease-out",
        "hover-lift": "hoverLift 0.2s ease-out forwards",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        slideDown: {
          "0%": { transform: "translateY(-10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        scaleIn: {
          "0%": { transform: "scale(0.95)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        glowPulse: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgb(var(--color-primary, 139 92 246) / 0)" },
          "50%": { boxShadow: "0 0 20px 2px rgb(var(--color-primary, 139 92 246) / 0.3)" },
        },
        successPop: {
          "0%": { transform: "scale(0)" },
          "50%": { transform: "scale(1.2)" },
          "100%": { transform: "scale(1)" },
        },
        hoverLift: {
          "0%": { transform: "translateY(0)" },
          "100%": { transform: "translateY(-2px)" },
        },
      },
      // Transition timing functions for delightful motion
      transitionTimingFunction: {
        "bounce-in": "cubic-bezier(0.68, -0.55, 0.265, 1.55)",
        "smooth-out": "cubic-bezier(0.25, 0.1, 0.25, 1)",
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};

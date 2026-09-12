/** Config Tailwind reprise de l'ancienne configuration inline (CDN). */
module.exports = Object.assign({
    darkMode: "class",
    theme: {
        extend: {
            colors: {
                "primary": "#FCA311",
                "primary-container": "#FCA311",
                "primary-fixed": "#FFD700",
                "primary-fixed-dim": "#D98200",
                "on-primary": "#000000",
                "on-primary-container": "#000000",
                "on-primary-fixed": "#000000",
                "on-primary-fixed-variant": "#000000",
                "secondary": "#4f5e7e",
                "secondary-container": "#c8d7fd",
                "secondary-fixed": "#d8e2ff",
                "secondary-fixed-dim": "#b7c6eb",
                "on-secondary": "#ffffff",
                "on-secondary-container": "#4e5d7d",
                "on-secondary-fixed": "#0a1b38",
                "on-secondary-fixed-variant": "#384765",
                "tertiary": "#00639b",
                "tertiary-container": "#06a6ff",
                "tertiary-fixed": "#cee5ff",
                "tertiary-fixed-dim": "#96ccff",
                "on-tertiary": "#ffffff",
                "on-tertiary-container": "#00395c",
                "on-tertiary-fixed": "#001d33",
                "on-tertiary-fixed-variant": "#004a76",
                "surface": "#000000",
                "surface-dim": "#1a1a24",
                "surface-bright": "#22222e",
                "surface-variant": "#2a2a38",
                "on-surface": "#f8fafc",
                "on-surface-variant": "#94a3b8",
                "on-background": "#f8fafc",
                "background": "#000000",
                "outline": "#475569",
                "outline-variant": "#1e293b",
                "inverse-surface": "#f8fafc",
                "inverse-primary": "#ff7800",
                "inverse-on-surface": "#000000",
                "error": "#ef4444",
                "error-container": "#450a0a",
                "on-error": "#ffffff",
                "on-error-container": "#f87171",
            },
            fontFamily: {
                "headline": ["Plus Jakarta Sans", "sans-serif"],
                "body": ["Inter", "sans-serif"],
                "label": ["Inter", "sans-serif"]
            },
            borderRadius: {
                "DEFAULT": "0.25rem",
                "lg": "0.5rem",
                "xl": "0.75rem",
                "2xl": "1rem",
                "3xl": "1.5rem",
                "full": "9999px"
            },
            keyframes: {
                "fade-up": {
                    "0%": { opacity: "0", transform: "translateY(16px)" },
                    "100%": { opacity: "1", transform: "translateY(0)" }
                },
                "pop-in": {
                    "0%": { opacity: "0", transform: "scale(0.9)" },
                    "100%": { opacity: "1", transform: "scale(1)" }
                },
                "check-pop": {
                    "0%": { transform: "scale(0)" },
                    "60%": { transform: "scale(1.2)" },
                    "100%": { transform: "scale(1)" }
                },
                "shimmer": {
                    "0%": { transform: "translateX(-100%)" },
                    "100%": { transform: "translateX(200%)" }
                }
            },
            animation: {
                "fade-up": "fade-up 0.4s ease-out",
                "pop-in": "pop-in 0.3s ease-out",
                "check-pop": "check-pop 0.5s cubic-bezier(0.175,0.885,0.32,1.275)",
                "shimmer": "shimmer 2s linear infinite"
            }
        },
    },
}, {
  content: ["./index.html", "./formations/**/*.html", "./entreprises/**/*.html", "./mentions-legales/**/*.html", "./*.js"],
  plugins: [require("@tailwindcss/forms"), require("@tailwindcss/container-queries")]
});

import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { KeyboardShortcuts } from "@/components/layout/keyboard-shortcuts";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Job Search Copilot",
  description: "Track your job search and generate tailored application kits.",
};

/**
 * Inline script that runs before paint to pick up the user's stored theme
 * preference, avoiding a flash from dark default → light. Reads the same
 * localStorage key the ThemeProvider writes to.
 */
const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem('jsc-theme');
    var theme = stored === 'light' || stored === 'dark' ? stored : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  } catch (_) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full bg-canvas text-ink flex flex-col">
        <ThemeProvider>
          <KeyboardShortcuts />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}

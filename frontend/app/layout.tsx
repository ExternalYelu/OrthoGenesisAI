import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Space_Grotesk, IBM_Plex_Sans, JetBrains_Mono } from "next/font/google";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700"]
});

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["300", "400", "500", "600"]
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500"]
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F7FAFD"
};

export const metadata: Metadata = {
  title: {
    default: "OrthoGenesisAI",
    template: "%s | OrthoGenesisAI"
  },
  description:
    "AI-powered 3D bone reconstruction from multi-view X-rays. Surgical planning, patient education, and 3D-print-ready models.",
  keywords: ["orthopedic", "3D reconstruction", "X-ray", "bone model", "surgical planning", "HIPAA"],
  authors: [{ name: "OrthoGenesisAI" }]
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <body
        className={`${spaceGrotesk.variable} ${ibmPlexSans.variable} ${jetBrainsMono.variable} antialiased`}
      >
        <a
          href="#page-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-ink focus:shadow-lg"
        >
          Skip to content
        </a>
        <div id="page-content">{children}</div>
      </body>
    </html>
  );
}

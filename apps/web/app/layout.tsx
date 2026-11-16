import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PROJECT_RELAY — operator board",
  description: "Live task-routing board: create, route, intervene, recover.",
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#board" className="skip-link">
          Skip to board
        </a>
        {children}
      </body>
    </html>
  );
}

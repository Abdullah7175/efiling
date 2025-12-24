import localFont from "next/font/local";
import { Providers } from "./providers";
import "./globals.css";

// Fix MaxListenersExceededWarning
if (typeof process !== 'undefined') {
  process.setMaxListeners(0);
}

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

// Use system font fallback to avoid Google Fonts network issues during build
// Poppins will be loaded via CSS if available, otherwise falls back to system fonts
const poppins = {
  variable: '--font-poppins'
};

export const metadata = {
  title: "WMP",
  description: "Karachi Water & Sewerage Corporation",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${poppins.variable} ${geistMono.variable} antialiased`}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
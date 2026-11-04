import { Bricolage_Grotesque, Source_Sans_3 } from "next/font/google";
import "./globals.css";

// Headings: a grotesk with some grit (optical sizes and a narrow width). Body: a plain face that reads easily on a phone.
const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display", axes: ["opsz", "wdth"] });
const sans = Source_Sans_3({ subsets: ["latin"], variable: "--font-sans", style: ["normal", "italic"] });

const site = process.env.DR_PUBLIC_URL || "https://domi-reels.vercel.app";

export const metadata = {
  metadataBase: new URL(site),
  title: { default: "Domi Reels: your food photos, directed into Reels", template: "%s · Domi Reels" },
  description: "A restaurant sends its food photos. Meta's Muse directs a Reel that keeps the real food, and sends it on WhatsApp, ready to post. By invitation only.",
  openGraph: {
    title: "Domi Reels",
    description: "Your food photos, directed into Reels by Meta's Muse. The real food, ready to post.",
    type: "website",
  },
};

export const viewport = {
  themeColor: "#120d0a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body>{children}</body>
    </html>
  );
}

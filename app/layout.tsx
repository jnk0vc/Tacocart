import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Uchi Taco — TacoCart Concierge",
  description: "A recipe page with an embeddable concierge that scales the dish and checks out on PayPal Sandbox.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          data-tcc-fonts="1"
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,520;0,9..144,650;1,9..144,520&family=Outfit:wght@360;480;580&family=Shippori+Mincho:wght@500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

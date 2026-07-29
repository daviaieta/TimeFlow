import type { Metadata } from "next";
import { Geist, Geist_Mono, Figtree } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/components/theme-provider";
import {
  DARK_MEDIA_QUERY,
  THEMED_ROUTE_SEGMENTS_JSON,
  THEME_STORAGE_KEY,
} from "@/lib/theme";

const figtree = Figtree({subsets:['latin'],variable:'--font-sans'});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Roda durante o parse do HTML, antes da primeira pintura: sem isto a página
// aparece clara e só escurece quando o React hidrata (flash branco na cara de
// quem usa dark). Precisa ser inline e síncrono — nem useEffect nem
// useLayoutEffect rodam a tempo. Lê a mesma chave do ThemeProvider.
const themeScript = `(function(){try{var themed=${THEMED_ROUTE_SEGMENTS_JSON}.indexOf(location.pathname.split("/")[1]||"")!==-1;var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});var d=themed&&(t==="dark"||(t!=="light"&&window.matchMedia(${JSON.stringify(DARK_MEDIA_QUERY)}).matches));document.documentElement.classList.toggle("dark",d);document.documentElement.style.colorScheme=d?"dark":"light"}catch(e){}})()`;

export const metadata: Metadata = {
  title: "Time Flow — Agendamentos online para o seu negócio",
  description:
    "Página pública de agendamento para barbearias, salões e consultórios. O cliente escolhe serviço, profissional e horário — sem conflitos.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: o script acima mexe em class/style do <html>
    // antes da hidratação, e sem isso o React trataria como erro e repintaria.
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={cn("h-full", "scroll-smooth", "antialiased", geistSans.variable, geistMono.variable, "font-sans", figtree.variable)}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}

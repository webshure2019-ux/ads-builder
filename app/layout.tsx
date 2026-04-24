import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'

export const metadata: Metadata = {
  title: 'Webshure Ads Builder',
  description: 'Google Ads campaign builder',
}

// Inline theme-init script (static string, no user input — safe from XSS)
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}}catch(e){}})();`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script id="theme-init" strategy="beforeInteractive">{THEME_SCRIPT}</Script>
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  )
}

import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '炸金花 Online',
  description: '简约精美 · 音效 · 多人联网',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}

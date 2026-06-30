import type { Metadata } from "next";
import Link from "next/link";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Keiba Data",
    template: "%s | Keiba Data",
  },
  description:
    "合法的に取得した競馬データを確認するためのWebアプリです。的中や利益を保証するものではありません。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>
        <header className="site-header">
          <div className="site-header__inner">
            <Link className="brand" href="/">
              Keiba Data
            </Link>
            <nav aria-label="メインナビゲーション">
              <Link href="/races">レース一覧</Link>
              <Link href="/imports">取込履歴</Link>
              <Link href="/features">特徴量</Link>
              <Link href="/predictions">予測履歴</Link>
              <Link href="/predictions/analytics">予測分析</Link>
            </nav>
          </div>
        </header>
        <main className="page-shell">{children}</main>
        <footer className="site-footer">
          <p>
            本サービスは競馬データの管理・確認を目的としており、的中や利益を保証しません。
          </p>
        </footer>
      </body>
    </html>
  );
}

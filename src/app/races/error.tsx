"use client";

import Link from "next/link";
import { useEffect } from "react";

type RacesErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function RacesError({ error, reset }: RacesErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="empty-state">
      <h1>データベースに接続できませんでした</h1>
      <p>
        Supabase の接続情報、DATABASE_URL、ネットワーク状態を確認してください。
        ローカル開発では README の Supabase 接続手順も参考にしてください。
      </p>
      <div className="action-row">
        <button className="button" onClick={reset} type="button">
          再試行
        </button>
        <Link className="button button--secondary" href="/">
          トップへ戻る
        </Link>
      </div>
    </section>
  );
}

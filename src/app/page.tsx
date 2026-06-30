import Link from "next/link";

export default function HomePage() {
  return (
    <section className="hero">
      <p className="eyebrow">Phase 1 · Fact data only</p>
      <h1>レース情報を、静かに正確に。</h1>
      <p className="hero__lead">
        許諾されたサンプルデータを使い、レースと出走馬の基本情報を確認できます。
        AI予測や利益を保証する機能は含まれていません。
      </p>
      <Link className="primary-link" href="/races">
        レース一覧を見る
      </Link>
    </section>
  );
}

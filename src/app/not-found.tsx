import Link from "next/link";

export default function NotFoundPage() {
  return (
    <section className="empty-state">
      <h1>レースが見つかりません</h1>
      <p>指定されたレースは存在しないか、URLが正しくありません。</p>
      <Link className="primary-link" href="/races">
        レース一覧へ戻る
      </Link>
    </section>
  );
}

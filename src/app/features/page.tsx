import type { Metadata } from "next";
import Link from "next/link";

import {
  featureGenerationStatusLabels,
  formatFeatureCount,
  formatFeatureCountLabel,
  formatFeatureDateTime,
} from "@/features/features/formatters";
import { listFeatureGenerationBatches } from "@/features/features/queries";
import {
  buildFeatureBatchListHref,
  parseFeatureBatchListSearchParams,
} from "@/features/features/schemas";

type FeaturesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: "特徴量生成履歴",
};

export const dynamic = "force-dynamic";

const statusFilterLabels = {
  all: "すべて",
  running: "実行中",
  succeeded: "成功",
  failed: "失敗",
} as const;

export default async function FeaturesPage({ searchParams }: FeaturesPageProps) {
  const filters = parseFeatureBatchListSearchParams(await searchParams);
  const batchList = await listFeatureGenerationBatches(filters);
  const hasActiveFilter = filters.status !== "all";

  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Features</p>
          <h1>特徴量生成履歴</h1>
        </div>
        <p className="page-heading__note">
          Phase2 P0特徴量の生成結果を確認できます。AI予測やPhase3予測ロジックは含みません。
        </p>
      </div>

      <form className="filter-panel filter-panel--features" action="/features">
        <label>
          <span>status</span>
          <select name="status" defaultValue={filters.status}>
            {Object.entries(statusFilterLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <div className="filter-panel__actions">
          <button className="button" type="submit">
            絞り込む
          </button>
          {hasActiveFilter && (
            <Link className="button button--secondary" href="/features">
              条件をクリア
            </Link>
          )}
        </div>
      </form>

      <div className="list-summary">
        <p>{formatFeatureCountLabel(batchList.totalCount, batchList.pageSize)}</p>
        {batchList.totalCount > 0 && (
          <p>
            {batchList.page} / {batchList.totalPages} ページ
          </p>
        )}
      </div>

      {batchList.items.length === 0 ? (
        <div className="empty-state">
          <h2>特徴量生成履歴がありません</h2>
          <p>
            <code>npm run features:generate:dry-run</code> または{" "}
            <code>npm run features:generate</code>{" "}
            を実行すると、feature_generation_batches の履歴がここに表示されます。
          </p>
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">実行日時</th>
                  <th scope="col">as_of_at</th>
                  <th scope="col">status</th>
                  <th scope="col">total_count</th>
                  <th scope="col">success_count</th>
                  <th scope="col">failure_count</th>
                  <th scope="col">started_at</th>
                  <th scope="col">finished_at</th>
                </tr>
              </thead>
              <tbody>
                {batchList.items.map((batch) => (
                  <tr key={batch.id}>
                    <td>
                      <Link href={`/features/${batch.id}`}>
                        {formatFeatureDateTime(batch.startedAt)}
                      </Link>
                    </td>
                    <td>{formatFeatureDateTime(batch.asOfAt)}</td>
                    <td>
                      <span className={`status status--feature-${batch.status}`}>
                        {featureGenerationStatusLabels[batch.status]}
                      </span>
                    </td>
                    <td>{formatFeatureCount(batch.totalCount)}</td>
                    <td>{formatFeatureCount(batch.successCount)}</td>
                    <td>{formatFeatureCount(batch.failureCount)}</td>
                    <td>{formatFeatureDateTime(batch.startedAt)}</td>
                    <td>{formatFeatureDateTime(batch.finishedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <nav className="pagination" aria-label="特徴量生成履歴のページネーション">
            <Link
              aria-disabled={batchList.page <= 1}
              className="button button--secondary"
              href={
                batchList.page <= 1
                  ? buildFeatureBatchListHref(filters, { page: 1 })
                  : buildFeatureBatchListHref(filters, { page: batchList.page - 1 })
              }
            >
              前へ
            </Link>
            <span>
              {batchList.page} / {batchList.totalPages}
            </span>
            <Link
              aria-disabled={batchList.page >= batchList.totalPages}
              className="button button--secondary"
              href={
                batchList.page >= batchList.totalPages
                  ? buildFeatureBatchListHref(filters, {
                      page: batchList.totalPages,
                    })
                  : buildFeatureBatchListHref(filters, { page: batchList.page + 1 })
              }
            >
              次へ
            </Link>
          </nav>
        </>
      )}
    </section>
  );
}

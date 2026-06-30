import type { Metadata } from "next";
import Link from "next/link";

import {
  formatImportCount,
  formatImportCountLabel,
  formatImportDateTime,
  importModeLabels,
  importStatusLabels,
} from "@/features/imports/formatters";
import { listImportBatches } from "@/features/imports/queries";
import {
  buildImportListHref,
  parseImportListSearchParams,
} from "@/features/imports/schemas";

type ImportsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: "取込履歴",
};

export const dynamic = "force-dynamic";

const modeFilterLabels = {
  all: "すべて",
  dry_run: "dry-run",
  import: "import",
} as const;

const statusFilterLabels = {
  all: "すべて",
  running: "実行中",
  succeeded: "成功",
  failed: "失敗",
} as const;

export default async function ImportsPage({ searchParams }: ImportsPageProps) {
  const filters = parseImportListSearchParams(await searchParams);
  const importList = await listImportBatches(filters);
  const hasActiveFilter = filters.mode !== "all" || filters.status !== "all";

  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Imports</p>
          <h1>取込履歴</h1>
        </div>
        <p className="page-heading__note">
          CSV取込のdry-run / 実取込、成功・失敗状態を確認できます。
        </p>
      </div>

      <form className="filter-panel filter-panel--imports" action="/imports">
        <label>
          <span>mode</span>
          <select name="mode" defaultValue={filters.mode}>
            {Object.entries(modeFilterLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

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
            <Link className="button button--secondary" href="/imports">
              条件をクリア
            </Link>
          )}
        </div>
      </form>

      <div className="list-summary">
        <p>{formatImportCountLabel(importList.totalCount, importList.pageSize)}</p>
        {importList.totalCount > 0 && (
          <p>
            {importList.page} / {importList.totalPages} ページ
          </p>
        )}
      </div>

      {importList.items.length === 0 ? (
        <div className="empty-state">
          <h2>取込履歴がありません</h2>
          <p>
            CSV取込CLIを実行すると、dry-run / 実取込の履歴がここに表示されます。
          </p>
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">実行日時</th>
                  <th scope="col">provider</th>
                  <th scope="col">type</th>
                  <th scope="col">mode</th>
                  <th scope="col">status</th>
                  <th scope="col">total</th>
                  <th scope="col">inserted</th>
                  <th scope="col">updated</th>
                  <th scope="col">skipped</th>
                  <th scope="col">failed</th>
                  <th scope="col">source_dir</th>
                </tr>
              </thead>
              <tbody>
                {importList.items.map((batch) => (
                  <tr key={batch.id}>
                    <td>
                      <Link href={`/imports/${batch.id}`}>
                        {formatImportDateTime(batch.startedAt)}
                      </Link>
                    </td>
                    <td>{batch.providerCode}</td>
                    <td>{batch.importType}</td>
                    <td>{importModeLabels[batch.mode]}</td>
                    <td>
                      <span className={`status status--import-${batch.status}`}>
                        {importStatusLabels[batch.status]}
                      </span>
                    </td>
                    <td>{formatImportCount(batch.totalRows)}</td>
                    <td>{formatImportCount(batch.insertedRows)}</td>
                    <td>{formatImportCount(batch.updatedRows)}</td>
                    <td>{formatImportCount(batch.skippedRows)}</td>
                    <td>{formatImportCount(batch.failedRows)}</td>
                    <td className="path-cell">{batch.sourceDir}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <nav className="pagination" aria-label="取込履歴のページネーション">
            <Link
              aria-disabled={importList.page <= 1}
              className="button button--secondary"
              href={
                importList.page <= 1
                  ? buildImportListHref(filters, { page: 1 })
                  : buildImportListHref(filters, { page: importList.page - 1 })
              }
            >
              前へ
            </Link>
            <span>
              {importList.page} / {importList.totalPages}
            </span>
            <Link
              aria-disabled={importList.page >= importList.totalPages}
              className="button button--secondary"
              href={
                importList.page >= importList.totalPages
                  ? buildImportListHref(filters, { page: importList.totalPages })
                  : buildImportListHref(filters, { page: importList.page + 1 })
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

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  formatImportCount,
  formatImportDateTime,
  formatJson,
  importModeLabels,
  importStatusLabels,
} from "@/features/imports/formatters";
import { getImportBatchDetail } from "@/features/imports/queries";
import { importBatchIdSchema } from "@/features/imports/schemas";

type ImportDetailPageProps = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: ImportDetailPageProps): Promise<Metadata> {
  const parsedId = importBatchIdSchema.safeParse((await params).id);

  if (!parsedId.success) {
    return { title: "取込履歴が見つかりません" };
  }

  const detail = await getImportBatchDetail(parsedId.data);
  return {
    title: detail
      ? `取込履歴 ${formatImportDateTime(detail.batch.startedAt)}`
      : "取込履歴が見つかりません",
  };
}

export default async function ImportDetailPage({
  params,
}: ImportDetailPageProps) {
  const parsedId = importBatchIdSchema.safeParse((await params).id);

  if (!parsedId.success) {
    notFound();
  }

  const detail = await getImportBatchDetail(parsedId.data);

  if (!detail) {
    notFound();
  }

  const { batch, errors } = detail;

  return (
    <section>
      <Link className="back-link" href="/imports">
        ← 取込履歴へ
      </Link>

      <div className="race-hero">
        <div>
          <p className="eyebrow">Import Batch</p>
          <h1>{formatImportDateTime(batch.startedAt)}</h1>
          <p className="race-hero__condition">
            {batch.providerCode} ・ {batch.importType} ・{" "}
            {importModeLabels[batch.mode]}
          </p>
        </div>
        <dl className="race-hero__meta">
          <div>
            <dt>status</dt>
            <dd>
              <span className={`status status--import-${batch.status}`}>
                {importStatusLabels[batch.status]}
              </span>
            </dd>
          </div>
          <div>
            <dt>終了日時</dt>
            <dd>{formatImportDateTime(batch.finishedAt)}</dd>
          </div>
          <div>
            <dt>source_dir</dt>
            <dd className="path-cell">{batch.sourceDir}</dd>
          </div>
          <div>
            <dt>batch id</dt>
            <dd className="mono">{batch.id}</dd>
          </div>
        </dl>
      </div>

      <div className="metric-grid">
        <Metric label="total" value={batch.totalRows} />
        <Metric label="inserted" value={batch.insertedRows} />
        <Metric label="updated" value={batch.updatedRows} />
        <Metric label="skipped" value={batch.skippedRows} />
        <Metric label="failed" value={batch.failedRows} />
      </div>

      <div className="section-heading">
        <div>
          <p className="eyebrow">Summary</p>
          <h2>summary_json</h2>
        </div>
      </div>
      <pre className="json-block">{formatJson(batch.summaryJson)}</pre>

      <div className="section-heading section-heading--spaced">
        <div>
          <p className="eyebrow">Errors</p>
          <h2>エラー一覧</h2>
        </div>
        <p>{errors.length}件</p>
      </div>

      {errors.length === 0 ? (
        <div className="empty-state">
          <h2>エラーはありません</h2>
          <p>この取込batchには import_errors が記録されていません。</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">CSV</th>
                <th scope="col">行</th>
                <th scope="col">entity</th>
                <th scope="col">source_id</th>
                <th scope="col">code</th>
                <th scope="col">message</th>
                <th scope="col">raw_row_json</th>
              </tr>
            </thead>
            <tbody>
              {errors.map((error) => (
                <tr key={error.id}>
                  <td>{error.fileName}</td>
                  <td>{error.rowNumber ?? "—"}</td>
                  <td>{error.entityType ?? "—"}</td>
                  <td className="mono">{error.sourceId ?? "—"}</td>
                  <td>{error.errorCode}</td>
                  <td>{error.errorMessage}</td>
                  <td>
                    <pre className="json-inline">
                      {formatJson(error.rawRowJson)}
                    </pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{formatImportCount(value)}</strong>
    </div>
  );
}

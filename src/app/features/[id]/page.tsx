import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  featureGenerationModeLabels,
  featureGenerationStatusLabels,
  formatFeatureCount,
  formatFeatureDateTime,
  formatJson,
  phase2FeatureLabels,
} from "@/features/features/formatters";
import { getFeatureGenerationBatchDetail } from "@/features/features/queries";
import { featureGenerationBatchIdSchema } from "@/features/features/schemas";

type FeatureDetailPageProps = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: FeatureDetailPageProps): Promise<Metadata> {
  const parsedId = featureGenerationBatchIdSchema.safeParse((await params).id);

  if (!parsedId.success) {
    return { title: "特徴量生成履歴が見つかりません" };
  }

  const detail = await getFeatureGenerationBatchDetail(parsedId.data);
  return {
    title: detail
      ? `特徴量生成履歴 ${formatFeatureDateTime(detail.batch.startedAt)}`
      : "特徴量生成履歴が見つかりません",
  };
}

export default async function FeatureDetailPage({
  params,
}: FeatureDetailPageProps) {
  const parsedId = featureGenerationBatchIdSchema.safeParse((await params).id);

  if (!parsedId.success) {
    notFound();
  }

  const detail = await getFeatureGenerationBatchDetail(parsedId.data);

  if (!detail) {
    notFound();
  }

  const {
    batch,
    featureKeyCounts,
    generatedFeatureCount,
    targetRaceCount,
    targetRaceEntryCount,
  } = detail;

  return (
    <section>
      <Link className="back-link" href="/features">
        ← 特徴量生成履歴へ
      </Link>

      <div className="race-hero">
        <div>
          <p className="eyebrow">Feature Generation Batch</p>
          <h1>{formatFeatureDateTime(batch.startedAt)}</h1>
          <p className="race-hero__condition">
            as_of_at: {formatFeatureDateTime(batch.asOfAt)} ・ version{" "}
            {batch.featureVersion}
          </p>
        </div>
        <dl className="race-hero__meta">
          <div>
            <dt>status</dt>
            <dd>
              <span className={`status status--feature-${batch.status}`}>
                {featureGenerationStatusLabels[batch.status]}
              </span>
            </dd>
          </div>
          <div>
            <dt>mode</dt>
            <dd>{featureGenerationModeLabels[batch.mode]}</dd>
          </div>
          <div>
            <dt>started_at</dt>
            <dd>{formatFeatureDateTime(batch.startedAt)}</dd>
          </div>
          <div>
            <dt>finished_at</dt>
            <dd>{formatFeatureDateTime(batch.finishedAt)}</dd>
          </div>
          <div>
            <dt>batch id</dt>
            <dd className="mono">{batch.id}</dd>
          </div>
        </dl>
      </div>

      <div className="metric-grid metric-grid--features">
        <Metric label="generated features" value={generatedFeatureCount} />
        <Metric label="target races" value={targetRaceCount} />
        <Metric label="target entries" value={targetRaceEntryCount} />
        <Metric label="total_count" value={batch.totalCount} />
        <Metric label="success_count" value={batch.successCount} />
        <Metric label="failure_count" value={batch.failureCount} />
      </div>

      {generatedFeatureCount === 0 && (
        <div className="empty-state empty-state--compact">
          <h2>保存された特徴量はありません</h2>
          <p>
            dry-runの場合、または対象出走馬が0件の場合は feature_snapshots
            に保存されません。summary_json と件数を確認してください。
          </p>
        </div>
      )}

      <div className="section-heading section-heading--spaced">
        <div>
          <p className="eyebrow">Feature Counts</p>
          <h2>特徴量キー別件数</h2>
        </div>
        <p>{featureKeyCounts.length}種類</p>
      </div>

      {featureKeyCounts.length === 0 ? (
        <div className="empty-state empty-state--compact">
          <h2>特徴量キー別件数はありません</h2>
          <p>
            実取込モードで特徴量が保存されると、feature_keyごとの生成件数がここに表示されます。
          </p>
        </div>
      ) : (
        <div className="table-wrap table-wrap--compact">
          <table>
            <thead>
              <tr>
                <th scope="col">feature_key</th>
                <th scope="col">表示名</th>
                <th scope="col">件数</th>
              </tr>
            </thead>
            <tbody>
              {featureKeyCounts.map((item) => (
                <tr key={item.featureKey}>
                  <td className="mono">{item.featureKey}</td>
                  <td>{getFeatureLabel(item.featureKey)}</td>
                  <td>{formatFeatureCount(item.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="section-heading section-heading--spaced">
        <div>
          <p className="eyebrow">Summary</p>
          <h2>summary_json</h2>
        </div>
      </div>
      <pre className="json-block">{formatJson(batch.summaryJson)}</pre>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{formatFeatureCount(value)}</strong>
    </div>
  );
}

function getFeatureLabel(featureKey: string) {
  return featureKey in phase2FeatureLabels
    ? phase2FeatureLabels[featureKey as keyof typeof phase2FeatureLabels]
    : "未定義の特徴量";
}

import type { Metadata } from "next";
import Link from "next/link";

import {
  formatPredictionCount,
  formatPredictionMetric,
  formatPredictionRate,
} from "@/features/predictions/formatters";
import { getPredictionAnalytics } from "@/features/predictions/queries";
import { parsePredictionAnalyticsSearchParams } from "@/features/predictions/schemas";

type PredictionAnalyticsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: "予測分析",
};

export const dynamic = "force-dynamic";

const evaluationStatusLabels = {
  all: "すべて",
  evaluated: "評価済み",
  unevaluated: "未評価",
} as const;

export default async function PredictionAnalyticsPage({
  searchParams,
}: PredictionAnalyticsPageProps) {
  const filters = parsePredictionAnalyticsSearchParams(await searchParams);
  const { summary, modelVersions } = await getPredictionAnalytics(filters);
  const hasActiveFilter =
    filters.modelVersion !== "all" ||
    filters.asOfDate !== "" ||
    filters.evaluationStatus !== "all";

  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Prediction Analytics</p>
          <h1>予測分析</h1>
        </div>
        <p className="page-heading__note">
          評価済みの予測結果を集計し、スコア重み改善の手がかりを確認します。的中や利益を保証するものではありません。
        </p>
      </div>

      <form
        action="/predictions/analytics"
        className="filter-panel filter-panel--analytics"
      >
        <label>
          <span>model_version</span>
          <select name="modelVersion" defaultValue={filters.modelVersion}>
            <option value="all">すべて</option>
            {modelVersions.map(modelVersion => (
              <option key={modelVersion} value={modelVersion}>
                {modelVersion}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>prediction_as_of_at</span>
          <input
            defaultValue={filters.asOfDate}
            name="asOfDate"
            type="date"
          />
        </label>

        <label>
          <span>評価状態</span>
          <select
            name="evaluationStatus"
            defaultValue={filters.evaluationStatus}
          >
            {Object.entries(evaluationStatusLabels).map(([value, label]) => (
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
            <Link
              className="button button--secondary"
              href="/predictions/analytics"
            >
              条件をクリア
            </Link>
          )}
        </div>
      </form>

      {summary.totalPredictions === 0 ? (
        <div className="empty-state">
          <h2>分析対象の予測がありません</h2>
          <p>
            <code>npm run predictions:generate</code> と{" "}
            <code>npm run predictions:evaluate</code> を実行すると、評価集計を確認できます。
          </p>
        </div>
      ) : (
        <>
          <div className="prediction-notice">
            <h2>分析結果の扱い</h2>
            <p>
              この画面の集計は過去結果に対する検証です。勝率・複勝率ではなく、的中や利益を保証しません。
              {summary.hasSmallSampleWarning &&
                " 評価済みレース数が少ないため、傾向判断には注意してください。"}
            </p>
          </div>

          <div className="metric-grid metric-grid--analytics">
            <Metric
              label="評価済みレース数"
              value={formatPredictionCount(summary.evaluatedRaceCount)}
            />
            <Metric
              label="予測1位馬の3着内率"
              value={formatPredictionRate(summary.top1Top3Rate)}
            />
            <Metric
              label="上位3頭内に実1着"
              value={formatPredictionRate(summary.winnerInPredictedTop3Rate)}
            />
            <Metric
              label="平均順位差"
              value={formatPredictionMetric(summary.averageRankDiff)}
            />
            <Metric
              label="評価済み予測数"
              value={`${formatPredictionCount(summary.evaluatedPredictions)} / ${formatPredictionCount(summary.totalPredictions)}`}
            />
          </div>

          <section className="section-block">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Model versions</p>
                <h2>model_version別比較</h2>
              </div>
              <p>
                評価件数が少ないmodelVersionは「参考値」として扱ってください。
              </p>
            </div>

            {summary.modelVersionSummaries.length === 0 ? (
              <div className="empty-state empty-state--compact">
                <p>比較対象がありません。</p>
              </div>
            ) : (
              <>
                {summary.modelVersionComparison && (
                  <div className="comparison-panel">
                    <div>
                      <span>比較</span>
                      <strong>
                        {summary.modelVersionComparison.candidateModelVersion} -
                        {" "}
                        {summary.modelVersionComparison.baseModelVersion}
                      </strong>
                      {summary.modelVersionComparison.isSmallSample && (
                        <small>評価件数が少ないため参考値です</small>
                      )}
                    </div>
                    <ComparisonMetric
                      label="評価済みレース数"
                      value={formatSignedCount(
                        summary.modelVersionComparison.evaluatedRaceCountDiff,
                      )}
                    />
                    <ComparisonMetric
                      label="評価済み予測数"
                      value={formatSignedCount(
                        summary.modelVersionComparison
                          .evaluatedPredictionCountDiff,
                      )}
                    />
                    <ComparisonMetric
                      label="予測1位馬の3着内率"
                      value={formatSignedRateDiff(
                        summary.modelVersionComparison.top1Top3RateDiff,
                      )}
                    />
                    <ComparisonMetric
                      label="上位3頭内に実1着"
                      value={formatSignedRateDiff(
                        summary.modelVersionComparison
                          .winnerInPredictedTop3RateDiff,
                      )}
                    />
                    <ComparisonMetric
                      label="平均順位差"
                      note="小さいほど良い"
                      value={formatSignedMetricDiff(
                        summary.modelVersionComparison.averageRankDiffDiff,
                      )}
                    />
                  </div>
                )}

                <div className="model-card-grid">
                  {summary.modelVersionSummaries.map(item => (
                    <article className="model-comparison-card" key={item.modelVersion}>
                      <div className="model-comparison-card__header">
                        <h3>{item.modelVersion}</h3>
                        {item.isSmallSample && (
                          <span className="status status--reference">
                            参考値
                          </span>
                        )}
                      </div>
                      <dl>
                        <ComparisonRow
                          label="評価済みレース数"
                          value={formatPredictionCount(item.evaluatedRaceCount)}
                        />
                        <ComparisonRow
                          label="予測1位馬の3着内率"
                          value={formatPredictionRate(item.top1Top3Rate)}
                        />
                        <ComparisonRow
                          label="上位3頭内に実1着"
                          value={formatPredictionRate(
                            item.winnerInPredictedTop3Rate,
                          )}
                        />
                        <ComparisonRow
                          label="平均順位差"
                          value={formatPredictionMetric(item.averageRankDiff)}
                        />
                        <ComparisonRow
                          label="評価済み予測数"
                          value={`${formatPredictionCount(item.evaluatedPredictionCount)} / ${formatPredictionCount(item.predictionCount)}`}
                        />
                      </dl>
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>

          <section className="section-block">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Feature contributions</p>
                <h2>feature_key別の平均寄与</h2>
              </div>
              <p>
                `score_components_json` の加点・減点をmodel_version別に比較しています。
              </p>
            </div>

            {summary.featureContributionComparisons.length === 0 ? (
              <div className="empty-state empty-state--compact">
                <p>寄与情報がありません。</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">feature_key</th>
                      <th scope="col">表示名</th>
                      <th scope="col">model_version別 平均寄与</th>
                      <th scope="col">平均との差分</th>
                      <th scope="col">件数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.featureContributionComparisons.map(item => (
                      <tr key={item.featureKey}>
                        <td className="mono">{item.featureKey}</td>
                        <td>{item.label}</td>
                        <td>
                          <div className="contribution-stack">
                            {item.byModelVersion.map(model => (
                              <span key={model.modelVersion}>
                                <strong>{model.modelVersion}</strong>
                                {formatPredictionMetric(model.averageAdjustment)}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td>
                          {formatSignedMetricDiff(item.averageAdjustmentDiff)}
                        </td>
                        <td>
                          <div className="contribution-stack">
                            {item.byModelVersion.map(model => (
                              <span key={model.modelVersion}>
                                <strong>{model.modelVersion}</strong>
                                {formatPredictionCount(model.count)}件
                                {" / +"}
                                {formatPredictionCount(model.positiveCount)}
                                {" / -"}
                                {formatPredictionCount(model.negativeCount)}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ComparisonMetric({
  label,
  note,
  value,
}: {
  label: string;
  note?: string;
  value: string;
}) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}

function ComparisonRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function formatSignedCount(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatPredictionCount(value)}`;
}

function formatSignedRateDiff(value: number | null) {
  if (value === null) {
    return "—";
  }

  const sign = value > 0 ? "+" : "";
  return `${sign}${formatPredictionRate(value)}`;
}

function formatSignedMetricDiff(value: number | null) {
  if (value === null) {
    return "—";
  }

  const sign = value > 0 ? "+" : "";
  return `${sign}${formatPredictionMetric(value)}`;
}

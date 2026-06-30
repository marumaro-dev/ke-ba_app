import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  formatBooleanResult,
  formatFinishPosition,
  formatJson,
  formatPredictionAdjustment,
  formatPredictionCount,
  formatPredictionDateTime,
  formatPredictionScore,
  formatRankDiff,
  predictionModeLabels,
  predictionRunStatusLabels,
  summarizePredictionReasons,
} from "@/features/predictions/formatters";
import { getPredictionRunDetail } from "@/features/predictions/queries";
import { predictionRunIdSchema } from "@/features/predictions/schemas";

type PredictionDetailPageProps = {
  params: Promise<{ id: string }>;
};

type PredictionItem = NonNullable<
  Awaited<ReturnType<typeof getPredictionRunDetail>>
>["predictions"][number];

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PredictionDetailPageProps): Promise<Metadata> {
  const parsedId = predictionRunIdSchema.safeParse((await params).id);

  if (!parsedId.success) {
    return { title: "予測履歴が見つかりません" };
  }

  const detail = await getPredictionRunDetail(parsedId.data);
  return {
    title: detail
      ? `予測履歴 ${formatPredictionDateTime(detail.run.startedAt)}`
      : "予測履歴が見つかりません",
  };
}

export default async function PredictionDetailPage({
  params,
}: PredictionDetailPageProps) {
  const parsedId = predictionRunIdSchema.safeParse((await params).id);

  if (!parsedId.success) {
    notFound();
  }

  const detail = await getPredictionRunDetail(parsedId.data);

  if (!detail) {
    notFound();
  }

  const { evaluationCount, run, predictionCount, targetRaceCount, predictions } =
    detail;
  const raceGroups = groupPredictionsByRace(predictions);

  return (
    <section>
      <Link className="back-link" href="/predictions">
        ← 予測履歴へ
      </Link>

      <div className="race-hero">
        <div>
          <p className="eyebrow">Prediction Run</p>
          <h1>{formatPredictionDateTime(run.startedAt)}</h1>
          <p className="race-hero__condition">
            as_of_at: {formatPredictionDateTime(run.asOfAt)} ・{" "}
            {run.predictionType} ・ {run.modelVersion}
          </p>
        </div>
        <dl className="race-hero__meta">
          <div>
            <dt>status</dt>
            <dd>
              <span className={`status status--feature-${run.status}`}>
                {predictionRunStatusLabels[run.status]}
              </span>
            </dd>
          </div>
          <div>
            <dt>mode</dt>
            <dd>{predictionModeLabels[run.mode]}</dd>
          </div>
          <div>
            <dt>finished_at</dt>
            <dd>{formatPredictionDateTime(run.finishedAt)}</dd>
          </div>
          <div>
            <dt>run id</dt>
            <dd className="mono">{run.id}</dd>
          </div>
        </dl>
      </div>

      <div className="metric-grid metric-grid--features">
        <Metric label="predictions" value={predictionCount} />
        <Metric label="evaluations" value={evaluationCount} />
        <Metric label="target races" value={targetRaceCount} />
        <Metric label="total_count" value={run.totalCount} />
        <Metric label="success_count" value={run.successCount} />
        <Metric label="failure_count" value={run.failureCount} />
      </div>

      <div className="prediction-notice">
        <h2>注意</h2>
        <p>
          評価は、保存済みの予測スコアをレース結果と突合した過去検証です。的中や利益を保証するものではなく、買い目提案でもありません。
        </p>
      </div>

      <div className="section-heading section-heading--spaced">
        <div>
          <p className="eyebrow">Predictions</p>
          <h2>予測結果と評価</h2>
        </div>
        <p>{predictions.length}件</p>
      </div>

      {raceGroups.length === 0 ? (
        <div className="empty-state empty-state--compact">
          <h2>保存された予測結果はありません</h2>
          <p>dry-runの場合、race_predictionsには保存されません。</p>
        </div>
      ) : (
        <div className="prediction-race-list">
          {raceGroups.map((group) => (
            <section className="prediction-race-card" key={group.raceId}>
              <div className="prediction-race-card__header">
                <div>
                  <p className="eyebrow">
                    {group.raceDate} ・ {group.venue}
                    {group.raceNumber}R
                  </p>
                  <h3>
                    <Link href={`/races/${group.raceId}`}>
                      {group.raceName}
                    </Link>
                  </h3>
                </div>
                <RaceEvaluationSummary items={group.items} />
              </div>

              <div className="prediction-entry-list">
                {group.items.map((prediction) => (
                  <PredictionEntryCard
                    key={prediction.id}
                    prediction={prediction}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <div className="section-heading section-heading--spaced">
        <div>
          <p className="eyebrow">Summary</p>
          <h2>summary_json</h2>
        </div>
      </div>
      <pre className="json-block">{formatJson(run.summaryJson)}</pre>
    </section>
  );
}

function RaceEvaluationSummary({ items }: { items: PredictionItem[] }) {
  const topPrediction = items.find((item) => item.isPredictedTop1);
  const evaluated = items.some((item) => item.evaluatedAt !== null);

  if (!evaluated) {
    return <span>未評価</span>;
  }

  return (
    <div className="evaluation-summary">
      <span>
        予測1位実着順:{" "}
        {formatFinishPosition(topPrediction?.topPredictionFinishPosition ?? null)}
      </span>
      <span>
        予測1位3着内:{" "}
        {formatBooleanResult(topPrediction?.topPredictionIsTop3 ?? null)}
      </span>
      <span>
        上位3頭に実1着:{" "}
        {formatBooleanResult(
          topPrediction?.actualWinnerInPredictedTop3 ?? null,
        )}
      </span>
    </div>
  );
}

function PredictionEntryCard({ prediction }: { prediction: PredictionItem }) {
  const reasonSummary = summarizePredictionReasons(
    prediction.scoreComponentsJson,
  );

  return (
    <article className="prediction-entry-card">
      <div className="prediction-entry-card__top">
        <div>
          <span className="horse-number">{prediction.horseNumber}</span>
          <strong>{prediction.horseName}</strong>
          <small>{prediction.jockeyName ?? "騎手未設定"}</small>
        </div>
        <div>
          <span>予測順位</span>
          <strong>{prediction.rankInRace ?? "—"}</strong>
        </div>
        <div>
          <span>スコア</span>
          <strong>{formatPredictionScore(prediction.predictionScore)}</strong>
        </div>
        <div>
          <span>実着順</span>
          <strong>{formatFinishPosition(prediction.finishPosition)}</strong>
        </div>
        <div>
          <span>順位差</span>
          <strong>{formatRankDiff(prediction.rankDiff)}</strong>
        </div>
      </div>

      <div className="prediction-reason-grid">
        <PredictionReasonList
          emptyText="主な加点理由はありません"
          reasons={reasonSummary.positiveReasons}
          title="主な加点理由"
        />
        <PredictionReasonList
          emptyText="主な減点理由はありません"
          reasons={reasonSummary.negativeReasons}
          title="主な減点理由"
        />
      </div>
    </article>
  );
}

function PredictionReasonList({
  emptyText,
  reasons,
  title,
}: {
  emptyText: string;
  reasons: ReturnType<typeof summarizePredictionReasons>["positiveReasons"];
  title: string;
}) {
  return (
    <section className="prediction-reasons">
      <h4>{title}</h4>
      {reasons.length === 0 ? (
        <p>{emptyText}</p>
      ) : (
        <ul>
          {reasons.map((reason) => (
            <li key={`${reason.key}:${reason.adjustment}`}>
              <strong>{formatPredictionAdjustment(reason.adjustment)}</strong>
              <span>{reason.reason}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{formatPredictionCount(value)}</strong>
    </div>
  );
}

function groupPredictionsByRace(predictions: PredictionItem[]) {
  const map = new Map<
    string,
    {
      raceId: string;
      raceDate: string;
      raceName: string;
      raceNumber: number;
      venue: string;
      items: PredictionItem[];
    }
  >();

  for (const prediction of predictions) {
    const group = map.get(prediction.raceId) ?? {
      raceId: prediction.raceId,
      raceDate: prediction.raceDate,
      raceName: prediction.raceName,
      raceNumber: prediction.raceNumber,
      venue: prediction.venue,
      items: [],
    };
    group.items.push(prediction);
    map.set(prediction.raceId, group);
  }

  return Array.from(map.values()).map((group) => ({
    ...group,
    items: group.items.sort(
      (a, b) => (a.rankInRace ?? 999) - (b.rankInRace ?? 999),
    ),
  }));
}

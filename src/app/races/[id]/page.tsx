import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  formatFeatureDateTime,
  formatPhase2FeatureValue,
  phase2FeatureGroupLabels,
  phase2FeatureLabels,
} from "@/features/features/formatters";
import {
  formatPredictionAdjustment,
  formatPredictionScore,
  summarizePredictionReasons,
} from "@/features/predictions/formatters";
import {
  formatBodyWeight,
  formatDate,
  formatDateTime,
  formatFinishPosition,
  formatFinishTime,
} from "@/features/races/formatters";
import {
  getRaceDetail,
  type RaceEntryFeature,
  type RaceEntryPrediction,
} from "@/features/races/queries";
import { raceIdSchema } from "@/features/races/schemas";

type RaceDetailPageProps = {
  params: Promise<{ id: string }>;
};

type FeatureItem = {
  key: keyof typeof phase2FeatureLabels;
  category: string;
};

export const dynamic = "force-dynamic";

const sexLabels = {
  male: "牡",
  female: "牝",
  gelding: "せん",
} as const;

const entryStatusLabels = {
  entered: "登録",
  running: "出走",
  scratched: "取消",
  excluded: "除外",
} as const;

const p0FeatureGroups: Array<{ title: string; items: FeatureItem[] }> = [
  {
    title: "前走間隔・休み明け",
    items: [
      { key: "horse.days_since_last_race", category: "間隔" },
      { key: "horse.has_past_race", category: "経験" },
      { key: "horse.is_after_layoff_8w", category: "休養" },
    ],
  },
  {
    title: "芝/ダート別成績",
    items: [
      { key: "horse.surface_starts", category: "出走数" },
      { key: "horse.surface_top3_rate", category: "3着内率" },
    ],
  },
  {
    title: "距離別成績",
    items: [
      { key: "horse.distance_starts", category: "出走数" },
      { key: "horse.distance_top3_rate", category: "3着内率" },
    ],
  },
];

const p1FeatureGroups: Array<{ title: string; items: FeatureItem[] }> = [
  {
    title: "持ち時計",
    items: [
      { key: "horse.best_time_same_surface_distance_ms", category: "最速時計" },
      {
        key: "horse.best_time_same_surface_distance_count",
        category: "対象数",
      },
    ],
  },
  {
    title: "馬場状態別成績",
    items: [
      { key: "horse.track_condition_starts", category: "出走数" },
      { key: "horse.track_condition_top3_rate", category: "3着内率" },
    ],
  },
  {
    title: "コース別成績",
    items: [
      { key: "horse.course_starts", category: "出走数" },
      { key: "horse.course_top3_rate", category: "3着内率" },
    ],
  },
];

const p2FeatureGroups: Array<{ title: string; items: FeatureItem[] }> = [
  {
    title: "騎手×競馬場成績",
    items: [
      { key: "jockey.venue_starts", category: "騎乗数" },
      { key: "jockey.venue_wins", category: "勝利数" },
      { key: "jockey.venue_top3", category: "3着内数" },
      { key: "jockey.venue_win_rate", category: "勝率" },
      { key: "jockey.venue_top3_rate", category: "3着内率" },
    ],
  },
  {
    title: "騎手×距離成績",
    items: [
      { key: "jockey.distance_starts", category: "騎乗数" },
      { key: "jockey.distance_wins", category: "勝利数" },
      { key: "jockey.distance_top3", category: "3着内数" },
      { key: "jockey.distance_win_rate", category: "勝率" },
      { key: "jockey.distance_top3_rate", category: "3着内率" },
    ],
  },
];

export async function generateMetadata({
  params,
}: RaceDetailPageProps): Promise<Metadata> {
  const parsedId = raceIdSchema.safeParse((await params).id);

  if (!parsedId.success) {
    return { title: "レースが見つかりません" };
  }

  const detail = await getRaceDetail(parsedId.data);
  return { title: detail?.race.name ?? "レースが見つかりません" };
}

export default async function RaceDetailPage({
  params,
}: RaceDetailPageProps) {
  const parsedId = raceIdSchema.safeParse((await params).id);

  if (!parsedId.success) {
    notFound();
  }

  const detail = await getRaceDetail(parsedId.data);

  if (!detail) {
    notFound();
  }

  const { race, entries } = detail;

  return (
    <section>
      <Link className="back-link" href="/races">
        ← レース一覧へ
      </Link>

      <div className="race-hero">
        <div>
          <p className="eyebrow">
            {formatDate(race.raceDate)} ・ {race.venue} {race.raceNumber}R
          </p>
          <h1>{race.name}</h1>
          <p className="race-hero__condition">
            {formatDateTime(race.scheduledStartAt)}発走 ・ {race.surface}{" "}
            {race.distanceMeters.toLocaleString()}m
          </p>
        </div>
        <dl className="race-hero__meta">
          <div>
            <dt>天候</dt>
            <dd>{race.weather ?? "未発表"}</dd>
          </div>
          <div>
            <dt>馬場</dt>
            <dd>{race.trackCondition ?? "未発表"}</dd>
          </div>
          <div>
            <dt>利用可能時刻</dt>
            <dd>{formatDateTime(race.availableAt)}</dd>
          </div>
          <div>
            <dt>観測時刻</dt>
            <dd>{formatDateTime(race.observedAt)}</dd>
          </div>
        </dl>
      </div>

      <div className="section-heading">
        <div>
          <p className="eyebrow">Entries</p>
          <h2>出走馬・予測スコア</h2>
        </div>
        <p>{entries.length}頭</p>
      </div>

      {entries.length === 0 ? (
        <div className="empty-state">
          <h2>出走馬情報がまだありません</h2>
          <p>CSV取込やデータ投入状況を確認してください。</p>
        </div>
      ) : (
        <div className="entry-card-grid">
          {entries.map((entry) => (
            <article className="entry-card" key={entry.id}>
              <div className="entry-card__header">
                <div className="entry-card__number">
                  <span className={`frame frame--${entry.frameNumber}`}>
                    {entry.frameNumber}
                  </span>
                  <span className="horse-number">{entry.horseNumber}</span>
                </div>
                <div>
                  <h3>{entry.horseName}</h3>
                  <p>
                    {entry.horseSex ? sexLabels[entry.horseSex] : "性別不明"} ・{" "}
                    {entry.jockeyName}
                  </p>
                </div>
                <span className={`status status--entry-${entry.entryStatus}`}>
                  {entryStatusLabels[entry.entryStatus]}
                </span>
              </div>

              <dl className="entry-card__facts">
                <div>
                  <dt>調教師</dt>
                  <dd>
                    {entry.trainerName}
                    {entry.trainerAffiliation
                      ? `（${entry.trainerAffiliation}）`
                      : ""}
                  </dd>
                </div>
                <div>
                  <dt>斤量</dt>
                  <dd>{entry.assignedWeight}kg</dd>
                </div>
                <div>
                  <dt>馬体重</dt>
                  <dd>
                    {formatBodyWeight(entry.bodyWeight, entry.bodyWeightDiff)}
                  </dd>
                </div>
                <div>
                  <dt>結果</dt>
                  <dd>
                    {formatFinishPosition(
                      entry.finishPosition,
                      entry.finishStatus,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>タイム</dt>
                  <dd>{formatFinishTime(entry.finishTimeMilliseconds)}</dd>
                </div>
                <div>
                  <dt>単勝オッズ</dt>
                  <dd>
                    {entry.finalOdds === null
                      ? "—"
                      : Number(entry.finalOdds).toFixed(1)}
                  </dd>
                </div>
              </dl>

              <EntryPrediction prediction={entry.prediction} />
              <EntryFeatures features={entry.features} />
            </article>
          ))}
        </div>
      )}

      <p className="data-note">
        予測スコアは特徴量に基づく相対評価です。勝率・複勝率ではなく、的中や利益を保証しません。
      </p>
    </section>
  );
}

function EntryPrediction({
  prediction,
}: {
  prediction: RaceEntryPrediction | null;
}) {
  if (!prediction) {
    return (
      <div className="feature-empty">
        <strong>予測スコアは未生成です</strong>
        <span>npm run predictions:generate 実行後に表示されます</span>
      </div>
    );
  }

  const reasonSummary = summarizePredictionReasons(
    prediction.scoreComponentsJson,
  );

  return (
    <div className="prediction-card prediction-card--expanded">
      <div>
        <span>予測スコア</span>
        <strong>{formatPredictionScore(prediction.predictionScore)}</strong>
      </div>
      <div>
        <span>レース内順位</span>
        <strong>{prediction.rankInRace ?? "—"}</strong>
      </div>
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
      <p>
        as_of_at: {formatFeatureDateTime(prediction.asOfAt)}。{reasonSummary.disclaimer}
      </p>
    </div>
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

function EntryFeatures({ features }: { features: RaceEntryFeature[] }) {
  if (features.length === 0) {
    return (
      <div className="feature-empty">
        <strong>特徴量は未生成です</strong>
        <span>npm run features:generate 実行後に表示されます</span>
      </div>
    );
  }

  const featuresByKey = new Map(
    features.map((feature) => [feature.featureKey, feature]),
  );
  const latestAsOfAt = features.reduce<Date | null>((latest, feature) => {
    if (!latest || feature.asOfAt > latest) {
      return feature.asOfAt;
    }

    return latest;
  }, null);

  return (
    <div className="feature-groups">
      <FeaturePriorityGroup
        featuresByKey={featuresByKey}
        groups={p0FeatureGroups}
        label={phase2FeatureGroupLabels.p0}
      />
      <FeaturePriorityGroup
        featuresByKey={featuresByKey}
        groups={p1FeatureGroups}
        label={phase2FeatureGroupLabels.p1}
      />
      <FeaturePriorityGroup
        featuresByKey={featuresByKey}
        groups={p2FeatureGroups}
        label={phase2FeatureGroupLabels.p2}
      />
      <p className="feature-asof">
        最新 as_of_at: {formatFeatureDateTime(latestAsOfAt)}
      </p>
    </div>
  );
}

function FeaturePriorityGroup({
  featuresByKey,
  groups,
  label,
}: {
  featuresByKey: Map<string, RaceEntryFeature>;
  groups: Array<{ title: string; items: FeatureItem[] }>;
  label: string;
}) {
  return (
    <details className="feature-priority">
      <summary>{label}</summary>
      <div className="feature-category-grid">
        {groups.map((group) => (
          <div className="feature-category" key={group.title}>
            <h4>{group.title}</h4>
            {group.items.map((item) => {
              const feature = featuresByKey.get(item.key);

              return (
                <div className="feature-row" key={item.key}>
                  <span>
                    {item.category}
                    <small>{phase2FeatureLabels[item.key]}</small>
                  </span>
                  <strong>
                    {feature
                      ? formatPhase2FeatureValue(item.key, feature.value)
                      : "未生成"}
                  </strong>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </details>
  );
}

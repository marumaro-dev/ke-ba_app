import type { Metadata } from "next";
import Link from "next/link";

import {
  formatDate,
  formatDateTime,
  formatRaceCountLabel,
} from "@/features/races/formatters";
import {
  getRaceFilterOptions,
  listRaces,
} from "@/features/races/queries";
import {
  buildRaceListHref,
  parseRaceListSearchParams,
} from "@/features/races/schemas";

type RacesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: "レース一覧",
};

export const dynamic = "force-dynamic";

const statusLabels = {
  scheduled: "予定",
  confirmed: "確定",
  cancelled: "中止",
} as const;

const surfaceFilterLabels = {
  all: "すべて",
  turf: "芝",
  dirt: "ダート",
} as const;

export default async function RacesPage({ searchParams }: RacesPageProps) {
  const filters = parseRaceListSearchParams(await searchParams);
  const [raceList, filterOptions] = await Promise.all([
    listRaces(filters),
    getRaceFilterOptions(),
  ]);
  const hasActiveFilter = Boolean(
    filters.raceDate || filters.venue || filters.surface !== "all",
  );

  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Races</p>
          <h1>レース一覧</h1>
        </div>
        <p className="page-heading__note">
          開催日・競馬場・芝/ダートで絞り込めます。条件はURLに保持されます。
        </p>
      </div>

      <form className="filter-panel" action="/races">
        <label>
          <span>開催日</span>
          <select name="raceDate" defaultValue={filters.raceDate ?? ""}>
            <option value="">すべて</option>
            {filterOptions.raceDates.map((raceDate) => (
              <option key={raceDate} value={raceDate}>
                {formatDate(raceDate)}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>競馬場</span>
          <select name="venue" defaultValue={filters.venue ?? ""}>
            <option value="">すべて</option>
            {filterOptions.venues.map((venue) => (
              <option key={venue} value={venue}>
                {venue}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>コース</span>
          <select name="surface" defaultValue={filters.surface}>
            {Object.entries(surfaceFilterLabels).map(([value, label]) => (
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
            <Link className="button button--secondary" href="/races">
              条件をクリア
            </Link>
          )}
        </div>
      </form>

      <div className="list-summary">
        <p>{formatRaceCountLabel(raceList.totalCount, raceList.pageSize)}</p>
        {raceList.totalCount > 0 && (
          <p>
            {raceList.page} / {raceList.totalPages} ページ
          </p>
        )}
      </div>

      {raceList.items.length === 0 ? (
        <div className="empty-state">
          <h2>条件に一致するレースがありません</h2>
          <p>
            フィルター条件を変更するか、条件をクリアしてください。初期データが未投入の場合は
            README の手順で migration と seed を実行します。
          </p>
          <Link className="button" href="/races">
            すべてのレースを表示
          </Link>
        </div>
      ) : (
        <>
          <div className="race-grid">
            {raceList.items.map((race) => (
              <article className="race-card" key={race.id}>
                <div className="race-card__topline">
                  <span>{formatDate(race.raceDate)}</span>
                  <span className={`status status--${race.status}`}>
                    {statusLabels[race.status]}
                  </span>
                </div>
                <p className="race-card__number">
                  {race.venue} {race.raceNumber}R
                </p>
                <h2>
                  <Link href={`/races/${race.id}`}>{race.name}</Link>
                </h2>
                <dl className="race-card__facts">
                  <div>
                    <dt>発走</dt>
                    <dd>{formatDateTime(race.scheduledStartAt)}</dd>
                  </div>
                  <div>
                    <dt>条件</dt>
                    <dd>
                      {race.surface} {race.distanceMeters.toLocaleString()}m
                    </dd>
                  </div>
                  <div>
                    <dt>データ観測</dt>
                    <dd>{formatDateTime(race.observedAt)}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>

          <nav className="pagination" aria-label="レース一覧のページネーション">
            <Link
              aria-disabled={raceList.page <= 1}
              className="button button--secondary"
              href={
                raceList.page <= 1
                  ? buildRaceListHref(filters, { page: 1 })
                  : buildRaceListHref(filters, { page: raceList.page - 1 })
              }
            >
              前へ
            </Link>
            <span>
              {raceList.page} / {raceList.totalPages}
            </span>
            <Link
              aria-disabled={raceList.page >= raceList.totalPages}
              className="button button--secondary"
              href={
                raceList.page >= raceList.totalPages
                  ? buildRaceListHref(filters, { page: raceList.totalPages })
                  : buildRaceListHref(filters, { page: raceList.page + 1 })
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

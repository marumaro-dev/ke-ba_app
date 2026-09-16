export type TargetEntryRawFields = {
  B: string | null;
  直前: string | null;
  芝短: string | null;
  芝中: string | null;
  ダ短: string | null;
  ダ中: string | null;
  脚: string | null;
};

export type ParsedTargetEntry = {
  frameNumber: number;
  horseNumber: number;
  rawHorseNumberMarker: "*" | "$" | null;
  horseName: string;
  sex: "male" | "female" | "gelding";
  age: number;
  rawSexAgeMarker: string | null;
  jockeyName: string;
  assignedWeight: number;
  weightAllowanceSymbol: string | null;
  trainerName: null;
  interval: number | null;
  rawIntervalMarker: string | null;
  zi: number | null;
  rawZiMarker: string | null;
  rawOdds: number | null;
  oddsObservedAt: null;
  rawFields: TargetEntryRawFields;
  ignoredPostRaceFields: readonly ["結"] | [];
};

export type ParsedTargetRace = {
  raceDate: string;
  venue: string;
  raceNumber: number;
  scheduledStartAt: string;
  surface: "turf" | "dirt";
  distanceMeters: number;
  declaredEntries: number;
  entries: ParsedTargetEntry[];
};

export type ParsedTargetEntries = {
  observedAt: string;
  races: ParsedTargetRace[];
};

export type ParseTargetEntriesOptions = {
  observedAt: string;
};

const RACE_MARKER = /^\s*(\d{1,2})R(?:\s+.*)?$/;
const RACE_HEADER = /^(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日.*?\d+回(.+?)\d+日目\s+(\d{1,2}):(\d{2})発走/;
const RACE_DETAILS = /(芝|ダート)\s*(\d+)m(?:[^\d]+)?(\d+)頭立/;
const TABLE_HEADER_LABELS = ["枠", "馬", "馬名", "性齢", "騎手", "斤量", "ZI", "Odds", "結"];

// TARGET's entry table is a fixed-width, 79-column layout. The boundaries below
// are display columns (ASCII/half-width = 1, Japanese/full-width = 2), matching
// the Shift_JIS byte columns without coupling parsing to a particular decoder.
const ENTRY_COLUMNS = {
  B: [0, 1],
  frame: [1, 3],
  horseNumber: [3, 6],
  horseName: [6, 25],
  sexAndJockey: [25, 37],
  assignedWeight: [36, 41],
  interval: [41, 43],
  zi: [43, 48],
  before: [48, 52],
  turfShort: [52, 56],
  turfMiddle: [56, 60],
  dirtShort: [60, 64],
  dirtMiddle: [64, 68],
  runningStyle: [69, 72],
  odds: [72, 77],
  result: [77, 79],
} as const;
const ENTRY_LINE_WIDTH = 79;

export function parseTargetEntriesBytes(
  bytes: Uint8Array,
  options: ParseTargetEntriesOptions,
) {
  return parseTargetEntriesText(decodeTargetEntriesText(bytes), options);
}

export function parseTargetEntriesText(
  input: string,
  options: ParseTargetEntriesOptions,
): ParsedTargetEntries {
  const observedAt = parseObservedAt(options.observedAt);
  const lines = input.replace(/\r\n?/g, "\n").split("\n");
  const markers = lines
    .map((line, index) => ({ index, match: line.normalize("NFKC").match(RACE_MARKER) }))
    .filter((item): item is { index: number; match: RegExpMatchArray } => Boolean(item.match));

  if (markers.length === 0) throw new Error("No race markers were found in TARGET entries text.");

  const races = markers.map((marker, markerIndex) => {
    const blockEnd = markers[markerIndex + 1]?.index ?? lines.length;
    const headerLine = findPreviousLine(
      lines,
      marker.index,
      (line) => RACE_HEADER.test(line.normalize("NFKC")),
    );
    const header = headerLine.normalize("NFKC").match(RACE_HEADER);
    if (!header) throw new Error("TARGET race header could not be parsed.");

    const raceDate = toIsoDate(Number(header[1]), Number(header[2]), Number(header[3]));
    const venue = normalizeText(header[4]);
    const scheduledStartAt = `${raceDate}T${header[5].padStart(2, "0")}:${header[6]}:00+09:00`;
    const detailsLine = findNextLine(
      lines,
      marker.index + 1,
      blockEnd,
      (line) => RACE_DETAILS.test(line.normalize("NFKC")),
    );
    const details = detailsLine.normalize("NFKC").match(RACE_DETAILS);
    if (!details) throw new Error("TARGET race details could not be parsed.");

    const tableHeaderIndex = findNextIndex(
      lines,
      marker.index + 1,
      blockEnd,
      (line) => TABLE_HEADER_LABELS.every((label) => line.normalize("NFKC").includes(label)),
    );
    assertSupportedEntryHeader(lines[tableHeaderIndex]);
    const entries = collectEntryLines(lines, tableHeaderIndex + 1, blockEnd).map(parseEntryLine);
    const declaredEntries = Number(details[3]);
    const raceNumber = Number(marker.match[1]);

    if (entries.length !== declaredEntries) {
      throw new Error(
        `Race ${raceNumber}: declared entries (${declaredEntries}) do not match parsed rows (${entries.length}).`,
      );
    }

    return {
      raceDate,
      venue,
      raceNumber,
      scheduledStartAt,
      surface: details[1] === "芝" ? "turf" as const : "dirt" as const,
      distanceMeters: Number(details[2]),
      declaredEntries,
      entries,
    };
  });

  return { observedAt, races };
}

export function decodeTargetEntriesText(bytes: Uint8Array) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("shift_jis", { fatal: true }).decode(bytes);
  }
}

function parseEntryLine(line: string): ParsedTargetEntry {
  const rowWidth = displayWidth(line);
  if (rowWidth > ENTRY_LINE_WIDTH) {
    throw new Error(
      `A TARGET entry row has display width ${rowWidth}; expected at most ${ENTRY_LINE_WIDTH}.`,
    );
  }
  const paddedLine = `${line}${" ".repeat(ENTRY_LINE_WIDTH - rowWidth)}`;

  const field = (name: keyof typeof ENTRY_COLUMNS) => {
    const [start, end] = ENTRY_COLUMNS[name];
    return sliceDisplayColumns(paddedLine, start, end).normalize("NFKC").trim();
  };
  const sexAndJockey = field("sexAndJockey").match(/^(牡|牝|セ|騙)(\d+)\s+(\*)?(\S+)$/);
  if (!sexAndJockey) {
    throw new Error("A TARGET entry row has an unsupported sex/age and jockey region.");
  }
  const weight = field("assignedWeight").match(/^(\d+(?:\.\d+)?)([▲△◇☆]?)$/);
  if (!weight) throw new Error("A TARGET entry row has an unsupported assigned-weight field.");
  const frameNumber = parseRequiredInteger(field("frame"), "frame number");
  const horseNumberField = field("horseNumber").match(/^(\d{1,2})([*$])?$/);
  if (!horseNumberField) {
    throw new Error(`Unsupported horse number field: ${field("horseNumber")}`);
  }
  const horseNumber = Number(horseNumberField[1]);
  const horseName = field("horseName").replace(/^[$*]/, "");
  const jockeyName = sexAndJockey[4];
  const interval = parseIntegerOrRawMarker(field("interval"));
  const zi = parseNumberAndRawMarker(field("zi"));
  if (!horseName || !jockeyName) throw new Error("A TARGET entry row is missing a name field.");

  return {
    frameNumber,
    horseNumber,
    rawHorseNumberMarker: horseNumberField[2] === "*" || horseNumberField[2] === "$"
      ? horseNumberField[2]
      : null,
    horseName: normalizeText(horseName),
    sex: mapSex(sexAndJockey[1]),
    age: Number(sexAndJockey[2]),
    rawSexAgeMarker: sexAndJockey[3] || null,
    jockeyName: normalizeText(jockeyName),
    assignedWeight: Number(weight[1]),
    weightAllowanceSymbol: weight[2] || null,
    trainerName: null,
    interval: interval.value,
    rawIntervalMarker: interval.rawMarker,
    zi: zi.value,
    rawZiMarker: zi.rawMarker,
    rawOdds: parseNullableNumber(field("odds")),
    oddsObservedAt: null,
    rawFields: {
      B: toNullableRaw(field("B")),
      直前: toNullableRaw(field("before")),
      芝短: toNullableRaw(field("turfShort")),
      芝中: toNullableRaw(field("turfMiddle")),
      ダ短: toNullableRaw(field("dirtShort")),
      ダ中: toNullableRaw(field("dirtMiddle")),
      脚: toNullableRaw(field("runningStyle")),
    },
    // The value itself is deliberately discarded so it cannot become an ML feature.
    ignoredPostRaceFields: isBlankField(field("result")) ? [] : ["結"],
  };
}

function assertSupportedEntryHeader(line: string) {
  const normalized = line.normalize("NFKC");
  if (displayWidth(line) !== ENTRY_LINE_WIDTH || !normalized.startsWith("B枠馬 馬名")) {
    throw new Error("The TARGET entry header does not match the supported fixed-width layout.");
  }
}

function sliceDisplayColumns(value: string, start: number, end: number) {
  let column = 0;
  let result = "";
  for (const character of value) {
    const next = column + characterDisplayWidth(character);
    if (column < end && next > start) result += character;
    column = next;
    if (column >= end) break;
  }
  return result;
}

function displayWidth(value: string) {
  return [...value].reduce((width, character) => width + characterDisplayWidth(character), 0);
}

function characterDisplayWidth(character: string) {
  const codePoint = character.codePointAt(0) ?? 0;
  if (codePoint <= 0x7f || (codePoint >= 0xff61 && codePoint <= 0xff9f)) return 1;
  if (codePoint >= 0x300 && codePoint <= 0x36f) return 0;
  return 2;
}

function collectEntryLines(lines: string[], start: number, end: number) {
  const result: string[] = [];
  for (let index = start; index < end; index += 1) {
    const line = lines[index];
    if (isSeparator(line)) {
      if (result.length > 0) break;
      continue;
    }
    if (!line.trim()) continue;
    result.push(line);
  }
  if (result.length === 0) throw new Error("No entry rows were found in a race block.");
  return result;
}

function parseObservedAt(value: string) {
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error("observedAt must be an externally supplied ISO 8601 datetime with timezone.");
  }
  return new Date(value).toISOString();
}

function parseIntegerOrRawMarker(value: string) {
  if (isBlankField(value)) return { value: null, rawMarker: null };
  if (/^\d+$/.test(value)) return { value: Number(value), rawMarker: null };
  return { value: null, rawMarker: value };
}

function parseNumberAndRawMarker(value: string) {
  if (isBlankField(value)) return { value: null, rawMarker: null };
  const number = value.match(/-?\d+(?:\.\d+)?/);
  if (!number) return { value: null, rawMarker: value };
  const rawMarker = value.replace(number[0], "").replace(/\s+/g, "").trim() || null;
  return { value: Number(number[0]), rawMarker };
}

function parseRequiredInteger(value: string, label: string) {
  if (!/^\d+$/.test(value)) throw new Error(`Expected a numeric ${label}, received: ${value}`);
  return Number(value);
}

function parseNullableNumber(value: string) {
  if (isBlankField(value)) return null;
  const match = value.match(/-?\d+(?:\.\d+)?/);
  if (!match) throw new Error(`Expected a numeric entry field, received: ${value}`);
  return Number(match[0]);
}

function toNullableRaw(value: string) {
  return isBlankField(value) ? null : value;
}

function isBlankField(value: string) {
  return !value.trim() || /^(?:-|--|---|----|なし|無)$/.test(value);
}

function mapSex(value: string) {
  const sex = ({ 牡: "male", 牝: "female", セ: "gelding", 騙: "gelding" } as const)[
    value as "牡" | "牝" | "セ" | "騙"
  ];
  if (!sex) throw new Error(`Unsupported sex value: ${value}`);
  return sex;
}

function toIsoDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error("TARGET race date is invalid.");
  }
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function normalizeText(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function isSeparator(line: string) {
  return /^\s*-{10,}\s*$/.test(line);
}

function findPreviousLine(
  lines: string[],
  start: number,
  predicate: (line: string) => boolean,
) {
  for (let index = start - 1; index >= 0; index -= 1) {
    if (predicate(lines[index])) return lines[index];
  }
  throw new Error("Race header line was not found.");
}

function findNextLine(
  lines: string[],
  start: number,
  end: number,
  predicate: (line: string) => boolean,
) {
  return lines[findNextIndex(lines, start, end, predicate)];
}

function findNextIndex(
  lines: string[],
  start: number,
  end: number,
  predicate: (line: string) => boolean,
) {
  for (let index = start; index < end; index += 1) {
    if (predicate(lines[index])) return index;
  }
  throw new Error("Required line was not found in the race block.");
}

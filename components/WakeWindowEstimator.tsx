"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Chart from "chart.js/auto";

const STORAGE_KEY = "wake-window-estimator:state";
const HISTORY_KEY = "wake-window-estimator:history";

type HistoricDay = {
  date: string;
  ageWeeks: number;
  wakeWindows: number[];
};

type HistoricStore = HistoricDay[];

type Nap = { start: string; end: string };

type State = {
  ageWeeks: number;
  wakeUpTime: string;
  bedTime: string;
  naps: Nap[];
};

type WakeWindowProfile = {
  weeks: number;
  min: number;
  max: number;
  firstWindow: number;
  lastWindow: number;
  recommendedNaps: number;
};

type ComputedWakeWindow = {
  label: string;
  from: number;
  to: number;
  duration: number;
  roundedDuration: number;
};

const DEFAULT_STATE: State = {
  ageWeeks: 12,
  wakeUpTime: "07:00",
  bedTime: "19:30",
  naps: [],
};

const WAKE_WINDOW_CURVE: WakeWindowProfile[] = [
  { weeks: 0, min: 35, max: 50, firstWindow: 35, lastWindow: 50, recommendedNaps: 5 },
  { weeks: 2, min: 40, max: 60, firstWindow: 40, lastWindow: 60, recommendedNaps: 5 },
  { weeks: 4, min: 45, max: 70, firstWindow: 45, lastWindow: 70, recommendedNaps: 5 },
  { weeks: 6, min: 50, max: 75, firstWindow: 50, lastWindow: 75, recommendedNaps: 4 },
  { weeks: 8, min: 55, max: 85, firstWindow: 55, lastWindow: 85, recommendedNaps: 4 },
  { weeks: 10, min: 60, max: 95, firstWindow: 60, lastWindow: 95, recommendedNaps: 4 },
  { weeks: 12, min: 65, max: 105, firstWindow: 70, lastWindow: 105, recommendedNaps: 4 },
  { weeks: 14, min: 75, max: 115, firstWindow: 75, lastWindow: 115, recommendedNaps: 4 },
  { weeks: 16, min: 85, max: 125, firstWindow: 85, lastWindow: 125, recommendedNaps: 3 },
  { weeks: 18, min: 95, max: 135, firstWindow: 95, lastWindow: 135, recommendedNaps: 3 },
  { weeks: 20, min: 100, max: 145, firstWindow: 100, lastWindow: 145, recommendedNaps: 3 },
  { weeks: 22, min: 105, max: 150, firstWindow: 105, lastWindow: 150, recommendedNaps: 3 },
  { weeks: 24, min: 110, max: 160, firstWindow: 110, lastWindow: 160, recommendedNaps: 3 },
  { weeks: 28, min: 120, max: 170, firstWindow: 120, lastWindow: 170, recommendedNaps: 3 },
  { weeks: 32, min: 130, max: 180, firstWindow: 130, lastWindow: 180, recommendedNaps: 2 },
  { weeks: 36, min: 135, max: 190, firstWindow: 135, lastWindow: 190, recommendedNaps: 2 },
  { weeks: 40, min: 140, max: 200, firstWindow: 140, lastWindow: 200, recommendedNaps: 2 },
  { weeks: 44, min: 145, max: 210, firstWindow: 145, lastWindow: 210, recommendedNaps: 2 },
  { weeks: 52, min: 150, max: 225, firstWindow: 150, lastWindow: 225, recommendedNaps: 2 },
  { weeks: 78, min: 180, max: 300, firstWindow: 180, lastWindow: 300, recommendedNaps: 1 },
  { weeks: 104, min: 240, max: 360, firstWindow: 240, lastWindow: 360, recommendedNaps: 1 },
];

function clampMin(value: number, min: number) {
  return value < min ? min : value;
}

function roundToNearest5(mins: number) {
  return Math.round(mins / 5) * 5;
}

function parseTime(input: string) {
  const [h, m] = input.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function formatTime(minutes: number) {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function friendlyDuration(mins: number | null | undefined) {
  if (mins == null || Number.isNaN(mins)) return "—";
  const rounded = roundToNearest5(mins);
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} hr`;
  return `${hours} hr ${minutes} min`;
}

function formatBand(band: [number, number] | null) {
  if (!band) return "—";
  return `${friendlyDuration(band[0])}–${friendlyDuration(band[1])}`;
}

function interpolate(start: number, end: number, ratio: number) {
  return Math.round(start + (end - start) * ratio);
}

function getWakeWindowProfile(ageWeeks: number): WakeWindowProfile {
  const age = Math.max(0, ageWeeks);

  const first = WAKE_WINDOW_CURVE[0];
  const last = WAKE_WINDOW_CURVE[WAKE_WINDOW_CURVE.length - 1];

  if (age <= first.weeks) return first;
  if (age >= last.weeks) return last;

  for (let i = 0; i < WAKE_WINDOW_CURVE.length - 1; i += 1) {
    const current = WAKE_WINDOW_CURVE[i];
    const next = WAKE_WINDOW_CURVE[i + 1];

    if (age >= current.weeks && age <= next.weeks) {
      const span = next.weeks - current.weeks;
      const ratio = span === 0 ? 0 : (age - current.weeks) / span;

      return {
        weeks: age,
        min: interpolate(current.min, next.min, ratio),
        max: interpolate(current.max, next.max, ratio),
        firstWindow: interpolate(current.firstWindow, next.firstWindow, ratio),
        lastWindow: interpolate(current.lastWindow, next.lastWindow, ratio),
        recommendedNaps: ratio < 0.5 ? current.recommendedNaps : next.recommendedNaps,
      };
    }
  }

  return last;
}

function getRecommendedWakeWindow(ageWeeks: number): [number, number] {
  const profile = getWakeWindowProfile(ageWeeks);
  return [profile.min, profile.max];
}

function getRecommendedNapCount(ageWeeks: number) {
  return getWakeWindowProfile(ageWeeks).recommendedNaps;
}

function getAgeAdjustedBandForWindowIndex(
  ageWeeks: number,
  windowIndex: number,
  totalWindows: number
): [number, number] {
  const profile = getWakeWindowProfile(ageWeeks);

  if (totalWindows <= 1) {
    return [roundToNearest5(profile.firstWindow), roundToNearest5(profile.lastWindow)];
  }

  const ratio = totalWindows === 1 ? 0 : windowIndex / (totalWindows - 1);
  const target = interpolate(profile.firstWindow, profile.lastWindow, ratio);

  const genericBand = getRecommendedWakeWindow(ageWeeks);
  const halfWidth = Math.max(15, roundToNearest5((genericBand[1] - genericBand[0]) / 2));

  const min = Math.max(profile.min, target - halfWidth);
  const max = Math.min(profile.max, target + halfWidth);

  return [roundToNearest5(min), roundToNearest5(max)];
}

function percentile(values: number[], p: number) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) return sorted[lower];

  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function getRecentRelevantDays(history: HistoricStore, ageWeeks: number, maxDays = 10) {
  return history
    .filter((day) => Math.abs(day.ageWeeks - ageWeeks) <= 2)
    .slice(-maxDays);
}

function getPersonalizedBandForWindowIndex(
  history: HistoricStore,
  ageWeeks: number,
  windowIndex: number
): [number, number] | null {
  const days = getRecentRelevantDays(history, ageWeeks, 10);

  const values = days
    .map((day) => day.wakeWindows[windowIndex])
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
    .map(roundToNearest5);

  if (values.length < 4) return null;

  const low = percentile(values, 0.2);
  const high = percentile(values, 0.8);

  if (low == null || high == null) return null;

  return [roundToNearest5(low), roundToNearest5(high)];
}

function getPersonalizedHistoryCountForWindowIndex(
  history: HistoricStore,
  ageWeeks: number,
  windowIndex: number
) {
  return getRecentRelevantDays(history, ageWeeks, 10)
    .map((day) => day.wakeWindows[windowIndex])
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v)).length;
}

function blendBands(
  ageBand: [number, number],
  personalBand: [number, number] | null,
  historyCount: number
): [number, number] {
  if (!personalBand) return ageBand;

  const weight = Math.min(historyCount / 10, 1);

  const min = roundToNearest5(ageBand[0] * (1 - weight) + personalBand[0] * weight);
  const max = roundToNearest5(ageBand[1] * (1 - weight) + personalBand[1] * weight);

  return [min, max];
}

function computeWakeWindows(state: State): ComputedWakeWindow[] {
  const wake = parseTime(state.wakeUpTime);
  const bed = parseTime(state.bedTime);
  if (wake == null || bed == null) return [];

  const sorted = state.naps
    .map((nap) => ({
      start: parseTime(nap.start),
      end: parseTime(nap.end),
    }))
    .filter((nap) => nap.start != null && nap.end != null)
    .sort((a, b) => (a.start ?? 0) - (b.start ?? 0));

  const windows: ComputedWakeWindow[] = [];
  let lastWake = wake;

  for (const nap of sorted) {
    if (nap.start == null || nap.end == null) continue;
    if (nap.start <= lastWake) continue;
    if (nap.end <= nap.start) continue;

    const duration = nap.start - lastWake;

    windows.push({
      label: `Window ${windows.length + 1}`,
      from: lastWake,
      to: nap.start,
      duration,
      roundedDuration: roundToNearest5(duration),
    });

    lastWake = nap.end;
  }

  if (bed > lastWake) {
    const duration = bed - lastWake;

    windows.push({
      label: `Window ${windows.length + 1}`,
      from: lastWake,
      to: bed,
      duration,
      roundedDuration: roundToNearest5(duration),
    });
  }

  return windows;
}

function buildProjectionData(ageWeeks: number, weeksToProject = 8) {
  const baseWeek = Math.round(ageWeeks);
  const labels: string[] = [];
  const minValues: number[] = [];
  const maxValues: number[] = [];
  const avgValues: number[] = [];

  for (let w = 0; w <= weeksToProject; w += 1) {
    const week = baseWeek + w;
    const profile = getWakeWindowProfile(week);
    labels.push(`Week ${week}`);
    minValues.push(roundToNearest5(profile.min));
    maxValues.push(roundToNearest5(profile.max));
    avgValues.push(roundToNearest5((profile.min + profile.max) / 2));
  }

  return { labels, minValues, maxValues, avgValues };
}

function loadStateFromStorage(): State {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_STATE;
    const parsed = JSON.parse(stored) as Partial<State>;
    return { ...DEFAULT_STATE, ...parsed };
  } catch (e) {
    console.warn("Failed to load saved state", e);
    return DEFAULT_STATE;
  }
}

function saveStateToStorage(state: State) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function loadHistoryFromStorage(): HistoricStore {
  try {
    const stored = localStorage.getItem(HISTORY_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? (parsed as HistoricStore) : [];
  } catch (e) {
    console.warn("Failed to load wake window history", e);
    return [];
  }
}

function saveHistoryToStorage(history: HistoricStore) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // ignore
  }
}

function buildHistoryEntry(state: State): HistoricDay | null {
  const wakeWindows = computeWakeWindows(state)
    .map((window) => roundToNearest5(window.duration))
    .filter((duration) => duration > 0);

  if (wakeWindows.length === 0) return null;

  return {
    date: new Date().toISOString().slice(0, 10),
    ageWeeks: state.ageWeeks,
    wakeWindows,
  };
}

export default function WakeWindowEstimator() {
  const [state, setState] = useState<State>(DEFAULT_STATE);
  const [history, setHistory] = useState<HistoricStore>([]);
  const [isHydrated, setIsHydrated] = useState(false);

  const [historyDraftDate, setHistoryDraftDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [historyDraftAgeWeeks, setHistoryDraftAgeWeeks] = useState(state.ageWeeks);
  const [historyDraftWakeWindows, setHistoryDraftWakeWindows] = useState("95, 110, 125, 130");

  const wakeChartRef = useRef<HTMLCanvasElement | null>(null);
  const projectionChartRef = useRef<HTMLCanvasElement | null>(null);

  const recNapCount = useMemo(() => getRecommendedNapCount(state.ageWeeks), [state.ageWeeks]);
  const windows = useMemo(() => computeWakeWindows(state), [state]);
  const projection = useMemo(() => buildProjectionData(state.ageWeeks), [state.ageWeeks]);

  const windowRecommendations = useMemo(() => {
    const totalWindows = Math.max(windows.length, recNapCount + 1);

    return Array.from({ length: totalWindows }, (_, index) => {
      const ageBand = getAgeAdjustedBandForWindowIndex(state.ageWeeks, index, totalWindows);
      const personalBand = getPersonalizedBandForWindowIndex(history, state.ageWeeks, index);
      const historyCount = getPersonalizedHistoryCountForWindowIndex(history, state.ageWeeks, index);
      const suggestedBand = blendBands(ageBand, personalBand, historyCount);
      const actual = windows[index]?.roundedDuration ?? null;

      return {
        label: `Window ${index + 1}`,
        ageBand,
        personalBand,
        suggestedBand,
        historyCount,
        actual,
      };
    });
  }, [history, recNapCount, state.ageWeeks, windows]);

  const relevantHistoryDays = useMemo(
    () => getRecentRelevantDays(history, state.ageWeeks, 10),
    [history, state.ageWeeks]
  );

  const totalDaytimeNapMinutes = useMemo(() => {
    return state.naps
      .map((nap) => {
        const start = parseTime(nap.start);
        const end = parseTime(nap.end);

        if (start == null || end == null) return 0;
        if (end <= start) return 0;

        return end - start;
      })
      .reduce((sum, duration) => sum + duration, 0);
  }, [state.naps]);

  useEffect(() => {
    setState(loadStateFromStorage());
    setHistory(loadHistoryFromStorage());
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    setHistoryDraftAgeWeeks(state.ageWeeks);
  }, [state.ageWeeks]);

  useEffect(() => {
    if (!isHydrated) return;
    saveStateToStorage(state);
  }, [state, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    saveHistoryToStorage(history);
  }, [history, isHydrated]);

  useEffect(() => {
    if (!wakeChartRef.current) return;

    const ctx = wakeChartRef.current.getContext("2d");
    if (!ctx) return;

    const chart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: windows.map((w) => w.label),
        datasets: [
          {
            label: "Wake window (minutes)",
            data: windows.map((w) => w.roundedDuration),
            backgroundColor: windows.map((_, idx) =>
              idx % 2 === 0 ? "rgba(3,79,132,0.8)" : "rgba(0,150,136,0.8)"
            ),
            borderRadius: 12,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => {
                const mins = context.parsed.y as number;
                const w = windows[context.dataIndex ?? 0];
                return `${friendlyDuration(mins)} (from ${formatTime(w.from)} to ${formatTime(w.to)})`;
              },
            },
          },
        },
        scales: {
          y: {
            title: { display: true, text: "Duration (minutes)" },
            beginAtZero: true,
          },
        },
      },
    });

    return () => chart.destroy();
  }, [windows]);

  useEffect(() => {
    if (!projectionChartRef.current) return;

    const ctx = projectionChartRef.current.getContext("2d");
    if (!ctx) return;

    const chart = new Chart(ctx, {
      type: "line",
      data: {
        labels: projection.labels,
        datasets: [
          {
            label: "Projected wake window (avg minutes)",
            data: projection.avgValues,
            borderColor: "rgba(3,79,132,0.9)",
            backgroundColor: "rgba(3,79,132,0.15)",
            tension: 0.25,
            pointRadius: 4,
            pointBackgroundColor: "rgba(3,79,132,1)",
          },
          {
            label: "Upper range",
            data: projection.maxValues,
            borderColor: "rgba(0,150,136,0.65)",
            backgroundColor: "rgba(0,150,136,0.18)",
            tension: 0.25,
            pointRadius: 0,
            fill: "+1",
          },
          {
            label: "Lower range",
            data: projection.minValues,
            borderColor: "rgba(0,150,136,0.65)",
            backgroundColor: "rgba(0,150,136,0.18)",
            tension: 0.25,
            pointRadius: 0,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const datasetLabel = ctx.dataset.label ?? "";
                const value = ctx.parsed.y as number;
                return `${datasetLabel}: ${friendlyDuration(value)}`;
              },
            },
          },
        },
        scales: {
          y: {
            title: { display: true, text: "Wake window length (minutes)" },
            beginAtZero: true,
          },
        },
      },
    });

    return () => chart.destroy();
  }, [projection]);

  function updateState(changes: Partial<State>) {
    setState((prev) => ({ ...prev, ...changes }));
  }

  function handleNapChange(index: number, field: keyof Nap, value: string) {
    setState((prev) => {
      const next = [...prev.naps];
      next[index] = { ...next[index], [field]: value };
      return { ...prev, naps: next };
    });
  }

  function handleAddNap() {
    setState((prev) => ({
      ...prev,
      naps: [...prev.naps, { start: "10:30", end: "12:00" }],
    }));
  }

  function handleRemoveNap(index: number) {
    setState((prev) => ({
      ...prev,
      naps: prev.naps.filter((_, i) => i !== index),
    }));
  }

  function handleSaveTodayToHistory() {
    const entry = buildHistoryEntry(state);
    if (!entry) return;

    setHistory((prev) => {
      const withoutSameDate = prev.filter((day) => day.date !== entry.date);
      return [...withoutSameDate, entry].slice(-30);
    });
  }

  function parseWakeWindowsInput(input: string) {
    return input
      .split(",")
      .map((part) => Number(part.trim()))
      .filter((value) => Number.isFinite(value) && value > 0)
      .map(roundToNearest5);
  }

  function handleAddHistoryEntry() {
    const wakeWindows = parseWakeWindowsInput(historyDraftWakeWindows);

    if (!historyDraftDate || wakeWindows.length === 0) return;

    const entry: HistoricDay = {
      date: historyDraftDate,
      ageWeeks: clampMin(historyDraftAgeWeeks, 0),
      wakeWindows,
    };

    setHistory((prev) => {
      const withoutSameDate = prev.filter((day) => day.date !== entry.date);
      return [...withoutSameDate, entry]
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-60);
    });
  }

  function handleDeleteHistoryEntry(date: string) {
    setHistory((prev) => prev.filter((day) => day.date !== date));
  }

  return (
    <>
      <section className="card">
        <h2>Baby info</h2>
        <div className="field-row">
          <label htmlFor="ageWeeks">Age (weeks)</label>
          <input
            id="ageWeeks"
            type="number"
            min={0}
            step={1}
            value={state.ageWeeks}
            onChange={(event) => {
              const weeks = clampMin(Number(event.target.value), 0);
              updateState({ ageWeeks: weeks });
            }}
          />
          <small className="hint">
            Recommended naps: {recNapCount} (you currently have {state.naps.length})
          </small>
        </div>
      </section>

      <section className="card">
        <h2>Daily schedule</h2>
        <div className="field-row">
          <label htmlFor="wakeUpTime">Wake up</label>
          <input
            id="wakeUpTime"
            type="time"
            value={state.wakeUpTime}
            onChange={(event) => updateState({ wakeUpTime: event.target.value })}
          />
        </div>
        <div className="field-row">
          <label htmlFor="bedTime">Bedtime</label>
          <input
            id="bedTime"
            type="time"
            value={state.bedTime}
            onChange={(event) => updateState({ bedTime: event.target.value })}
          />
        </div>
      </section>

      <section className="card">
        <h2>Naps</h2>
        <p className="hint">Add or edit naps. The number above is the age-based suggestion.</p>
        <p className="hint">
          Total daytime nap sleep: {friendlyDuration(totalDaytimeNapMinutes)}
        </p>
        <div>
          {state.naps.map((nap, index) => (
            <div key={index} className="nap-row">
              <input
                type="time"
                value={nap.start}
                onChange={(event) => handleNapChange(index, "start", event.target.value)}
              />
              <input
                type="time"
                value={nap.end}
                onChange={(event) => handleNapChange(index, "end", event.target.value)}
              />
              <button type="button" className="secondary" onClick={() => handleRemoveNap(index)}>
                Remove
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="primary" onClick={handleAddNap}>
          Add nap
        </button>
      </section>

      <section className="card">
        <h2>Actual wake windows (today)</h2>
        <div style={{ height: 240 }}>
          <canvas ref={wakeChartRef} />
        </div>
        <div className="summary">
          {windows.length === 0 ? (
            <div>Add naps and set wake/bedtimes to see wake windows.</div>
          ) : (
            <>
              <div>
                Total awake:{" "}
                {friendlyDuration(windows.reduce((sum, w) => sum + w.roundedDuration, 0))} ({windows.length} windows)
              </div>
              <div>
                Average wake window:{" "}
                {friendlyDuration(
                  Math.round(windows.reduce((sum, w) => sum + w.roundedDuration, 0) / windows.length)
                )}
              </div>
            </>
          )}
        </div>

        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            className="primary"
            onClick={handleSaveTodayToHistory}
            disabled={windows.length === 0}
          >
            Save today to history
          </button>
          <p className="hint" style={{ marginTop: 8 }}>
            Using {relevantHistoryDays.length} recent saved day{relevantHistoryDays.length === 1 ? "" : "s"} within
            about 2 weeks of this age.
          </p>
        </div>
      </section>

      <section className="card">
        <h2>History</h2>

        <div className="field-row">
          <label htmlFor="historyDate">Date</label>
          <input
            id="historyDate"
            type="date"
            value={historyDraftDate}
            onChange={(event) => setHistoryDraftDate(event.target.value)}
          />
        </div>

        <div className="field-row">
          <label htmlFor="historyAgeWeeks">Age (weeks)</label>
          <input
            id="historyAgeWeeks"
            type="number"
            min={0}
            step={1}
            value={historyDraftAgeWeeks}
            onChange={(event) => setHistoryDraftAgeWeeks(clampMin(Number(event.target.value), 0))}
          />
        </div>

        <div className="field-row">
          <label htmlFor="historyWakeWindows">Wake windows</label>
          <input
            id="historyWakeWindows"
            type="text"
            value={historyDraftWakeWindows}
            onChange={(event) => setHistoryDraftWakeWindows(event.target.value)}
            placeholder="95, 110, 125, 130"
          />
          <small className="hint">Enter minutes separated by commas. They’ll round to the nearest 5.</small>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button type="button" className="primary" onClick={handleAddHistoryEntry}>
            Add to history
          </button>
        </div>

        <div className="summary" style={{ marginTop: 16 }}>
          {history.length === 0 ? (
            <div>No history saved yet.</div>
          ) : (
            [...history]
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((day) => (
                <div key={day.date} style={{ marginBottom: 12 }}>
                  <strong>{day.date}</strong>
                  <div>Age: {day.ageWeeks} weeks</div>
                  <div>
                    Wake windows: {day.wakeWindows.map((mins) => friendlyDuration(mins)).join(", ")}
                  </div>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => handleDeleteHistoryEntry(day.date)}
                    style={{ marginTop: 6 }}
                  >
                    Delete
                  </button>
                </div>
              ))
          )}
        </div>
      </section>

      <section className="card">
        <h2>Suggested wake windows by window number</h2>
        <p className="hint">
          Suggestions blend age-based guidance with this baby’s recent pattern for the same window number.
        </p>

        <div className="summary">
          {windowRecommendations.map((item) => (
            <div key={item.label} style={{ marginBottom: 12 }}>
              <strong>{item.label}</strong>
              <div>Age-based: {formatBand(item.ageBand)}</div>
              <div>
                Recent actual pattern: {formatBand(item.personalBand)}{" "}
                {item.personalBand ? `(from ${item.historyCount} data point${item.historyCount === 1 ? "" : "s"})` : "(not enough history yet)"}
              </div>
              <div>Suggested today: {formatBand(item.suggestedBand)}</div>
              {item.actual != null && <div>Actual today: {friendlyDuration(item.actual)}</div>}
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Projected wake window (week-by-week)</h2>
        <div style={{ height: 260 }}>
          <canvas ref={projectionChartRef} />
        </div>
        <p className="hint">Based on age-related wake window guidelines.</p>
      </section>
    </>
  );
}
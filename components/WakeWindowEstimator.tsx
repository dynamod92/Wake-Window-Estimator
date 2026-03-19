"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Chart from "chart.js/auto";

const STORAGE_KEY = "wake-window-estimator:state";

type Nap = { start: string; end: string };

type State = {
  ageWeeks: number;
  wakeUpTime: string;
  bedTime: string;
  naps: Nap[];
};

const DEFAULT_STATE: State = {
  ageWeeks: 12,
  wakeUpTime: "07:00",
  bedTime: "19:30",
  naps: [],
};

function clampMin(value: number, min: number) {
  return value < min ? min : value;
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
  const hours = Math.floor(mins / 60);
  const minutes = mins % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} hr`;
  return `${hours} hr ${minutes} min`;
}

function getRecommendedNapCount(ageWeeks: number) {
  if (ageWeeks < 8) return 4;
  if (ageWeeks < 16) return 3;
  if (ageWeeks < 56) return 2;
  return 1;
}

function getRecommendedWakeWindow(ageWeeks: number): [number, number] {
  if (ageWeeks < 4) return [30, 60];
  if (ageWeeks < 12) return [45, 90];
  if (ageWeeks < 24) return [60, 120];
  if (ageWeeks < 52) return [90, 150];
  if (ageWeeks < 104) return [120, 180];
  return [150, 210];
}

function computeWakeWindows(state: State) {
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

  const windows: Array<{ label: string; from: number; to: number; duration: number }> = [];
  let lastWake = wake;

  for (const nap of sorted) {
    if (nap.start == null || nap.end == null) continue;
    if (nap.start <= lastWake) continue;

    windows.push({
      label: `Window ${windows.length + 1}`,
      from: lastWake,
      to: nap.start,
      duration: nap.start - lastWake,
    });

    lastWake = nap.end;
  }

  if (bed > lastWake) {
    windows.push({
      label: `Window ${windows.length + 1}`,
      from: lastWake,
      to: bed,
      duration: bed - lastWake,
    });
  }

  return windows;
}

function buildProjectionData(ageWeeks: number, weeksToProject = 8) {
  const baseWeek = Math.round(ageWeeks);
  const labels: string[] = [];
  const values: number[] = [];

  for (let w = 0; w <= weeksToProject; w += 1) {
    const week = baseWeek + w;
    const [min, max] = getRecommendedWakeWindow(week);
    const avg = Math.round((min + max) / 2);
    labels.push(`Week ${week}`);
    values.push(avg);
  }

  return { labels, values };
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

export default function WakeWindowEstimator() {
  const [state, setState] = useState<State>(DEFAULT_STATE);
  const wakeChartRef = useRef<HTMLCanvasElement | null>(null);
  const projectionChartRef = useRef<HTMLCanvasElement | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  const recNapCount = useMemo(() => getRecommendedNapCount(state.ageWeeks), [state.ageWeeks]);
  const windows = useMemo(() => computeWakeWindows(state), [state]);
  const projection = useMemo(() => buildProjectionData(state.ageWeeks), [state.ageWeeks]);

  useEffect(() => {
    setState(loadStateFromStorage());
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    saveStateToStorage(state);
  }, [state, isHydrated]);

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
            data: windows.map((w) => w.duration),
            backgroundColor: windows.map((_, idx) => (idx % 2 === 0 ? "rgba(3,79,132,0.8)" : "rgba(0,150,136,0.8)")),
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
            data: projection.values,
            borderColor: "rgba(3,79,132,0.85)",
            backgroundColor: "rgba(3,79,132,0.2)",
            tension: 0.25,
            pointRadius: 4,
            pointBackgroundColor: "rgba(3,79,132,1)",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx) => `${friendlyDuration(ctx.parsed.y as number)} avg`,
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
                Total awake: {friendlyDuration(windows.reduce((sum, w) => sum + w.duration, 0))} ({windows.length} windows)
              </div>
              <div>
                Average wake window:{" "}
                {friendlyDuration(Math.round(windows.reduce((sum, w) => sum + w.duration, 0) / windows.length))}
              </div>
            </>
          )}
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

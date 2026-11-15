import { useEffect, useState } from 'react';
import type { BenchmarkResult, StressTest } from '../debug/stress-test';
import { formatBenchmark } from '../debug/stress-test';
import { STRESS_PARTS } from '../render/stress/stress-scene';
import { t, tKey } from './i18n';
import { isCompactNow } from './use-media';

/**
 * The render stress test's on-screen counter (F139, `?debug=stress`): live
 * numbers against the performance budgets, buttons for the fixed views, and
 * the benchmark with its results to copy. Shown only in the stress test.
 */
const REFRESH_MS = 500;

const millions = (value: number) => (value / 1e6).toFixed(2);
const whole = (value: number) => Math.round(value).toLocaleString('en');

export function StressOverlay({ test }: { readonly test: StressTest | null }) {
  const [, setTick] = useState(0);
  // On a phone it starts folded (only the frame rate), so the map stays visible.
  const [folded, setFolded] = useState(isCompactNow);
  const [running, setRunning] = useState<number | null>(null);
  const [results, setResults] = useState<readonly BenchmarkResult[] | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  if (!test) {
    return (
      <section className="panel stress-overlay" data-testid="stress-overlay">
        <h2 className="panel-title">{t('STRESS_TITLE')}</h2>
        <p className="stress-note">{t('STRESS_LOADING')}</p>
      </section>
    );
  }

  const live = test.live();
  const scene = test.scene();
  const sim = test.sim();
  const { budget } = test;
  const fpsClass =
    live.fps >= budget.strategicFps ? 'good' : live.fps >= budget.closeFps ? 'fair' : 'poor';
  const report = results ? formatBenchmark(results, test.renderer, (key) => tKey(key), sim) : '';

  const runBenchmark = () => {
    setRunning(0);
    setCopied(false);
    void test
      .runBenchmark((view) => setRunning(view))
      .then((found) => {
        setResults(found);
        setRunning(null);
      });
  };

  return (
    <section
      className={`panel stress-overlay${folded ? ' folded' : ''}`}
      data-testid="stress-overlay"
    >
      <h2 className="panel-title stress-title">
        <span>{t('STRESS_TITLE')}</span>
        <button
          type="button"
          className="stress-fold"
          aria-label={t(folded ? 'STRESS_UNFOLD' : 'STRESS_FOLD')}
          title={t(folded ? 'STRESS_UNFOLD' : 'STRESS_FOLD')}
          onClick={() => setFolded(!folded)}
        >
          {folded ? '▸' : '▾'}
        </button>
      </h2>
      <div className="stress-big" data-testid="stress-fps">
        <span className={`stress-fps ${fpsClass}`}>
          {t('STRESS_FPS', { fps: live.fps.toFixed(0) })}
        </span>
        <span>
          {t('STRESS_FRAME', { ms: live.frameMs.toFixed(1), worst: live.worstFrameMs.toFixed(0) })}
        </span>
      </div>
      {!folded && (
        <>
          <dl className="stress-numbers">
            <dt>{t('STRESS_CPU')}</dt>
            <dd>{t('STRESS_MS', { ms: live.cpuMs.toFixed(1) })}</dd>
            <dt>{t('STRESS_LOAD_WORK')}</dt>
            <dd>{t('STRESS_MS', { ms: scene.updateMs.toFixed(1) })}</dd>
            <dt>{t('STRESS_DRAW_CALLS')}</dt>
            <dd data-testid="stress-draw-calls">{whole(live.drawCalls)}</dd>
            <dt>{t('STRESS_TRIANGLES')}</dt>
            <dd>{t('STRESS_MILLIONS', { value: millions(live.triangles) })}</dd>
            <dt>{t('STRESS_MEMORY')}</dt>
            <dd>
              {live.heapMb === null
                ? t('STRESS_MEMORY_UNKNOWN')
                : t('STRESS_MB', { mb: whole(live.heapMb) })}
            </dd>
            <dt>{t('STRESS_RENDERER')}</dt>
            <dd>{test.renderer === 'webgpu' ? 'WebGPU' : 'WebGL 2'}</dd>
            <dt>{t('STRESS_SIM')}</dt>
            <dd>
              {t('STRESS_SIM_VALUE', {
                days: sim.daysPerSecond.toFixed(1),
                ms: sim.averageMs.toFixed(1),
                worst: sim.worstMs.toFixed(0),
              })}
            </dd>
          </dl>
          <p className="stress-note" data-testid="stress-load">
            {t('STRESS_LOAD', {
              buildings: whole(scene.buildings),
              units: whole(scene.units),
              bugs: whole(scene.bugs),
              lines: whole(scene.lines),
              particles: whole(scene.particles),
              clouds: whole(scene.clouds),
            })}
          </p>
          <p className="stress-note">
            {t('STRESS_BUDGETS', { strategic: budget.strategicFps, close: budget.closeFps })}
          </p>
          <div className="button-row stress-views">
            {test.views.map((view, index) => (
              <button
                key={view.name}
                type="button"
                className="button"
                disabled={running !== null}
                onClick={() => test.goTo(index)}
              >
                {tKey(view.name)}
              </button>
            ))}
          </div>
          <div className="button-row">
            <button
              type="button"
              className="button"
              data-testid="stress-run"
              disabled={running !== null}
              onClick={runBenchmark}
            >
              {running === null
                ? t('STRESS_RUN')
                : t('STRESS_RUNNING', { view: tKey(test.views[running].name) })}
            </button>
          </div>
          <div className="button-row stress-parts">
            {STRESS_PARTS.map((part) => {
              const on = test.parts()[part];
              return (
                <button
                  key={part}
                  type="button"
                  className={`button${on ? '' : ' off'}`}
                  aria-pressed={on}
                  title={t('STRESS_PART_HINT')}
                  onClick={() => test.setParts({ [part]: !on })}
                >
                  {tKey(`STRESS_PART_${part.toUpperCase()}`)}
                </button>
              );
            })}
          </div>
          {results && (
            <div className="stress-results" data-testid="stress-results">
              <table>
                <thead>
                  <tr>
                    <th>{t('STRESS_RESULT_VIEW')}</th>
                    <th>{t('STRESS_RESULT_FPS')}</th>
                    <th>{t('STRESS_RESULT_SLOWEST')}</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((result) => (
                    <tr key={result.view}>
                      <td>{tKey(result.view)}</td>
                      <td className={result.fps >= result.targetFps ? 'good' : 'poor'}>
                        {t('STRESS_RESULT_FPS_VALUE', {
                          fps: result.fps.toFixed(0),
                          target: result.targetFps,
                        })}
                      </td>
                      <td>{t('STRESS_MS', { ms: result.p99FrameMs.toFixed(0) })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                type="button"
                className="button"
                data-testid="stress-copy"
                onClick={() => {
                  void navigator.clipboard?.writeText(report).then(
                    () => setCopied(true),
                    () => setCopied(false),
                  );
                }}
              >
                {t(copied ? 'STRESS_COPIED' : 'STRESS_COPY')}
              </button>
              <textarea readOnly className="stress-report" value={report} rows={4} />
            </div>
          )}
        </>
      )}
    </section>
  );
}

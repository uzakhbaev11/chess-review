import { useEffect, useState } from 'react';
import { AI_FEATURE_ENABLED, AI_MODELS, BOARD_THEMES, updateSettings, useSettings, type BoardTheme } from '../lib/settings.ts';
import { DEPTHS } from './Home.tsx';
import { playSound } from '../lib/sound.ts';
import { checkWebGpu, getLocalEngine, LOCAL_MODELS, onLoadStatus, type LoadStatus } from '../lib/localAi.ts';

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const s = useSettings();
  const [showKey, setShowKey] = useState(false);
  const [gpuError, setGpuError] = useState<string | null>(null);
  const [preload, setPreload] = useState<LoadStatus>(null);
  const [preloadDone, setPreloadDone] = useState(false);
  const [preloadError, setPreloadError] = useState<string | null>(null);

  useEffect(() => onLoadStatus(setPreload), []);
  useEffect(() => {
    if (AI_FEATURE_ENABLED && s.aiProvider === 'local') void checkWebGpu().then(setGpuError);
    setPreloadDone(false);
  }, [s.aiProvider, s.localModel]);

  const startPreload = async () => {
    setPreloadError(null);
    try {
      await getLocalEngine(s.localModel);
      setPreloadDone(true);
    } catch (e) {
      setPreloadError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label="Настройки" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>⚙ Настройки</h2>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </div>

        {AI_FEATURE_ENABLED && (
          <>
        <section className="settings-section">
          <h3>✨ ИИ-тренер</h3>
          <label className="toggle">
            <input type="checkbox" checked={s.aiEnabled} onChange={(e) => updateSettings({ aiEnabled: e.target.checked })} />
            Включить ИИ-тренера
          </label>
          <div className="provider-row">
            <button
              className={`provider ${s.aiProvider === 'local' ? 'active' : ''}`}
              onClick={() => updateSettings({ aiProvider: 'local' })}
            >
              <b>💻 В браузере</b>
              <small>Бесплатно, без ключа. Модель скачивается один раз.</small>
            </button>
            <button
              className={`provider ${s.aiProvider === 'claude' ? 'active' : ''}`}
              onClick={() => updateSettings({ aiProvider: 'claude' })}
            >
              <b>☁️ Claude</b>
              <small>Умнее, нужен свой API-ключ Anthropic.</small>
            </button>
          </div>

          {s.aiProvider === 'local' ? (
            <>
              <label className="field">
                Модель
                <select value={s.localModel} onChange={(e) => updateSettings({ localModel: e.target.value })}>
                  {LOCAL_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="hint">
                Модель работает прямо в браузере на видеокарте (WebGPU): нужен Chrome или Edge на компьютере. При первом использовании она
                скачивается и сохраняется в кэше браузера, потом открывается за секунды. Небольшие модели слабее Claude и иногда ошибаются в
                шахматных деталях.
              </p>
              {gpuError && <div className="error">{gpuError}</div>}
              {preload ? (
                <div className="ai-loading">
                  <div>{preload.text}</div>
                  <div className="progress">
                    <div className="progress-fill" style={{ width: `${Math.round(preload.progress * 100)}%` }} />
                  </div>
                </div>
              ) : (
                <button className="btn btn-small" onClick={startPreload} disabled={!!gpuError}>
                  {preloadDone ? '✓ Модель загружена' : '⬇ Скачать модель сейчас'}
                </button>
              )}
              {preloadError && <div className="error">{preloadError}</div>}
            </>
          ) : (
            <>
              <label className="field">
                API-ключ Anthropic
                <div className="key-row">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={s.apiKey}
                    onChange={(e) => updateSettings({ apiKey: e.target.value.trim() })}
                    placeholder="sk-ant-…"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button className="btn btn-small" onClick={() => setShowKey((v) => !v)}>
                    {showKey ? 'Скрыть' : 'Показать'}
                  </button>
                </div>
              </label>
              <p className="hint">
                Ключ хранится только в этом браузере и отправляется напрямую в api.anthropic.com. Получить ключ:{' '}
                <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
                  console.anthropic.com
                </a>
                . Запросы оплачиваются с вашего аккаунта Anthropic. Не вводите ключ на чужом компьютере.
              </p>
              <label className="field">
                Модель
                <select value={s.model} onChange={(e) => updateSettings({ model: e.target.value })}>
                  {AI_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
        </section>

          </>
        )}

        <section className="settings-section">
          <h3>♟ Анализ</h3>
          <label className="field">
            Глубина Stockfish
            <select value={s.depth} onChange={(e) => updateSettings({ depth: Number(e.target.value) })}>
              {DEPTHS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Мои ники (через запятую) — для статистики и разворота доски
            <input value={s.myNames} onChange={(e) => updateSettings({ myNames: e.target.value })} placeholder="ник1, ник2" />
          </label>
        </section>

        <section className="settings-section">
          <h3>🎨 Доска и звук</h3>
          <div className="theme-row">
            {(Object.keys(BOARD_THEMES) as BoardTheme[]).map((t) => (
              <button
                key={t}
                className={`theme-swatch ${s.boardTheme === t ? 'active' : ''}`}
                onClick={() => updateSettings({ boardTheme: t })}
                title={BOARD_THEMES[t].label}
              >
                <span style={{ background: BOARD_THEMES[t].light }} />
                <span style={{ background: BOARD_THEMES[t].dark }} />
                <span style={{ background: BOARD_THEMES[t].dark }} />
                <span style={{ background: BOARD_THEMES[t].light }} />
                <small>{BOARD_THEMES[t].label}</small>
              </button>
            ))}
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={s.sound}
              onChange={(e) => {
                updateSettings({ sound: e.target.checked });
                if (e.target.checked) playSound('move');
              }}
            />
            Звуки ходов
          </label>
        </section>

        <button className="btn btn-primary btn-wide" onClick={onClose}>
          Готово
        </button>
      </div>
    </div>
  );
}

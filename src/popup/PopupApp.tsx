import { useEffect, useState, type ChangeEvent } from 'react'
import { extension } from '../shared/extension.ts'
import {
  DEFAULT_PROCESSING_PREFERENCES,
  type ProcessingPreferences,
} from '../shared/settings.ts'
import type { ProcessingStatus } from '../shared/protocol.ts'
import {
  loadPopupSnapshot,
  saveProcessedMix,
  setProcessingEnabled,
} from './popup-controller.ts'
import { toPopupViewModel } from './popup-view-model.ts'
import './popup.css'

export function PopupApp() {
  const [tabId, setTabId] = useState<number | undefined>()
  const [status, setStatus] = useState<ProcessingStatus | null>(null)
  const [preferences, setPreferences] = useState<ProcessingPreferences>({
    ...DEFAULT_PROCESSING_PREFERENCES,
  })
  const [busy, setBusy] = useState(false)
  const [preferenceError, setPreferenceError] = useState(false)

  useEffect(() => {
    let active = true
    void loadPopupSnapshot().then((snapshot) => {
      if (!active) return
      setTabId(snapshot.tabId)
      setPreferences(snapshot.preferences)
      setStatus(snapshot.status)
    })
    return () => { active = false }
  }, [])

  const view = toPopupViewModel(status, preferences, busy)

  const handleToggle = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    if (tabId === undefined || view.toggleDisabled) return
    setBusy(true)
    const nextStatus = await setProcessingEnabled(tabId, event.target.checked)
    setStatus(nextStatus)
    setBusy(false)
  }

  const handleMix = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const processedMix = Number(event.target.value) / 100
    const previous = preferences
    const next: ProcessingPreferences = { schemaVersion: 1, processedMix }
    setPreferences(next)
    setPreferenceError(false)
    try {
      await saveProcessedMix(processedMix)
    } catch {
      setPreferences(previous)
      setPreferenceError(true)
    }
  }

  return (
    <main className="popup" aria-labelledby="popup-title">
      <header className="popup__header">
        <div className="popup__brand" aria-hidden="true">
          <span className="popup__wave popup__wave--short" />
          <span className="popup__wave popup__wave--medium" />
          <span className="popup__wave popup__wave--tall" />
          <span className="popup__wave popup__wave--medium" />
          <span className="popup__wave popup__wave--short" />
        </div>
        <div>
          <p className="popup__eyebrow">Local audio processing</p>
          <h1 id="popup-title">{extension.name}</h1>
        </div>
      </header>

      <section className={`status-card status-card--${view.statusTone}`} aria-live="polite">
        <span className="status-card__indicator" aria-hidden="true" />
        <div>
          <p className="status-card__label">{view.statusLabel}</p>
          <p className="status-card__detail">{view.explanation}</p>
        </div>
      </section>

      <section className="controls" aria-label="Processing controls">
        <div className="control-row">
          <div>
            <label className="control-row__label" htmlFor="processing-enabled">Vocal reduction</label>
            <p id="processing-help" className="control-row__help">Explicitly enable for this tab only</p>
          </div>
          <label className="switch">
            <input
              id="processing-enabled"
              type="checkbox"
              role="switch"
              checked={view.toggleChecked}
              disabled={view.toggleDisabled}
              aria-describedby="processing-help"
              onChange={(event) => { void handleToggle(event) }}
            />
            <span className="switch__track" aria-hidden="true"><span className="switch__thumb" /></span>
          </label>
        </div>

        <div className="mix-control">
          <div className="mix-control__heading">
            <label htmlFor="processed-mix">{view.mixLabel}</label>
            <output htmlFor="processed-mix">{view.mixPercent}%</output>
          </div>
          <input
            id="processed-mix"
            type="range"
            min="0"
            max="100"
            step="5"
            value={view.mixPercent}
            disabled={view.mixDisabled}
            aria-describedby="mix-help"
            onChange={(event) => { void handleMix(event) }}
          />
          <p id="mix-help" className="control-row__help">
            Blends processed and original signal. This is not a guaranteed vocal-removal percentage.
          </p>
          {preferenceError && <p className="form-error" role="alert">The local preference could not be saved.</p>}
        </div>
      </section>

      <dl className="runtime-details" aria-label="Local runtime details">
        <div><dt>Model</dt><dd>{view.modelLabel}</dd></div>
        <div><dt>Backend</dt><dd>{view.backendLabel}</dd></div>
        <div><dt>Buffered latency</dt><dd>{view.latencyLabel}</dd></div>
      </dl>

      <p className="privacy-note">
        Audio stays on this device. No uploads, analytics, or remote model downloads.
      </p>
    </main>
  )
}

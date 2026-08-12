import { extension } from '../shared/extension'
import './popup.css'

export function PopupApp() {
  return (
    <main className="popup" aria-labelledby="popup-title">
      <div className="popup__brand" aria-hidden="true">
        <span className="popup__wave popup__wave--short" />
        <span className="popup__wave popup__wave--medium" />
        <span className="popup__wave popup__wave--tall" />
        <span className="popup__wave popup__wave--medium" />
        <span className="popup__wave popup__wave--short" />
      </div>
      <p className="popup__eyebrow">Extension foundation</p>
      <h1 id="popup-title">{extension.name}</h1>
      <p className="popup__status">{extension.statusMessage}</p>
      <p className="popup__next-step">{extension.nextStepMessage}</p>
    </main>
  )
}

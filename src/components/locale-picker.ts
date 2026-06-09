/**
 * <telstar-locale-picker> — UI language dropdown (top-right). Switches the i18n
 * locale signal and persists it. Channel data is unaffected; only UI chrome
 * re-renders (SignalWatcher components read `t()` which tracks the locale).
 */
import { LitElement, html, css } from "lit";
import { SignalWatcher, locale, setLocale } from "../state/signals";
import { saveLocale } from "../state/view-pref";
import { pushLocale } from "../sync";
import { LOCALES, t, applyLocaleDir } from "../i18n";

export class TelstarLocalePicker extends SignalWatcher(LitElement) {
  static styles = css`
    :host {
      display: block;
    }
    .field {
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .globe {
      flex: none;
      width: 1.1rem;
      height: 1.1rem;
      color: #8a8a92;
    }
    select {
      padding: 0.3rem 0.5rem;
      border: 1px solid #2a2a30;
      border-radius: 0.4rem;
      background: #0d0d10;
      color: #e8e8ea;
      font: inherit;
      font-size: 0.85rem;
      cursor: pointer;
    }
    /* Touch: finger-sized control height. */
    @media (pointer: coarse) {
      select {
        padding: 0.6rem 0.6rem;
        font-size: 1rem;
      }
    }
  `;

  render() {
    const current = locale.get();
    return html`
      <div class="field">
        <span class="globe" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8">
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18" />
            <path d="M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
          </svg>
        </span>
        <select
          aria-label=${t("uiLanguage")}
          title=${t("uiLanguage")}
          @change=${(e: Event) => {
            const code = (e.target as HTMLSelectElement).value;
            setLocale(code);
            saveLocale(code);
            pushLocale(code);
            applyLocaleDir(code); // flip layout direction for RTL locales
          }}
        >
          ${LOCALES.map(
            (l) => html`<option value=${l.code} ?selected=${l.code === current}>${l.label}</option>`,
          )}
        </select>
      </div>
    `;
  }
}

customElements.define("telstar-locale-picker", TelstarLocalePicker);

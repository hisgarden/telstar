/**
 * <telstar-genre-picker> — genre browse chips (R3), the third facet alongside
 * the language picker. Multi-select, persisted on-device. Reads the loaded
 * channels to offer only categories actually present (from enrichment), and
 * renders nothing until channels carry categories.
 */
import { LitElement, html, css } from "lit";
import {
  SignalWatcher,
  channels,
  selectedCategories,
  setSelectedCategories,
} from "../state/signals";
import { availableCategories, saveSelectedCategories } from "../state/genre-pref";

export class TelstarGenrePicker extends SignalWatcher(LitElement) {
  static styles = css`
    :host {
      display: block;
    }
    .cats {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      align-items: center;
    }
    .legend {
      color: #6a6a72;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-right: 0.2rem;
    }
    .chip {
      padding: 0.25rem 0.6rem;
      border: 1px solid #2a2a30;
      border-radius: 999px;
      background: #16161a;
      color: #c7c7cd;
      font: inherit;
      font-size: 0.8rem;
      cursor: pointer;
      text-transform: capitalize;
    }
    .chip[aria-pressed="true"] {
      border-color: #6a8f4a;
      background: #233019;
      color: #d6f0bd;
    }
  `;

  #toggle(cat: string) {
    const current = selectedCategories.get();
    const next = current.includes(cat) ? current.filter((c) => c !== cat) : [...current, cat];
    setSelectedCategories(next);
    saveSelectedCategories(next);
  }

  render() {
    const cats = availableCategories(channels.get());
    if (cats.length === 0) return html``;
    const selected = selectedCategories.get();
    return html`
      <div class="cats">
        <span class="legend">Genre</span>
        ${cats.map(
          (cat) => html`
            <button
              class="chip"
              aria-pressed=${selected.includes(cat) ? "true" : "false"}
              @click=${() => this.#toggle(cat)}
            >
              ${cat}
            </button>
          `,
        )}
      </div>
    `;
  }
}

customElements.define("telstar-genre-picker", TelstarGenrePicker);

/** Compatibility route for old #/cards links. */
import { renderBoard } from './board.js';

export function renderCards() {
  renderBoard({ initialMode: 'list' });
}

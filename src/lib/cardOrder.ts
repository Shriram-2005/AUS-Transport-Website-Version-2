/**
 * Utility for persisting and applying user-defined card order across categories
 * (Vehicles, Drivers, Fuel, Maintenance, Expenses)
 */

export const CARD_ORDER_STORAGE_PREFIX = 'aus_card_order_';
export const CARD_ORDER_CHANGE_EVENT = 'aus_card_order_changed';

export function getStoredCardOrder(category: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(`${CARD_ORDER_STORAGE_PREFIX}${category}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((s) => String(s).trim()).filter(Boolean) : [];
  } catch (err) {
    console.error(`Error reading card order for ${category}:`, err);
    return [];
  }
}

export function saveStoredCardOrder(category: string, order: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    const clean = Array.from(new Set(order.map((s) => String(s).trim()).filter(Boolean)));
    localStorage.setItem(`${CARD_ORDER_STORAGE_PREFIX}${category}`, JSON.stringify(clean));
    window.dispatchEvent(
      new CustomEvent(CARD_ORDER_CHANGE_EVENT, { detail: { category, order: clean } })
    );
  } catch (err) {
    console.error(`Error saving card order for ${category}:`, err);
  }
}

export function resetStoredCardOrder(category: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(`${CARD_ORDER_STORAGE_PREFIX}${category}`);
    window.dispatchEvent(
      new CustomEvent(CARD_ORDER_CHANGE_EVENT, { detail: { category, order: [] } })
    );
  } catch (err) {
    console.error(`Error resetting card order for ${category}:`, err);
  }
}

/**
 * Reorders an array by moving an item from one index to another
 */
export function moveItemInArray<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex < 0 || fromIndex >= items.length || toIndex < 0 || toIndex >= items.length) {
    return items;
  }
  const result = [...items];
  const [removed] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, removed);
  return result;
}

/**
 * Sorts items according to the stored card order for a given category.
 * Items present in the order list appear first in that specified order.
 * Items not present in the order list appear at the end in their original sequence.
 */
export function applyCardOrder<T>(items: T[], getId: (item: T) => string, category: string): T[] {
  const order = getStoredCardOrder(category);
  if (!order || order.length === 0) return items;

  const orderMap = new Map<string, number>();
  order.forEach((id, idx) => {
    orderMap.set(id.toLowerCase(), idx);
  });

  return [...items].sort((a, b) => {
    const idA = getId(a).toLowerCase();
    const idB = getId(b).toLowerCase();
    const indexA = orderMap.has(idA) ? orderMap.get(idA)! : Number.MAX_SAFE_INTEGER;
    const indexB = orderMap.has(idB) ? orderMap.get(idB)! : Number.MAX_SAFE_INTEGER;
    return indexA - indexB;
  });
}

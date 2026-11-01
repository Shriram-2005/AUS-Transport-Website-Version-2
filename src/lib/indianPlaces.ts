// Comprehensive Indian Places and Cities dataset with progressive search & intelligent ranking
import rawIndianPlaces from './indianPlacesData.json';

export interface IndianPlace {
  name: string;
  state?: string;
}

const CUSTOM_STORAGE_KEY = 'aus_user_custom_places';

// Initialize with the 2,234+ bundled Indian places
let allPlaces: IndianPlace[] = rawIndianPlaces as IndianPlace[];

function loadCustomPlaces(): IndianPlace[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CUSTOM_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addCustomIndianPlace(name: string, state = ''): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  const customs = loadCustomPlaces();
  if (!customs.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
    const newPlace: IndianPlace = { name: trimmed, state: state.trim() };
    const updated = [newPlace, ...customs];
    try {
      localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(updated));
    } catch {}
    allPlaces = [newPlace, ...allPlaces];
  }
}

export async function initializeIndianPlaces(): Promise<IndianPlace[]> {
  const customs = loadCustomPlaces();
  if (customs.length > 0) {
    const seen = new Set<string>();
    const merged: IndianPlace[] = [];
    for (const p of [...customs, ...allPlaces]) {
      const key = `${p.name.toLowerCase()}|${(p.state || '').toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(p);
      }
    }
    allPlaces = merged;
  }
  return allPlaces;
}

/**
 * Intelligent progressive reveal search across all 2,234+ Indian places.
 * Scores matches so exact and prefix matches appear first, followed by word starts and contains.
 */
export function searchIndianPlaces(query: string, maxResults = 30): IndianPlace[] {
  const clean = query.trim().toLowerCase();
  if (!clean) return [];

  interface ScoredPlace {
    place: IndianPlace;
    score: number;
  }

  const scored: ScoredPlace[] = [];
  const seen = new Set<string>();

  for (const place of allPlaces) {
    const pName = place.name.toLowerCase();
    const pState = (place.state || '').toLowerCase();

    let score = -1;

    if (pName === clean) {
      score = 100;
    } else if (pName.startsWith(clean)) {
      score = 80 - Math.min(20, pName.length - clean.length);
    } else {
      const words = pName.split(/[\s,/-]+/);
      const wordMatch = words.some((w) => w.startsWith(clean));
      if (wordMatch) {
        score = 60;
      } else if (pName.includes(clean)) {
        score = 40;
      } else if (pState.startsWith(clean) || pState.includes(clean)) {
        score = 20;
      }
    }

    if (score > 0) {
      if (!seen.has(pName)) {
        seen.add(pName);
        scored.push({ place, score });
      }
    }
  }

  // Sort by highest score first, then shorter name, then alphabetical
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.place.name.length !== b.place.name.length) return a.place.name.length - b.place.name.length;
    return a.place.name.localeCompare(b.place.name);
  });

  return scored.slice(0, maxResults).map((s) => s.place);
}

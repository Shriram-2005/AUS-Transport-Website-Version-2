import { createClient } from './client';

/**
 * Checks connection health specifically to the Supabase database.
 * Returns true if DB is active and reachable, false if offline.
 */
export async function checkDbConnection(): Promise<boolean> {
  if (typeof window === 'undefined') return true;
  if (!navigator.onLine) return false;

  try {
    const supabase = createClient();
    // Test a lightweight query to verify the database endpoint responds
    const { error } = await supabase
      .from('invoices')
      .select('id')
      .limit(1);

    // If fetch failed or network is down (status 0 or TypeError)
    if (error && ((error as any).status === 0 || (error as any).message?.includes('fetch failed'))) {
      return false;
    }

    // A response (data or standard SQL error like empty relation) means DB server is active
    return true;
  } catch {
    return false;
  }
}

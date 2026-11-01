-- ==============================================================================
-- AUS Transport Website - Supabase Database Schema
-- File: supabase/schema.sql
-- Description: Central schema and migration file tracking all database definitions,
--              Row Level Security (RLS) policies, and admin access rules.
-- ==============================================================================

-- 1. Create custom enum or check for user roles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. Helper function to check if the current user is an admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- 3. Row Level Security Policies for profiles
-- Drop existing policies if re-running
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update their own profile" ON public.profiles;

-- Only authenticated admins can read profiles
CREATE POLICY "Admins can view all profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.is_admin() OR auth.uid() = id);

-- Only admins can update their own profile
CREATE POLICY "Admins can update their own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- 4. Trigger to automatically create a profile record when an admin is created in auth.users
CREATE OR REPLACE FUNCTION public.handle_new_admin_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (new.id, new.email, 'admin')
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_admin_user();

-- ==============================================================================
-- INSTRUCTIONS FOR ADDING EXISTING ADMINS:
-- 1. In Supabase Dashboard -> Authentication -> Users, invite or create your admin email(s).
-- 2. The trigger above automatically adds them to public.profiles as 'admin'.
-- 3. In Supabase Dashboard -> Authentication -> Providers -> Email:
--    Turn OFF "Allow new users to sign up" to block any public signups.
-- ==============================================================================

-- 5. Invoices Table
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_number TEXT NOT NULL UNIQUE,
  bill_date TEXT NOT NULL,
  vehicle_number TEXT NOT NULL,
  consignor JSONB NOT NULL DEFAULT '{}'::jsonb,
  consignee JSONB NOT NULL DEFAULT '{}'::jsonb,
  trips JSONB NOT NULL DEFAULT '[]'::jsonb,
  expenses JSONB NOT NULL DEFAULT '{}'::jsonb,
  net_amount NUMERIC NOT NULL DEFAULT 0,
  amount_in_words TEXT NOT NULL DEFAULT '',
  bank_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  is_locked BOOLEAN NOT NULL DEFAULT false,
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_invoices_bill_number ON public.invoices(bill_number);
CREATE INDEX IF NOT EXISTS idx_invoices_bill_date ON public.invoices(bill_date);
CREATE INDEX IF NOT EXISTS idx_invoices_vehicle_number ON public.invoices(vehicle_number);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read invoices"
  ON public.invoices FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated insert invoices"
  ON public.invoices FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated update invoices"
  ON public.invoices FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Allow authenticated delete invoices"
  ON public.invoices FOR DELETE TO authenticated USING (true);

-- 6. Vehicles Table
CREATE TABLE IF NOT EXISTS public.vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_number TEXT NOT NULL UNIQUE,
  current_km BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_vehicles_registration ON public.vehicles(registration_number);

ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read vehicles"
  ON public.vehicles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated insert vehicles"
  ON public.vehicles FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated update vehicles"
  ON public.vehicles FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Allow authenticated delete vehicles"
  ON public.vehicles FOR DELETE TO authenticated USING (true);

-- Also allow anon access for dev / testing if needed
CREATE POLICY "Allow anon read vehicles"
  ON public.vehicles FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anon insert vehicles"
  ON public.vehicles FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow anon update vehicles"
  ON public.vehicles FOR UPDATE TO anon USING (true);

-- 7. Seed Initial Vehicles (TN 76 AK 1094 and TN 99 E 8505)
INSERT INTO public.vehicles (registration_number, current_km)
VALUES
  ('TN 76 AK 1094', 372353),
  ('TN 99 E 8505', 886017)
ON CONFLICT (registration_number)
DO UPDATE SET
  current_km = EXCLUDED.current_km,
  updated_at = timezone('utc'::text, now());

-- 8. Auto-Sync Trigger: Updates vehicle current_km when invoices are saved
CREATE OR REPLACE FUNCTION public.sync_vehicle_km_from_invoice()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_num TEXT;
  max_km NUMERIC := 0;
  trip_item JSONB;
  c_km NUMERIC;
BEGIN
  v_num := TRIM(UPPER(NEW.vehicle_number));
  IF v_num IS NULL OR v_num = '' THEN
    RETURN NEW;
  END IF;

  -- Iterate through trips array to extract highest closingKm
  IF NEW.trips IS NOT NULL AND jsonb_typeof(NEW.trips) = 'array' THEN
    FOR trip_item IN SELECT * FROM jsonb_array_elements(NEW.trips)
    LOOP
      c_km := COALESCE((trip_item->>'closingKm')::numeric, 0);
      IF c_km > max_km THEN
        max_km := c_km;
      END IF;
    END LOOP;
  END IF;

  -- If max_km is greater than 0, update or insert vehicle current_km
  IF max_km > 0 THEN
    INSERT INTO public.vehicles (registration_number, current_km)
    VALUES (v_num, max_km)
    ON CONFLICT (registration_number)
    DO UPDATE SET
      current_km = GREATEST(public.vehicles.current_km, EXCLUDED.current_km),
      updated_at = timezone('utc'::text, now());
  END IF;

  RETURN NEW;
END;
$$;

-- 8. Auto-Sync Trigger: Safely attach trigger if public.invoices exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'invoices'
  ) THEN
    DROP TRIGGER IF EXISTS on_invoice_sync_vehicle_km ON public.invoices;
    CREATE TRIGGER on_invoice_sync_vehicle_km
      AFTER INSERT OR UPDATE OF trips, vehicle_number ON public.invoices
      FOR EACH ROW
      EXECUTE FUNCTION public.sync_vehicle_km_from_invoice();
  END IF;
END $$;

-- 9. Monthly Vehicle Kilometers View
-- Automatically aggregates total KMs run per month for each vehicle from invoices
CREATE OR REPLACE VIEW public.vehicle_monthly_kms AS
WITH expanded_trips AS (
  SELECT
    UPPER(TRIM(i.vehicle_number)) AS vehicle_number,
    COALESCE(
      NULLIF(t->>'date', ''),
      NULLIF(i.bill_date, '')
    ) AS trip_date_str,
    GREATEST(0, COALESCE((t->>'closingKm')::numeric, 0) - COALESCE((t->>'startingKm')::numeric, 0)) AS km_run
  FROM public.invoices i,
       jsonb_array_elements(i.trips) AS t
),
parsed_trips AS (
  SELECT
    vehicle_number,
    km_run,
    CASE
      WHEN trip_date_str ~ '^\d{1,2}-\d{1,2}-\d{4}$' THEN to_date(trip_date_str, 'DD-MM-YYYY')
      WHEN trip_date_str ~ '^\d{4}-\d{1,2}-\d{1,2}$' THEN to_date(trip_date_str, 'YYYY-MM-DD')
      WHEN trip_date_str ~ '^\d{1,2}/\d{1,2}/\d{4}$' THEN to_date(trip_date_str, 'DD/MM/YYYY')
      ELSE NULL
    END AS trip_date
  FROM expanded_trips
)
SELECT
  vehicle_number,
  to_char(trip_date, 'YYYY-MM') AS month_key,
  to_char(trip_date, 'FMMonth YYYY') AS month_name,
  SUM(km_run)::bigint AS total_kms_ran,
  COUNT(*)::int AS trip_count
FROM parsed_trips
WHERE trip_date IS NOT NULL AND km_run > 0
GROUP BY vehicle_number, to_char(trip_date, 'YYYY-MM'), to_char(trip_date, 'FMMonth YYYY')
ORDER BY vehicle_number ASC, month_key DESC;

-- Grant access on the view
GRANT SELECT ON public.vehicle_monthly_kms TO authenticated, anon;

-- Helper function: Query monthly KMs for a specific vehicle or all vehicles
CREATE OR REPLACE FUNCTION public.get_vehicle_monthly_kms(p_vehicle_number TEXT DEFAULT NULL)
RETURNS TABLE (
  vehicle_number TEXT,
  month_name TEXT,
  total_kms_ran BIGINT,
  trip_count INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    v.vehicle_number,
    v.month_name,
    v.total_kms_ran,
    v.trip_count
  FROM public.vehicle_monthly_kms v
  WHERE p_vehicle_number IS NULL OR v.vehicle_number = UPPER(TRIM(p_vehicle_number))
  ORDER BY v.month_key DESC;
$$;

-- 10. Drivers Table
CREATE TABLE IF NOT EXISTS public.drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  rate_per_km NUMERIC NOT NULL DEFAULT 2.50,
  phone TEXT,
  license_number TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_drivers_name ON public.drivers(name);

ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read drivers" ON public.drivers;
CREATE POLICY "Allow authenticated read drivers"
  ON public.drivers FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated insert drivers" ON public.drivers;
CREATE POLICY "Allow authenticated insert drivers"
  ON public.drivers FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated update drivers" ON public.drivers;
CREATE POLICY "Allow authenticated update drivers"
  ON public.drivers FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated delete drivers" ON public.drivers;
CREATE POLICY "Allow authenticated delete drivers"
  ON public.drivers FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow anon read drivers" ON public.drivers;
CREATE POLICY "Allow anon read drivers"
  ON public.drivers FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Allow anon insert drivers" ON public.drivers;
CREATE POLICY "Allow anon insert drivers"
  ON public.drivers FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon update drivers" ON public.drivers;
CREATE POLICY "Allow anon update drivers"
  ON public.drivers FOR UPDATE TO anon USING (true);

-- 11. Driver Monthly Kilometers & Salary View
-- Aggregates total KMs run and salary earned per month for each driver from invoices
CREATE OR REPLACE VIEW public.driver_monthly_kms AS
WITH expanded_driver_trips AS (
  SELECT
    COALESCE(
      NULLIF(TRIM(t->>'driverName'), ''),
      NULLIF(TRIM(t->>'driverId'), '')
    ) AS driver_name,
    COALESCE(
      NULLIF(t->>'date', ''),
      NULLIF(i.bill_date, '')
    ) AS trip_date_str,
    GREATEST(0, COALESCE((t->>'closingKm')::numeric, 0) - COALESCE((t->>'startingKm')::numeric, 0)) AS km_run,
    COALESCE((t->>'driverRate')::numeric, 2.50) AS rate_per_km
  FROM public.invoices i,
       jsonb_array_elements(i.trips) AS t
),
parsed_driver_trips AS (
  SELECT
    driver_name,
    km_run,
    rate_per_km,
    (km_run * rate_per_km) AS trip_salary,
    CASE
      WHEN trip_date_str ~ '^\d{1,2}-\d{1,2}-\d{4}$' THEN to_date(trip_date_str, 'DD-MM-YYYY')
      WHEN trip_date_str ~ '^\d{4}-\d{1,2}-\d{1,2}$' THEN to_date(trip_date_str, 'YYYY-MM-DD')
      WHEN trip_date_str ~ '^\d{1,2}/\d{1,2}/\d{4}$' THEN to_date(trip_date_str, 'DD/MM/YYYY')
      ELSE NULL
    END AS trip_date
  FROM expanded_driver_trips
  WHERE driver_name IS NOT NULL AND driver_name <> ''
)
SELECT
  driver_name,
  to_char(trip_date, 'YYYY-MM') AS month_key,
  to_char(trip_date, 'FMMonth YYYY') AS month_name,
  SUM(km_run)::bigint AS total_kms_ran,
  ROUND(SUM(trip_salary), 2) AS total_salary,
  COUNT(*)::int AS trip_count
FROM parsed_driver_trips
WHERE trip_date IS NOT NULL AND km_run > 0
GROUP BY driver_name, to_char(trip_date, 'YYYY-MM'), to_char(trip_date, 'FMMonth YYYY')
ORDER BY driver_name ASC, month_key DESC;

GRANT SELECT ON public.driver_monthly_kms TO authenticated, anon;

-- Helper function: Query monthly KMs and salary for a specific driver
CREATE OR REPLACE FUNCTION public.get_driver_monthly_kms(p_driver_name TEXT DEFAULT NULL)
RETURNS TABLE (
  driver_name TEXT,
  month_name TEXT,
  total_kms_ran BIGINT,
  total_salary NUMERIC,
  trip_count INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    d.driver_name,
    d.month_name,
    d.total_kms_ran,
    d.total_salary,
    d.trip_count
  FROM public.driver_monthly_kms d
  WHERE p_driver_name IS NULL OR UPPER(TRIM(d.driver_name)) = UPPER(TRIM(p_driver_name))
  ORDER BY d.month_key DESC;
$$;





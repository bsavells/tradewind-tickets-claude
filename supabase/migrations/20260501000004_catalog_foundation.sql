-- Phase 13.A.0 — Parts catalog foundation.
--
-- catalog_vendors: normalized vendor list (no "Jet Specialty" / "Jet specialty" dupes).
-- catalog_items:   master SKU list with per-item markup. Sell price is computed
--                  at render as unit_cost * (1 + markup_pct / 100) so a cost or
--                  markup change ripples everywhere automatically.
-- catalog_items_techview: tech-safe view that omits unit_cost and markup_pct.
--                         Runs with security_invoker = false so techs can read
--                         it without needing SELECT on the base table (RLS on
--                         the base table only allows admins to see costs).
-- ticket_materials.catalog_item_id: nullable FK linking a line back to its
--                                   catalog row. Existing free-text columns
--                                   stay as snapshots so historical tickets
--                                   keep their data even if the catalog row
--                                   is later edited or deleted.

CREATE TABLE public.catalog_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

CREATE INDEX catalog_vendors_company_idx ON public.catalog_vendors (company_id);

CREATE TABLE public.catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.catalog_vendors(id) ON DELETE RESTRICT,
  part_number text,
  description text,
  size text,
  packaging_unit text,
  unit_cost numeric(10,2),
  markup_pct numeric(6,2) NOT NULL DEFAULT 30 CHECK (markup_pct >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX catalog_items_vendor_idx ON public.catalog_items (vendor_id);
CREATE INDEX catalog_items_active_idx ON public.catalog_items (active);

-- Tech-safe view: omits unit_cost + markup_pct, scopes by company, hides inactive.
-- security_invoker = false → runs as the view owner (the table owner / postgres),
-- bypassing RLS on the base catalog_items table so techs can read without
-- needing SELECT permission there.
CREATE VIEW public.catalog_items_techview WITH (security_invoker = false) AS
  SELECT
    i.id,
    i.vendor_id,
    v.name AS vendor_name,
    i.part_number,
    i.description,
    i.size,
    i.packaging_unit,
    i.active
  FROM public.catalog_items i
  JOIN public.catalog_vendors v ON v.id = i.vendor_id
  WHERE v.company_id = public.auth_company_id();

GRANT SELECT ON public.catalog_items_techview TO authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.catalog_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_items ENABLE ROW LEVEL SECURITY;

-- Vendors are non-sensitive (just names); anyone in the company can read.
CREATE POLICY "select catalog_vendors by company"
  ON public.catalog_vendors FOR SELECT
  USING (company_id = public.auth_company_id());

CREATE POLICY "writable admins insert catalog_vendors"
  ON public.catalog_vendors FOR INSERT
  WITH CHECK (
    public.is_writable_admin() AND company_id = public.auth_company_id()
  );

CREATE POLICY "writable admins update catalog_vendors"
  ON public.catalog_vendors FOR UPDATE
  USING (public.is_writable_admin() AND company_id = public.auth_company_id())
  WITH CHECK (public.is_writable_admin() AND company_id = public.auth_company_id());

CREATE POLICY "writable admins delete catalog_vendors"
  ON public.catalog_vendors FOR DELETE
  USING (public.is_writable_admin() AND company_id = public.auth_company_id());

-- Items: only admins (writable OR readonly) can SELECT directly. Techs read
-- via the view above. Insert/update/delete still gated to writable admins.
CREATE POLICY "admins select catalog_items"
  ON public.catalog_items FOR SELECT
  USING (
    public.is_admin()
    AND EXISTS (
      SELECT 1 FROM public.catalog_vendors v
      WHERE v.id = vendor_id AND v.company_id = public.auth_company_id()
    )
  );

CREATE POLICY "writable admins insert catalog_items"
  ON public.catalog_items FOR INSERT
  WITH CHECK (
    public.is_writable_admin()
    AND EXISTS (
      SELECT 1 FROM public.catalog_vendors v
      WHERE v.id = vendor_id AND v.company_id = public.auth_company_id()
    )
  );

CREATE POLICY "writable admins update catalog_items"
  ON public.catalog_items FOR UPDATE
  USING (
    public.is_writable_admin()
    AND EXISTS (
      SELECT 1 FROM public.catalog_vendors v
      WHERE v.id = vendor_id AND v.company_id = public.auth_company_id()
    )
  )
  WITH CHECK (
    public.is_writable_admin()
    AND EXISTS (
      SELECT 1 FROM public.catalog_vendors v
      WHERE v.id = vendor_id AND v.company_id = public.auth_company_id()
    )
  );

CREATE POLICY "writable admins delete catalog_items"
  ON public.catalog_items FOR DELETE
  USING (
    public.is_writable_admin()
    AND EXISTS (
      SELECT 1 FROM public.catalog_vendors v
      WHERE v.id = vendor_id AND v.company_id = public.auth_company_id()
    )
  );

-- updated_at maintenance for catalog_items
CREATE OR REPLACE FUNCTION public.catalog_items_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER catalog_items_updated_at
  BEFORE UPDATE ON public.catalog_items
  FOR EACH ROW EXECUTE FUNCTION public.catalog_items_set_updated_at();

-- Link line items back to their catalog source. Nullable so manual / pre-import
-- ticket_materials rows still work; ON DELETE SET NULL so deleting a catalog
-- entry doesn't cascade-delete historical ticket data.
ALTER TABLE public.ticket_materials
  ADD COLUMN catalog_item_id uuid REFERENCES public.catalog_items(id) ON DELETE SET NULL;

CREATE INDEX ticket_materials_catalog_item_idx ON public.ticket_materials (catalog_item_id);

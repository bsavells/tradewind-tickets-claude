-- Per-customer overrides for labor rates by classification.
-- Default rates live on `classifications.default_reg_rate` / `default_ot_rate`.
-- A row in this table only exists for a customer when their billing diverges
-- from the global default for that classification.
CREATE TABLE public.customer_classification_rates (
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  classification_id uuid NOT NULL REFERENCES public.classifications(id) ON DELETE CASCADE,
  reg_rate numeric(10,2) NOT NULL CHECK (reg_rate >= 0),
  ot_rate numeric(10,2) NOT NULL CHECK (ot_rate >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, classification_id)
);

COMMENT ON TABLE public.customer_classification_rates IS
  'Per-customer overrides for labor rates by classification. Lookup at ticket time falls back to classifications.default_*_rate when no row exists.';

ALTER TABLE public.customer_classification_rates ENABLE ROW LEVEL SECURITY;

-- SELECT: any authenticated user in the same company as the customer.
CREATE POLICY "select customer rates by company"
  ON public.customer_classification_rates
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id = customer_id AND c.company_id = public.auth_company_id()
  ));

-- INSERT: writable admins only, scoped to their own company's customers.
CREATE POLICY "writable admins insert customer rates"
  ON public.customer_classification_rates
  FOR INSERT
  WITH CHECK (
    public.is_writable_admin()
    AND EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = customer_id AND c.company_id = public.auth_company_id()
    )
  );

-- UPDATE: writable admins only, both pre and post-image scoped to their company.
CREATE POLICY "writable admins update customer rates"
  ON public.customer_classification_rates
  FOR UPDATE
  USING (
    public.is_writable_admin()
    AND EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = customer_id AND c.company_id = public.auth_company_id()
    )
  )
  WITH CHECK (
    public.is_writable_admin()
    AND EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = customer_id AND c.company_id = public.auth_company_id()
    )
  );

-- DELETE: writable admins, scoped.
CREATE POLICY "writable admins delete customer rates"
  ON public.customer_classification_rates
  FOR DELETE
  USING (
    public.is_writable_admin()
    AND EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = customer_id AND c.company_id = public.auth_company_id()
    )
  );

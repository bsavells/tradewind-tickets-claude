-- ============================================================
-- Phase 3 — Auto-compute line item totals + ticket grand_total
-- ============================================================

-- Recompute grand_total for a ticket and flag post-finalize edits
create or replace function recompute_ticket_grand_total(p_ticket_id uuid)
returns void language plpgsql as $$
declare
  v_total numeric(12,2);
  v_status ticket_status;
  v_finalized_at timestamptz;
begin
  select status, finalized_at into v_status, v_finalized_at
  from tickets where id = p_ticket_id;

  if not found then return; end if;

  v_total :=
    coalesce((select sum(total) from ticket_materials where ticket_id = p_ticket_id), 0)
    + coalesce((select sum(row_total) from ticket_labor where ticket_id = p_ticket_id), 0)
    + coalesce((select sum(total) from ticket_vehicles where ticket_id = p_ticket_id), 0)
    + coalesce((select sum(total) from ticket_equipment where ticket_id = p_ticket_id), 0);

  update tickets
    set grand_total = v_total,
        has_post_finalize_changes = case
          when v_status = 'finalized' and grand_total <> v_total then true
          else has_post_finalize_changes
        end
  where id = p_ticket_id;
end;
$$;

-- ----- Materials: total = qty * price_each -----
create or replace function ticket_materials_compute()
returns trigger language plpgsql as $$
begin
  if new.price_each is not null then
    new.total := round(new.qty * new.price_each, 2);
  else
    new.total := null;
  end if;
  return new;
end;
$$;

drop trigger if exists ticket_materials_compute_trg on ticket_materials;
create trigger ticket_materials_compute_trg
  before insert or update on ticket_materials
  for each row execute procedure ticket_materials_compute();

-- ----- Labor: reg_total, ot_total, row_total -----
create or replace function ticket_labor_compute()
returns trigger language plpgsql as $$
begin
  -- Default reg_hours/ot_hours from hours if not set
  if new.reg_hours is null and new.ot_hours is null and new.hours is not null then
    new.reg_hours := new.hours;
    new.ot_hours := 0;
  end if;

  if new.reg_rate is not null and new.reg_hours is not null then
    new.reg_total := round(new.reg_rate * new.reg_hours, 2);
  else
    new.reg_total := null;
  end if;

  if new.ot_rate is not null and new.ot_hours is not null then
    new.ot_total := round(new.ot_rate * new.ot_hours, 2);
  else
    new.ot_total := null;
  end if;

  new.row_total := coalesce(new.reg_total, 0) + coalesce(new.ot_total, 0);
  if new.row_total = 0 and new.reg_total is null and new.ot_total is null then
    new.row_total := null;
  end if;

  return new;
end;
$$;

drop trigger if exists ticket_labor_compute_trg on ticket_labor;
create trigger ticket_labor_compute_trg
  before insert or update on ticket_labor
  for each row execute procedure ticket_labor_compute();

-- ----- Equipment: total = hours * rate -----
create or replace function ticket_equipment_compute()
returns trigger language plpgsql as $$
begin
  if new.rate is not null and new.hours is not null then
    new.total := round(new.rate * new.hours, 2);
  else
    new.total := null;
  end if;
  return new;
end;
$$;

drop trigger if exists ticket_equipment_compute_trg on ticket_equipment;
create trigger ticket_equipment_compute_trg
  before insert or update on ticket_equipment
  for each row execute procedure ticket_equipment_compute();

-- ----- Vehicles: total = total_miles * rate -----
create or replace function ticket_vehicles_compute()
returns trigger language plpgsql as $$
begin
  if new.rate is not null and new.mileage_start is not null and new.mileage_end is not null then
    new.total := round((new.mileage_end - new.mileage_start) * new.rate, 2);
  else
    new.total := null;
  end if;
  return new;
end;
$$;

drop trigger if exists ticket_vehicles_compute_trg on ticket_vehicles;
create trigger ticket_vehicles_compute_trg
  before insert or update on ticket_vehicles
  for each row execute procedure ticket_vehicles_compute();

-- ----- Recompute grand_total after any child change -----
create or replace function child_row_after_change()
returns trigger language plpgsql as $$
declare
  v_ticket_id uuid;
begin
  if tg_op = 'DELETE' then
    v_ticket_id := old.ticket_id;
  else
    v_ticket_id := new.ticket_id;
  end if;
  perform recompute_ticket_grand_total(v_ticket_id);
  return null;
end;
$$;

drop trigger if exists ticket_materials_total_trg on ticket_materials;
create trigger ticket_materials_total_trg
  after insert or update or delete on ticket_materials
  for each row execute procedure child_row_after_change();

drop trigger if exists ticket_labor_total_trg on ticket_labor;
create trigger ticket_labor_total_trg
  after insert or update or delete on ticket_labor
  for each row execute procedure child_row_after_change();

drop trigger if exists ticket_equipment_total_trg on ticket_equipment;
create trigger ticket_equipment_total_trg
  after insert or update or delete on ticket_equipment
  for each row execute procedure child_row_after_change();

drop trigger if exists ticket_vehicles_total_trg on ticket_vehicles;
create trigger ticket_vehicles_total_trg
  after insert or update or delete on ticket_vehicles
  for each row execute procedure child_row_after_change();

-- Backfill all existing tickets so totals reflect any pre-trigger data
do $$
declare
  t record;
begin
  for t in select id from tickets loop
    perform recompute_ticket_grand_total(t.id);
  end loop;
end $$;

-- Agenda AMUC V5
-- BLOQUEO ABSOLUTO DE SUPERPOSICION DE RESERVAS
-- Ejecutar una sola vez en Supabase -> SQL Editor.
--
-- La separación menor a 3 horas NO se bloquea en base de datos porque el usuario
-- puede autorizarla desde la interfaz. La superposición sí queda impedida siempre.

create or replace function public.prevent_reservation_overlap()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_start timestamp;
  new_end timestamp;
  conflict_id bigint;
begin
  -- Una reserva cancelada no ocupa el salón.
  if new.estado = 'CANCELADA' then
    return new;
  end if;

  if new.fecha is null or new.hora_inicio is null or new.hora_fin is null then
    return new;
  end if;

  new_start := new.fecha + new.hora_inicio;
  new_end := new.fecha + new.hora_fin;

  -- Si termina a una hora menor o igual a la de inicio, termina al día siguiente.
  if new_end <= new_start then
    new_end := new_end + interval '1 day';
  end if;

  select r.id
    into conflict_id
  from public.reservas r
  where r.id <> coalesce(new.id, -1)
    and r.estado <> 'CANCELADA'
    and r.fecha is not null
    and r.hora_inicio is not null
    and r.hora_fin is not null
    and tsrange(
      r.fecha + r.hora_inicio,
      (r.fecha + r.hora_fin) +
        case when r.hora_fin <= r.hora_inicio then interval '1 day' else interval '0 day' end,
      '[)'
    ) && tsrange(new_start, new_end, '[)')
  limit 1;

  if conflict_id is not null then
    raise exception 'SUPERPOSICION_RESERVA: el horario se superpone con la reserva ID %', conflict_id
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_reservation_overlap on public.reservas;

create trigger trg_prevent_reservation_overlap
before insert or update of fecha, hora_inicio, hora_fin, estado
on public.reservas
for each row
execute function public.prevent_reservation_overlap();

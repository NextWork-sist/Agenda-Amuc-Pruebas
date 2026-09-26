-- Agenda AMUC V6
-- UNIFICA LA VERIFICACION VISUAL Y LA VALIDACION DE HORARIOS
-- Ejecutar UNA VEZ en Supabase > SQL Editor.
--
-- Reglas:
-- 1) Si hay superposición: BLOQUEO ABSOLUTO.
-- 2) Si no hay superposición pero la separación es menor a 3 horas:
--    se devuelve ADVERTENCIA y la interfaz permite confirmar.
-- 3) Con separación >= 3 horas: DISPONIBLE.
--
-- Este script NO elimina el trigger de V5. El trigger sigue siendo la
-- protección final contra superposiciones simultáneas.

create or replace function public.check_reservation_availability(
  p_fecha date,
  p_hora_inicio time,
  p_hora_fin time,
  p_exclude_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_start timestamp;
  new_end timestamp;
  r record;
  existing_start timestamp;
  existing_end timestamp;
  gap_minutes numeric;
  min_gap numeric := null;
  nearest_id bigint := null;
begin
  if p_fecha is null or p_hora_inicio is null or p_hora_fin is null then
    return jsonb_build_object('status','incomplete');
  end if;

  new_start := p_fecha + p_hora_inicio;
  new_end := p_fecha + p_hora_fin;

  -- Si termina a la misma hora o antes, se interpreta que termina al día siguiente.
  if new_end <= new_start then
    new_end := new_end + interval '1 day';
  end if;

  for r in
    select id, fecha, hora_inicio, hora_fin
    from public.reservas
    where estado <> 'CANCELADA'
      and fecha is not null
      and hora_inicio is not null
      and hora_fin is not null
      and (p_exclude_id is null or id <> p_exclude_id)
  loop
    existing_start := r.fecha + r.hora_inicio;
    existing_end := r.fecha + r.hora_fin;

    if existing_end <= existing_start then
      existing_end := existing_end + interval '1 day';
    end if;

    -- SUPERPOSICION ESTRICTA.
    -- Si una termina exactamente cuando comienza la otra, NO se considera superposición.
    if new_start < existing_end and new_end > existing_start then
      return jsonb_build_object(
        'status','overlap',
        'reservation_id',r.id
      );
    end if;

    -- Distancia entre intervalos cuando no se superponen.
    if new_end <= existing_start then
      gap_minutes := extract(epoch from (existing_start - new_end)) / 60.0;
    elsif existing_end <= new_start then
      gap_minutes := extract(epoch from (new_start - existing_end)) / 60.0;
    else
      gap_minutes := null;
    end if;

    if gap_minutes is not null and gap_minutes >= 0 then
      if min_gap is null or gap_minutes < min_gap then
        min_gap := gap_minutes;
        nearest_id := r.id;
      end if;
    end if;
  end loop;

  if min_gap is not null and min_gap < 180 then
    return jsonb_build_object(
      'status','warning',
      'gap_minutes',round(min_gap),
      'reservation_id',nearest_id
    );
  end if;

  return jsonb_build_object('status','available');
end;
$$;

revoke all on function public.check_reservation_availability(date,time,time,bigint) from public;
grant execute on function public.check_reservation_availability(date,time,time,bigint) to authenticated;

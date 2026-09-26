-- Agenda AMUC V4
-- Ejecutar UNA VEZ en Supabase > SQL Editor.
-- Habilita borrado exclusivamente para ADMINISTRADOR.

create policy "Administrador elimina reservas"
on public.reservas
for delete
to authenticated
using (
  exists (
    select 1 from public.perfiles
    where perfiles.id = auth.uid()
      and perfiles.rol = 'ADMINISTRADOR'
      and perfiles.activo = true
  )
);

create policy "Administrador elimina pagos"
on public.pagos
for delete
to authenticated
using (
  exists (
    select 1 from public.perfiles
    where perfiles.id = auth.uid()
      and perfiles.rol = 'ADMINISTRADOR'
      and perfiles.activo = true
  )
);

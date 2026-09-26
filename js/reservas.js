let clienteActual=null,tarifas={AFILIADO:65000,NO_AFILIADO:99500};
let perfilActual=null;
let availabilityCheckToken=0;

function money(v){return new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(Number(v||0));}
function fd(v){return v?new Intl.DateTimeFormat('es-AR').format(new Date(v+'T12:00:00')):'';}
function horas(i,f){if(!i||!f)return 0;const[a,b]=i.split(':').map(Number),[c,d]=f.split(':').map(Number);let x=a*60+b,y=c*60+d;if(y<=x)y+=1440;return(y-x)/60;}

function intervaloReserva(fecha,inicio,fin){
  if(!fecha||!inicio||!fin)return null;
  const start=new Date(`${fecha}T${inicio}:00`);
  let end=new Date(`${fecha}T${fin}:00`);
  if(end<=start)end.setDate(end.getDate()+1);
  return {start,end};
}

function minutosEntre(a,b){return Math.round(Math.abs(a-b)/60000);}
function fmtHora(v){return v?v.slice(0,5):'-';}
function descripcionReserva(r){
  const cliente=r.clientes?`${r.clientes.nombre||''} ${r.clientes.apellido||''}`.trim():'';
  return `${fd(r.fecha)} de ${fmtHora(r.hora_inicio)} a ${fmtHora(r.hora_fin)}${cliente?' - '+cliente:''}${r.tipo_evento?' - '+r.tipo_evento:''}`;
}

async function evaluarDisponibilidad(fecha,inicio,fin){
  if(!fecha||!inicio||!fin){
    return {tipo:'incompleto',reserva_id:null,minutos:null};
  }

  const {data,error}=await supabaseClient.rpc('check_reservation_availability',{
    p_fecha:fecha,
    p_hora_inicio:inicio,
    p_hora_fin:fin,
    p_exclude_id:null
  });

  if(error)throw error;

  const resultado=data||{};
  if(resultado.status==='overlap'){
    return {
      tipo:'bloqueado',
      reserva_id:resultado.reservation_id||null,
      minutos:0
    };
  }

  if(resultado.status==='warning'){
    return {
      tipo:'advertencia',
      reserva_id:resultado.reservation_id||null,
      minutos:Number(resultado.gap_minutes||0)
    };
  }

  return {tipo:'disponible',reserva_id:null,minutos:null};
}

function mostrarDisponibilidad(resultado){
  const box=document.getElementById('availabilityNotice');
  if(!box)return;

  box.className='full availability-notice';

  if(resultado.tipo==='incompleto'){
    box.classList.add('neutral');
    box.textContent='Seleccioná fecha y horario para verificar la disponibilidad del salón.';
    return;
  }

  if(resultado.tipo==='bloqueado'){
    box.classList.add('blocked');
    box.innerHTML='<strong>⛔ Horario no disponible.</strong> Los horarios se superponen con una reserva existente y no se puede continuar.';
    return;
  }

  if(resultado.tipo==='advertencia'){
    box.classList.add('warning');
    box.innerHTML='<strong>⚠ Tiempo entre reservas menor a tres horas.</strong> Al guardar, el sistema solicitará confirmación para agendar el turno de igual manera.';
    return;
  }

  box.classList.add('available');
  box.innerHTML='<strong>✓ Horario disponible.</strong> No existe superposición y hay una separación mínima de 3 horas respecto de otras reservas.';
}

async function verificarDisponibilidadVisual(){
  const fecha=document.getElementById('fecha').value;
  const inicio=document.getElementById('hora_inicio').value;
  const fin=document.getElementById('hora_fin').value;
  const token=++availabilityCheckToken;

  if(!fecha||!inicio||!fin){
    mostrarDisponibilidad({tipo:'incompleto'});
    return;
  }

  try{
    const resultado=await evaluarDisponibilidad(fecha,inicio,fin);
    if(token===availabilityCheckToken)mostrarDisponibilidad(resultado);
  }catch(err){
    const box=document.getElementById('availabilityNotice');
    if(box){
      box.className='full availability-notice warning';
      box.textContent='No se pudo verificar la disponibilidad en este momento.';
    }
  }
}


async function cargarSolicitudWhatsappEnReserva(){
  const raw=sessionStorage.getItem('agenda_amuc_whatsapp_solicitud');if(!raw)return;
  let s;try{s=JSON.parse(raw);}catch{return;}
  document.getElementById('reservaFormPanel')?.classList.remove('hidden');
  if(s.cliente_id){
    const {data:c}=await supabaseClient.from('clientes').select('*').eq('id',s.cliente_id).single();
    if(c){seleccionarCliente(c);document.getElementById('reservaDatosPanel')?.classList.remove('hidden');}
  }else{
    document.getElementById('nuevoClientePanel')?.classList.remove('hidden');
    if(document.getElementById('nc_dni'))document.getElementById('nc_dni').value=s.dni||'';
    if(document.getElementById('nc_telefono'))document.getElementById('nc_telefono').value=s.telefono||'';
    if(document.getElementById('nc_email'))document.getElementById('nc_email').value=s.email||'';
    if(document.getElementById('nc_afiliado'))document.getElementById('nc_afiliado').checked=s.afiliado===true;
  }
  if(fecha)fecha.value=s.fecha_evento||'';if(hora_inicio)hora_inicio.value=(s.hora_inicio||'').slice(0,5);if(hora_fin)hora_fin.value=(s.hora_fin||'').slice(0,5);if(tipo_evento)tipo_evento.value=s.tipo_evento||'';if(cantidad_personas)cantidad_personas.value=s.cantidad_personas||'';
}

document.addEventListener('DOMContentLoaded',async()=>{
  const c=await requireSession();if(!c)return;perfilActual=c.perfil;
  document.getElementById('toggleFormBtn').onclick=()=>document.getElementById('reservaFormPanel').classList.toggle('hidden');
  document.getElementById('nuevoClienteBtn').onclick=()=>document.getElementById('nuevoClientePanel').classList.toggle('hidden');
  document.getElementById('nc_requiere_factura').onchange=e=>document.getElementById('nc_facturacion').classList.toggle('hidden',!e.target.checked);
  document.getElementById('buscarClienteBtn').onclick=buscarClientes;
  document.getElementById('clienteSearch').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();buscarClientes();}});
  document.getElementById('nuevoClienteForm').addEventListener('submit',guardarNuevoCliente);
  document.getElementById('fecha').addEventListener('change',verificarDisponibilidadVisual);
  document.getElementById('hora_inicio').addEventListener('change',()=>{actualizarPrecio();verificarDisponibilidadVisual();});
  document.getElementById('hora_fin').addEventListener('change',()=>{actualizarPrecio();verificarDisponibilidadVisual();});
  document.getElementById('reservaForm').addEventListener('submit',guardarReserva);
  const{data}=await supabaseClient.from('tarifas').select('tipo_usuario,valor_hora').eq('activo',true);
  (data||[]).forEach(t=>tarifas[t.tipo_usuario]=Number(t.valor_hora));
  loadReservas();
});

async function buscarClientes(){const q=document.getElementById('clienteSearch').value.trim(),b=document.getElementById('resultadosClientes');if(!q){b.innerHTML='<p class="muted">Ingresá DNI, apellido o nombre.</p>';return;}const safe=q.replace(/[,%]/g,' ');const{data,error}=await supabaseClient.from('clientes').select('*').or(`dni.ilike.%${safe}%,apellido.ilike.%${safe}%,nombre.ilike.%${safe}%`).limit(20);if(error){b.innerHTML=`<p class="error">${error.message}</p>`;return;}if(!data.length){b.innerHTML='<p class="muted">No se encontraron clientes. Podés crear uno nuevo.</p>';return;}b.innerHTML=data.map(c=>`<button type="button" class="client-result" data-id="${c.id}"><strong>${c.nombre||''} ${c.apellido||''}</strong><span>DNI ${c.dni||'-'} · ${c.afiliado?'Afiliado AMUC':'No afiliado'}</span></button>`).join('');b.querySelectorAll('.client-result').forEach(btn=>btn.onclick=()=>seleccionarCliente(data.find(x=>String(x.id)===btn.dataset.id)));}
function seleccionarCliente(c){clienteActual=c;document.getElementById('cliente_id').value=c.id;const b=document.getElementById('clienteSeleccionado');b.classList.remove('hidden');b.innerHTML=`<div class="client-card-head"><div><span class="eyebrow">CLIENTE SELECCIONADO</span><h3>${c.nombre||''} ${c.apellido||''}</h3></div><span class="badge large">${c.afiliado?'AFILIADO AMUC':'NO AFILIADO'}</span></div><div class="client-data-grid"><div><span>DNI</span><strong>${c.dni||'-'}</strong></div><div><span>Teléfono</span><strong>${c.telefono||'-'}</strong></div><div><span>Email</span><strong>${c.email||'-'}</strong></div><div><span>Factura</span><strong>${c.requiere_factura?'Sí':'No'}</strong></div>${c.requiere_factura?`<div><span>Razón Social</span><strong>${c.razon_social||'-'}</strong></div><div><span>CUIT</span><strong>${c.cuit||'-'}</strong></div><div><span>Dirección fiscal</span><strong>${c.direccion_fiscal||'-'}</strong></div><div><span>Tipo</span><strong>${c.tipo_factura||'-'}</strong></div>`:''}</div><div class="form-actions"><button type="button" class="btn btn-secondary" id="editarClienteBtn">Modificar datos</button><button type="button" class="btn btn-primary" id="confirmarClienteBtn">Confirmar cliente</button></div>`;document.getElementById('confirmarClienteBtn').onclick=()=>{document.getElementById('reservaDatosPanel').classList.remove('hidden');actualizarPrecio();verificarDisponibilidadVisual();};document.getElementById('editarClienteBtn').onclick=()=>alert('La edición directa se incorpora en la próxima versión. Por ahora puede modificarse desde Clientes.');}
async function guardarNuevoCliente(e){e.preventDefault();const m=document.getElementById('nuevoClienteMessage'),p={nombre:document.getElementById('nc_nombre').value.trim(),apellido:document.getElementById('nc_apellido').value.trim()||null,dni:document.getElementById('nc_dni').value.trim(),telefono:document.getElementById('nc_telefono').value.trim()||null,email:document.getElementById('nc_email').value.trim()||null,direccion:document.getElementById('nc_direccion').value.trim()||null,afiliado:document.getElementById('nc_afiliado').checked,requiere_factura:document.getElementById('nc_requiere_factura').checked,razon_social:document.getElementById('nc_razon_social').value.trim()||null,cuit:document.getElementById('nc_cuit').value.trim()||null,direccion_fiscal:document.getElementById('nc_direccion_fiscal').value.trim()||null,tipo_factura:document.getElementById('nc_tipo_factura').value||null,condicion_iva:document.getElementById('nc_condicion_iva').value||null};const{data,error}=await supabaseClient.from('clientes').insert(p).select().single();if(error){m.textContent='Error: '+error.message;m.className='form-message error';return;}m.textContent='Cliente guardado.';m.className='form-message success';seleccionarCliente(data);document.getElementById('nuevoClientePanel').classList.add('hidden');}
function actualizarPrecio(){if(!clienteActual)return;const h=horas(document.getElementById('hora_inicio').value,document.getElementById('hora_fin').value),tipo=clienteActual.afiliado?'AFILIADO':'NO_AFILIADO',vh=tarifas[tipo]||0;document.getElementById('condicionCliente').textContent=clienteActual.afiliado?'AFILIADO AMUC':'NO AFILIADO';document.getElementById('valorHora').textContent=money(vh);document.getElementById('cantidadHoras').textContent=h?h.toFixed(2).replace('.00',''):'0';document.getElementById('totalAlquiler').textContent=money(h*vh);}

async function guardarReserva(e){
  e.preventDefault();

  const m=document.getElementById('reservaMessage');

  if(!clienteActual){
    m.textContent='Primero seleccioná un cliente.';
    m.className='form-message error';
    return;
  }

  const fecha=document.getElementById('fecha').value;
  const i=document.getElementById('hora_inicio').value;
  const f=document.getElementById('hora_fin').value;

  m.textContent='Verificando disponibilidad...';
  m.className='form-message';

  let disponibilidad;
  try{
    disponibilidad=await evaluarDisponibilidad(fecha,i,f);
  }catch(err){
    m.textContent='No se pudo verificar la disponibilidad. Intentá nuevamente.';
    m.className='form-message error';
    return;
  }

  mostrarDisponibilidad(disponibilidad);

  // Regla absoluta: nunca se permite superponer horarios.
  if(disponibilidad.tipo==='bloqueado'){
    m.textContent='No se puede agendar la reserva porque los horarios se superponen con una reserva existente.';
    m.className='form-message error';
    return;
  }

  // Regla flexible: menos de 3 horas de separación, pero sin superposición.
  if(disponibilidad.tipo==='advertencia'){
    const continuar=confirm(
      'Tiempo entre reservas menor a tres horas. ¿Desea agendar el turno de igual manera?'
    );

    if(!continuar){
      m.textContent='Reserva no guardada. Podés modificar el horario.';
      m.className='form-message';
      return;
    }
  }

  const h=horas(i,f);
  const tipo=clienteActual.afiliado?'AFILIADO':'NO_AFILIADO';
  const vh=tarifas[tipo]||0;

  const p={
    cliente_id:clienteActual.id,
    fecha,
    hora_inicio:i,
    hora_fin:f,
    tipo_evento:document.getElementById('tipo_evento').value.trim()||null,
    cantidad_personas:Number(document.getElementById('cantidad_personas').value||0),
    estado:document.getElementById('estado').value,
    observaciones:document.getElementById('observaciones').value.trim()||null,
    tipo_usuario:tipo,
    cantidad_horas:h,
    valor_hora:vh,
    valor_total:h*vh
  };

  m.textContent='Guardando reserva...';

  const {data:nuevaReserva,error}=await supabaseClient.from('reservas').insert(p).select('id').single();

  if(error){
    // La base sigue siendo la última barrera ante dos usuarios reservando al mismo tiempo.
    if(
      String(error.message||'').includes('SUPERPOSICION_RESERVA') ||
      String(error.details||'').includes('SUPERPOSICION_RESERVA')
    ){
      mostrarDisponibilidad({tipo:'bloqueado'});
      m.textContent='No se puede agendar la reserva porque los horarios se superponen con una reserva existente.';
    }else{
      m.textContent='Error al guardar: '+error.message;
    }
    m.className='form-message error';
    return;
  }

  m.textContent='Reserva guardada correctamente.';
  m.className='form-message success';
  const reservaGuardada={...p,id:nuevaReserva.id};
  mostrarDocumentosReserva(reservaGuardada,{...clienteActual});
  await loadReservas();
  await cargarSolicitudWhatsappEnReserva();
}

async function loadReservas(){
  const{data,error}=await supabaseClient.from('reservas').select('id,fecha,hora_inicio,hora_fin,tipo_evento,cantidad_personas,valor_total,estado,tipo_usuario,cantidad_horas,clientes(nombre,apellido)').order('fecha',{ascending:false});
  const b=document.getElementById('reservasTable');
  if(error){b.innerHTML=`<p class="error">${error.message}</p>`;return;}
  if(!data?.length){b.innerHTML='<p class="muted">Sin reservas.</p>';return;}
  const esAdmin=perfilActual?.rol==='ADMINISTRADOR';
  b.innerHTML=`<table><thead><tr><th>Fecha</th><th>Cliente</th><th>Condición</th><th>Evento</th><th>Horario</th><th>Horas</th><th>Estado</th><th>Total</th>${esAdmin?'<th>Acción</th>':''}</tr></thead><tbody>${data.map(r=>`<tr><td>${fd(r.fecha)}</td><td>${r.clientes?`${r.clientes.nombre||''} ${r.clientes.apellido||''}`:'-'}</td><td>${r.tipo_usuario==='AFILIADO'?'Afiliado':'No afiliado'}</td><td>${r.tipo_evento||'-'}</td><td>${r.hora_inicio?r.hora_inicio.slice(0,5):'-'} / ${r.hora_fin?r.hora_fin.slice(0,5):'-'}</td><td>${r.cantidad_horas||0}</td><td>${r.estado}</td><td>${money(r.valor_total)}</td>${esAdmin?`<td><button type="button" class="icon-btn danger delete-reserva-btn" data-id="${r.id}" title="Eliminar reserva">🗑</button></td>`:''}</tr>`).join('')}</tbody></table>`;

  if(esAdmin){
    b.querySelectorAll('.delete-reserva-btn').forEach(btn=>{
      btn.addEventListener('click', async (e)=>{
        e.preventDefault();
        e.stopPropagation();
        const id = Number(btn.dataset.id);
        await borrarReserva(id);
      });
    });
  }
}


async function borrarReserva(id){
  if(perfilActual?.rol !== 'ADMINISTRADOR'){
    alert('Solo un administrador puede eliminar reservas.');
    return;
  }

  const confirmar = window.confirm(
    '¿Está seguro de eliminar esta reserva? Los cobros asociados también serán eliminados. Esta acción no se puede deshacer.'
  );
  if(!confirmar) return;

  const btn = document.querySelector(`.delete-reserva-btn[data-id="${id}"]`);
  if(btn){
    btn.disabled = true;
    btn.textContent = '…';
  }

  const {error} = await supabaseClient
    .from('reservas')
    .delete()
    .eq('id', id);

  if(error){
    if(btn){
      btn.disabled = false;
      btn.textContent = '🗑';
    }
    alert('No se pudo eliminar la reserva: ' + error.message);
    return;
  }

  if(typeof documentacionActual !== 'undefined' &&
     documentacionActual?.reserva?.id === id){
    documentacionActual = null;
    document.getElementById('documentosReservaPanel')?.classList.add('hidden');
  }

  alert('Reserva eliminada correctamente.');
  await loadReservas();
  await verificarDisponibilidadVisual();
}

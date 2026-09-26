let perfilActual = null;
let reservasPendientes = [];
let reservaSeleccionada = null;

function money(v){
  return new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(Number(v||0));
}

function mapConcepto(valor){
  return {SENA:'Seña',SALDO_TOTAL:'Pago total / saldo',PAGO_PARCIAL:'Pago parcial',OTRO:'Otro'}[valor] || valor;
}

function setFechaAhora(){
  const now=new Date();
  now.setMinutes(now.getMinutes()-now.getTimezoneOffset());
  document.getElementById('fecha').value=now.toISOString().slice(0,16);
}

async function obtenerPagosReserva(reservaId){
  const {data,error}=await supabaseClient.from('pagos').select('id,concepto,importe').eq('reserva_id',reservaId);
  if(error) throw error;
  return data||[];
}

async function cargarReservas(){
  const {data:reservas,error}=await supabaseClient
    .from('reservas')
    .select('id,fecha,tipo_evento,valor_total,estado,clientes(nombre,apellido)')
    .neq('estado','CANCELADA')
    .order('fecha',{ascending:true});

  const select=document.getElementById('reserva_id');
  if(error){
    select.innerHTML='<option value="">Error al cargar reservas</option>';
    return;
  }

  reservasPendientes=[];
  for(const r of reservas||[]){
    const pagos=await obtenerPagosReserva(r.id);
    const pagado=pagos.reduce((s,p)=>s+Number(p.importe||0),0);
    const saldo=Math.max(0,Number(r.valor_total||0)-pagado);
    if(saldo>0.009){
      reservasPendientes.push({...r,pagos,totalPagado:pagado,saldo});
    }
  }

  select.innerHTML='<option value="">Seleccionar reserva</option>'+reservasPendientes.map(r=>{
    const cliente=r.clientes?`${r.clientes.nombre||''} ${r.clientes.apellido||''}`.trim():'Sin cliente';
    return `<option value="${r.id}">#${r.id} - ${r.fecha} - ${cliente} - Saldo ${money(r.saldo)}</option>`;
  }).join('');

  if(!reservasPendientes.length){
    select.innerHTML='<option value="">No hay reservas con saldo pendiente</option>';
  }
}

async function actualizarReservaSeleccionada(){
  const id=Number(document.getElementById('reserva_id').value);
  reservaSeleccionada=reservasPendientes.find(r=>r.id===id)||null;
  const resumen=document.getElementById('reservaResumen');
  if(!reservaSeleccionada){
    resumen.classList.add('hidden');
    document.getElementById('importe').value='';
    return;
  }

  const r=reservaSeleccionada;
  const cliente=r.clientes?`${r.clientes.nombre||''} ${r.clientes.apellido||''}`.trim():'-';
  const senaObjetivo=Number(r.valor_total||0)*0.50;
  const senasPagadas=r.pagos.filter(p=>p.concepto==='SENA'||p.concepto==='Seña').reduce((s,p)=>s+Number(p.importe||0),0);

  resumen.classList.remove('hidden');
  resumen.innerHTML=`
    <div><span>Cliente</span><strong>${cliente}</strong></div>
    <div><span>Total alquiler</span><strong>${money(r.valor_total)}</strong></div>
    <div><span>Pagado</span><strong>${money(r.totalPagado)}</strong></div>
    <div><span>Saldo</span><strong>${money(r.saldo)}</strong></div>
    <div><span>Seña requerida (50%)</span><strong>${money(senaObjetivo)}</strong></div>
    <div><span>Seña registrada</span><strong>${money(senasPagadas)}</strong></div>`;

  actualizarImporte();
}

function actualizarImporte(){
  const concepto=document.getElementById('concepto').value;
  const importe=document.getElementById('importe');
  const help=document.getElementById('importeHelp');

  if(!reservaSeleccionada){importe.value='';importe.readOnly=false;help.textContent='';return;}

  const total=Number(reservaSeleccionada.valor_total||0);
  const saldo=Number(reservaSeleccionada.saldo||0);
  const senaObjetivo=total*0.50;
  const senaPagada=reservaSeleccionada.pagos
    .filter(p=>p.concepto==='SENA'||p.concepto==='Seña')
    .reduce((s,p)=>s+Number(p.importe||0),0);

  if(concepto==='SENA'){
    const pendienteSena=Math.max(0,Math.min(saldo,senaObjetivo-senaPagada));
    importe.value=pendienteSena.toFixed(2);
    importe.readOnly=true;
    help.textContent=pendienteSena>0?'Importe calculado automáticamente: 50% del alquiler.':'La seña requerida ya se encuentra abonada.';
  }else if(concepto==='SALDO_TOTAL'){
    importe.value=saldo.toFixed(2);
    importe.readOnly=true;
    help.textContent='Se descuenta automáticamente cualquier seña o pago anterior.';
  }else{
    importe.readOnly=false;
    importe.value='';
    help.textContent=`Saldo máximo disponible: ${money(saldo)}.`;
  }
}

async function guardarPago(e){
  e.preventDefault();
  const msg=document.getElementById('pagoMessage');
  if(!reservaSeleccionada){msg.textContent='Seleccioná una reserva.';msg.className='form-message error';return;}

  const concepto=document.getElementById('concepto').value;
  const importe=Number(document.getElementById('importe').value||0);
  if(importe<=0){msg.textContent='El importe debe ser mayor a cero.';msg.className='form-message error';return;}
  if(importe>reservaSeleccionada.saldo+0.009){msg.textContent='El importe no puede superar el saldo pendiente.';msg.className='form-message error';return;}

  const payload={
    reserva_id:reservaSeleccionada.id,
    concepto,
    medio_pago:document.getElementById('medio_pago').value,
    importe,
    fecha:document.getElementById('fecha').value?new Date(document.getElementById('fecha').value).toISOString():new Date().toISOString(),
    observaciones:document.getElementById('observaciones').value.trim()||null
  };

  const {error}=await supabaseClient.from('pagos').insert(payload);
  if(error){msg.textContent='Error: '+error.message;msg.className='form-message error';return;}

  msg.textContent='Cobro registrado correctamente.';
  msg.className='form-message success';
  document.getElementById('pagoForm').reset();
  reservaSeleccionada=null;
  document.getElementById('reservaResumen').classList.add('hidden');
  setFechaAhora();
  await cargarReservas();
  await cargarPagos();
}

async function borrarPago(id){
  if(perfilActual?.rol!=='ADMINISTRADOR') return;
  if(!confirm('¿Eliminar este cobro? El saldo de la reserva se recalculará automáticamente.')) return;
  const {error}=await supabaseClient.from('pagos').delete().eq('id',id);
  if(error){alert('No se pudo eliminar el cobro: '+error.message);return;}
  await cargarReservas();
  await cargarPagos();
}

async function cargarPagos(){
  const {data,error}=await supabaseClient
    .from('pagos')
    .select('id,fecha,concepto,medio_pago,importe,reservas(id,clientes(nombre,apellido))')
    .order('fecha',{ascending:false});
  const b=document.getElementById('pagosTable');
  if(error){b.innerHTML=`<p class="error">${error.message}</p>`;return;}
  if(!data?.length){b.innerHTML='<p class="muted">Sin cobros.</p>';return;}

  const esAdmin=perfilActual?.rol==='ADMINISTRADOR';
  b.innerHTML=`<table><thead><tr><th>Fecha</th><th>Reserva</th><th>Cliente</th><th>Concepto</th><th>Medio</th><th>Importe</th>${esAdmin?'<th>Acción</th>':''}</tr></thead><tbody>${data.map(p=>`<tr><td>${new Date(p.fecha).toLocaleString('es-AR')}</td><td>#${p.reservas?.id||'-'}</td><td>${p.reservas?.clientes?`${p.reservas.clientes.nombre||''} ${p.reservas.clientes.apellido||''}`:'-'}</td><td>${mapConcepto(p.concepto||'-')}</td><td>${p.medio_pago||'-'}</td><td>${money(p.importe)}</td>${esAdmin?`<td><button class="icon-btn danger" onclick="borrarPago(${p.id})" title="Eliminar cobro">🗑</button></td>`:''}</tr>`).join('')}</tbody></table>`;
}

document.addEventListener('DOMContentLoaded',async()=>{
  const ctx=await requireSession();
  if(!ctx)return;
  perfilActual=ctx.perfil;
  document.getElementById('toggleFormBtn').onclick=()=>document.getElementById('pagoFormPanel').classList.toggle('hidden');
  document.getElementById('reserva_id').addEventListener('change',actualizarReservaSeleccionada);
  document.getElementById('concepto').addEventListener('change',actualizarImporte);
  document.getElementById('pagoForm').addEventListener('submit',guardarPago);
  setFechaAhora();
  await cargarReservas();
  await cargarPagos();
});
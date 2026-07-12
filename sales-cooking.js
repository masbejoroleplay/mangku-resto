(function () {
  'use strict';

  const MENU_PRICES = Object.freeze({
    'Paket Kenyang': 175000,
    'Paket Biasa': 65000,
    'Android': 60000,
    'Iphone': 550000,
    'Radio': 15000,
    'Rokok': 10000,
    'Korek': 2000,
    'Boombox': 350000
  });
  const COOKING_ITEMS = ['Paket Biasa', 'Paket Kenyang'];
  let salesHistoryRows = [];
  let cookingHistoryRows = [];
  let editingSalesId = '';
  let editingCookingId = '';

  const rupiah = value => 'Rp ' + Number(value || 0).toLocaleString('id-ID');
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const isAdmin = () => currentProfile?.role === 'admin';
  const dateValue = value => value || getLocalDateStr();
  const timestampValue = value => {
    if (!value) return 0;
    if (typeof value.toDate === 'function') return value.toDate().getTime();
    return new Date(value).getTime() || 0;
  };

  function menuOptions(selected = '') {
    return `<option value="" disabled ${!selected?'selected':''}>-- Pilih Barang --</option>` + Object.entries(MENU_PRICES).map(([name, price]) => `<option value="${esc(name)}" ${name===selected?'selected':''}>${esc(name)} — ${rupiah(price)}</option>`).join('');
  }

  function cookingOptions(selected = '') {
    return `<option value="" disabled ${!selected?'selected':''}>-- Pilih Barang --</option>` + COOKING_ITEMS.map(name => `<option value="${name}" ${name===selected?'selected':''}>${name}</option>`).join('');
  }

  function setDefaultRange(prefix) {
    const from = document.getElementById(prefix + '-dari');
    const to = document.getElementById(prefix + '-sampai');
    if (from && !from.value) from.value = get7DaysAgoStr();
    if (to && !to.value) to.value = getLocalDateStr();
  }

  function populateNameFilter(id, records = []) {
    const select = document.getElementById(id);
    if (!select || !isAdmin()) return;
    const previous = select.value;
    const map = new Map();
    (Array.isArray(karyawanList) ? karyawanList : []).forEach(row => {
      const key = row.id_karyawan || row.id || row.nama;
      if (key) map.set(key, row.nama || key);
    });
    records.forEach(row => {
      const key = row.id_karyawan || row.user_uid || row.nama;
      if (key) map.set(key, row.nama || key);
    });
    select.innerHTML = '<option value="">Semua Karyawan</option>' + [...map].sort((a,b)=>a[1].localeCompare(b[1])).map(([key,name])=>`<option value="${esc(key)}">${esc(name)}</option>`).join('');
    if ([...select.options].some(option => option.value === previous)) select.value = previous;
  }

  function setRoleVisibility() {
    document.querySelectorAll('.sales-admin-filter,.cooking-admin-filter,.sales-admin-col,.cooking-admin-col').forEach(el => {
      el.style.display = isAdmin() ? '' : 'none';
    });
  }

  window.initializeOperationalPages = function () {
    setRoleVisibility();
    window.prepareSalesForm();
    window.prepareCookingForm();
    ['sales-history','ranking','cooking-history'].forEach(setDefaultRange);
    populateNameFilter('sales-history-nama');
    populateNameFilter('cooking-history-nama');
  };

  window.prepareSalesForm = function () {
    const name = document.getElementById('penjualan-nama');
    const date = document.getElementById('penjualan-tanggal');
    const rows = document.getElementById('penjualan-items');
    if (name) name.value = currentProfile?.nama || '';
    if (date && !date.value) date.value = getLocalDateStr();
    if (rows && !rows.children.length) window.addSalesItemRow('', 1);
  };

  window.addSalesItemRow = function (menu = '', qty = 1, targetId = 'penjualan-items') {
    const container = document.getElementById(targetId);
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'operation-item-row sales-item-row';
    row.innerHTML = `<select class="input-field sales-menu" onchange="updateSalesTotal('${targetId}')">${menuOptions(menu)}</select><input type="number" min="1" step="1" value="${Math.max(1,parseInt(qty)||1)}" class="input-field sales-qty text-center" oninput="updateSalesTotal('${targetId}')"><button type="button" class="h-10 w-10 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50" onclick="this.closest('.sales-item-row').remove();updateSalesTotal('${targetId}')"><i class="fas fa-trash-alt text-xs"></i></button>`;
    container.appendChild(row);
    window.updateSalesTotal(targetId);
  };

  function readSalesItems(targetId) {
    const rows = [...document.querySelectorAll(`#${targetId} .sales-item-row`)];
    const merged = new Map();
    rows.forEach(row => {
      const menu = row.querySelector('.sales-menu')?.value;
      const qty = parseInt(row.querySelector('.sales-qty')?.value);
      if (!menu || !MENU_PRICES[menu] || !Number.isInteger(qty) || qty < 1) return;
      merged.set(menu, (merged.get(menu) || 0) + qty);
    });
    return [...merged].map(([menu, qty]) => ({ menu, qty, harga_satuan: MENU_PRICES[menu], subtotal: MENU_PRICES[menu] * qty }));
  }

  window.updateSalesTotal = function (targetId = 'penjualan-items') {
    const items = readSalesItems(targetId);
    const total = items.reduce((sum, item) => sum + item.subtotal, 0);
    const outputId = targetId === 'edit-sales-items' ? 'edit-sales-total' : 'penjualan-total';
    const output = document.getElementById(outputId);
    if (output) output.textContent = rupiah(total);
    return total;
  };

  window.submitSales = async function () {
    const date = document.getElementById('penjualan-tanggal')?.value;
    const items = readSalesItems('penjualan-items');
    if (!date) return showToast('warning', 'Tanggal penjualan wajib diisi.');
    if (!items.length) return showToast('warning', 'Tambahkan minimal satu item dengan qty yang valid.');
    const total = items.reduce((sum, item) => sum + item.subtotal, 0);
    const btn = document.getElementById('btn-submit-penjualan');
    if (btn) btn.disabled = true;
    try {
      const result = await apiRequest('/api/sales/transaction', {
        method: 'POST',
        body: JSON.stringify({
        tanggal: date,
          items: items.map(({menu,qty}) => ({menu,qty}))
        })
      });
      if (!Cache.stok) Cache.stok = [];
      result.stocks.forEach(stock => {
        const cached = Cache.stok.find(row => row.lokasi === 'Kulkas' && row.nama_barang === stock.barang);
        if (cached) cached.jumlah = stock.jumlah;
        else Cache.stok.push({lokasi:'Kulkas',nama_barang:stock.barang,jumlah:stock.jumlah});
      });
      Cache.stokTs = Date.now();
      Cache.invalidateLog();
      sendToDiscord('penjualan', {
        embeds: [{
          author:{name:'Mangku Resto • Sistem Penjualan'},
          title: '🧾 Rekap Penjualan Baru', description:'💰 Transaksi berhasil dicatat.', color: 2463441,
          fields: [
            {name:'👤 Nama',value:currentProfile.nama||currentUser.email,inline:true},
            {name:'📅 Tanggal',value:date,inline:true},
            {name:'💵 Total',value:rupiah(total),inline:true},
            {name:'🛒 Rincian Item',value:items.map(x=>`• ${x.menu} × ${x.qty} — ${rupiah(x.subtotal)}`).join('\n')}
          ], timestamp:new Date().toISOString()
        }]
      });
      showToast('success', `Penjualan ${rupiah(total)} berhasil disimpan.`);
      const container = document.getElementById('penjualan-items');
      container.innerHTML = '';
      window.addSalesItemRow('', 1);
      document.getElementById('penjualan-tanggal').value = getLocalDateStr();
    } catch (error) {
      showToast('error', 'Gagal menyimpan penjualan: ' + error.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  };

  async function fetchSales() {
    const source = isAdmin()
      ? collection(db, 'penjualan')
      : query(collection(db, 'penjualan'), where('user_uid', '==', currentUser.uid), limit(500));
    const snap = await getDocs(source);
    return snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
  }

  window.loadSalesHistory = async function () {
    const tbody = document.getElementById('sales-history-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-10 text-slate-400"><i class="fas fa-spinner fa-spin"></i> Memuat...</td></tr>';
    try {
      let rows = await fetchSales();
      populateNameFilter('sales-history-nama', rows);
      const from = document.getElementById('sales-history-dari')?.value;
      const to = document.getElementById('sales-history-sampai')?.value;
      const employee = isAdmin() ? document.getElementById('sales-history-nama')?.value : '';
      rows = rows.filter(row => (!from || row.tanggal >= from) && (!to || row.tanggal <= to));
      if (employee) rows = rows.filter(row => (row.id_karyawan || row.user_uid || row.nama) === employee);
      rows.sort((a,b) => (b.tanggal||'').localeCompare(a.tanggal||'') || timestampValue(b.created_at)-timestampValue(a.created_at));
      salesHistoryRows = rows;
      renderSalesHistory(rows);
    } catch (error) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center py-10 text-rose-500">Gagal: ${esc(error.message)}</td></tr>`;
    }
  };

  function renderSalesHistory(rows) {
    const tbody = document.getElementById('sales-history-tbody');
    const total = rows.reduce((sum,row)=>sum+Number(row.total_nominal||0),0);
    document.getElementById('sales-history-count').textContent = rows.length;
    document.getElementById('sales-history-total').textContent = rupiah(total);
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-10 text-slate-400">Belum ada data penjualan.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(row => {
      const items = (row.items || []).map(item => `<div class="whitespace-nowrap"><strong>${esc(item.menu)}</strong> ${Number(item.qty)||0}x <span class="text-slate-400">(${rupiah(item.subtotal)})</span></div>`).join('');
      const actions = isAdmin() ? `<td><div class="flex gap-2"><button onclick='openSalesEdit(${JSON.stringify(row.id)})' class="px-3 py-1.5 rounded-lg bg-sky-50 text-sky-700 font-bold text-xs border border-sky-200"><i class="fas fa-pencil mr-1"></i>Edit</button><button onclick='deleteSalesRecord(${JSON.stringify(row.id)})' class="px-3 py-1.5 rounded-lg bg-rose-50 text-rose-600 font-bold text-xs border border-rose-200"><i class="fas fa-trash-alt mr-1"></i>Hapus</button></div></td>` : '';
      return `<tr><td class="font-semibold">${esc(row.tanggal||'-')}</td><td>${esc(row.nama||'-')}</td><td>${items||'-'}</td><td class="font-black text-sky-700 whitespace-nowrap">${rupiah(row.total_nominal)}</td>${actions}</tr>`;
    }).join('');
  }

  window.openSalesEdit = function (id) {
    if (!isAdmin()) return showToast('error', 'Hanya admin yang dapat mengedit.');
    const row = salesHistoryRows.find(item => item.id === id);
    if (!row) return showToast('error', 'Data penjualan tidak ditemukan.');
    editingSalesId = id;
    document.getElementById('edit-sales-owner').textContent = row.nama || '-';
    document.getElementById('edit-sales-date').value = dateValue(row.tanggal);
    const container = document.getElementById('edit-sales-items');
    container.innerHTML = '';
    (row.items || []).forEach(item => window.addSalesItemRow(item.menu, item.qty, 'edit-sales-items'));
    if (!container.children.length) window.addSalesItemRow('Paket Biasa', 1, 'edit-sales-items');
    showEl('edit-sales-modal');
  };

  window.closeSalesEdit = function () { editingSalesId = ''; hideEl('edit-sales-modal'); };

  window.saveSalesEdit = async function () {
    if (!isAdmin() || !editingSalesId) return;
    const items = readSalesItems('edit-sales-items');
    if (!items.length) return showToast('warning', 'Minimal satu item wajib diisi.');
    const date = document.getElementById('edit-sales-date').value;
    if (!date) return showToast('warning', 'Tanggal wajib diisi.');
    const total = items.reduce((sum,item)=>sum+item.subtotal,0);
    try {
      await updateDoc(doc(db,'penjualan',editingSalesId), { tanggal:date, items, total_nominal:total, updated_at:serverTimestamp(), updated_by:currentUser.uid });
      showToast('success','Data penjualan berhasil diperbarui.');
      window.closeSalesEdit();
      await window.loadSalesHistory();
    } catch (error) { showToast('error','Gagal memperbarui: '+error.message); }
  };

  window.deleteSalesRecord = function (id) {
    if (!isAdmin()) return showToast('error','Hanya admin yang dapat menghapus.');
    openActionConfirm({ title:'Hapus Penjualan?', message:'Data penjualan ini akan dihapus permanen.', confirmText:'Ya, Hapus', variant:'danger', onConfirm:async()=>{
      await deleteDoc(doc(db,'penjualan',id));
      showToast('success','Data penjualan dihapus.');
      await window.loadSalesHistory();
    }});
  };

  window.loadSalesRanking = async function () {
    const tbody = document.getElementById('ranking-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" class="text-center py-10 text-slate-400"><i class="fas fa-spinner fa-spin"></i> Memuat...</td></tr>';
    try {
      const from = document.getElementById('ranking-dari')?.value;
      const to = document.getElementById('ranking-sampai')?.value;
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const {rows=[]} = await apiRequest(`/api/sales/ranking?${params}`);
      if(!rows.length){tbody.innerHTML='<tr><td colspan="4" class="text-center py-10 text-slate-400">Belum ada data pada periode ini.</td></tr>';return;}
      const medals=['bg-blue-100 text-blue-700','bg-slate-200 text-slate-700','bg-sky-100 text-sky-700'];
      tbody.innerHTML=rows.map((row,index)=>`<tr><td class="text-center"><span class="rank-medal ${medals[index]||'bg-sky-50 text-sky-700'}">${index+1}</span></td><td class="font-bold text-slate-900">${esc(row.nama)}</td><td class="text-center font-semibold">${row.transaksi}</td><td class="font-black text-sky-700">${rupiah(row.total)}</td></tr>`).join('');
    } catch(error){tbody.innerHTML=`<tr><td colspan="4" class="text-center py-10 text-rose-500">Gagal: ${esc(error.message)}</td></tr>`;}
  };

  window.prepareCookingForm = function () {
    const name=document.getElementById('masak-nama'), date=document.getElementById('masak-tanggal');
    if(name) name.value=currentProfile?.nama||'';
    if(date&&!date.value) date.value=getLocalDateStr();
    const rows=document.getElementById('masak-items');
    if(rows&&!rows.children.length)window.addCookingItemRow('',1);
  };

  window.addCookingItemRow=function(item='',qty=1,targetId='masak-items'){
    const container=document.getElementById(targetId);if(!container)return;
    const row=document.createElement('div');row.className='operation-item-row cooking-item-row';
    row.innerHTML=`<select class="input-field cooking-item">${cookingOptions(item)}</select><input type="number" min="1" step="1" value="${Math.max(1,parseInt(qty)||1)}" class="input-field cooking-qty text-center"><button type="button" class="h-10 w-10 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50" onclick="this.closest('.cooking-item-row').remove()"><i class="fas fa-trash-alt text-xs"></i></button>`;
    container.appendChild(row);
  };

  function readCookingItems(targetId='masak-items'){
    const merged=new Map();
    document.querySelectorAll(`#${targetId} .cooking-item-row`).forEach(row=>{
      const item=row.querySelector('.cooking-item')?.value,qty=parseInt(row.querySelector('.cooking-qty')?.value);
      if(COOKING_ITEMS.includes(item)&&Number.isInteger(qty)&&qty>0)merged.set(item,(merged.get(item)||0)+qty);
    });
    return[...merged].map(([item,qty])=>({item,qty}));
  }

  function normalizeCookingItems(row){
    if(Array.isArray(row.items)&&row.items.length)return row.items.filter(x=>COOKING_ITEMS.includes(x.item)&&Number(x.qty)>0).map(x=>({item:x.item,qty:Number(x.qty)}));
    return COOKING_ITEMS.includes(row.item)&&Number(row.qty)>0?[{item:row.item,qty:Number(row.qty)}]:[];
  }

  async function addCookingToInventory(items){
    const lokasi='Kulkas';
    const inventoryItems=items.map(entry=>({barang:entry.item,jumlah:entry.qty}));
    const result=await apiRequest('/api/inventory/transaction',{method:'POST',body:JSON.stringify({lokasi,tipe:'Laporan Masak',items:inventoryItems})});
    if(!Cache.stok)Cache.stok=[];
    Cache.stokTs=Date.now();
    if(!INV_ITEMS[lokasi])INV_ITEMS[lokasi]=[];
    for(const entry of items){
      if(!INV_ITEMS[lokasi].includes(entry.item))INV_ITEMS[lokasi].push(entry.item);
      const cached=Cache.stok.find(s=>s.lokasi===lokasi&&s.nama_barang===entry.item);
      const newStock=result.stocks.find(s=>s.barang===entry.item)?.jumlah||0;
      if(cached)cached.jumlah=newStock;else Cache.stok.push({lokasi,nama_barang:entry.item,jumlah:newStock});
    }
    Cache.invalidateLog();
  }

  window.submitCookingReport = async function () {
    const date=document.getElementById('masak-tanggal')?.value;
    const items=readCookingItems();
    if(!date||!items.length) return showToast('warning','Lengkapi tanggal dan minimal satu item dengan qty yang benar.');
    const btn=document.getElementById('btn-submit-masak'); if(btn)btn.disabled=true;
    try{
      await addDoc(collection(db,'laporan_masak'),{user_uid:currentUser.uid,id_karyawan:currentProfile.id_karyawan||'',nama:currentProfile.nama||currentUser.email,tanggal:date,items,created_at:serverTimestamp()});
      await addCookingToInventory(items);
      sendToDiscord('laporan_masak',{embeds:[{author:{name:'Mangku Resto • Dapur'},title:'👨‍🍳 Laporan Masak Baru',description:'✅ Hasil masak telah ditambahkan ke Gudang Kulkas.',color:2463441,fields:[{name:'👤 Nama',value:currentProfile.nama||currentUser.email,inline:true},{name:'📅 Tanggal',value:date,inline:true},{name:'🍱 Hasil Masak',value:items.map(x=>`• ${x.item} × ${x.qty}`).join('\n')}],timestamp:new Date().toISOString()}]});
      showToast('success',`${items.length} item laporan masak disimpan dan ditambahkan ke stok.`);
      document.getElementById('masak-tanggal').value=getLocalDateStr();document.getElementById('masak-items').innerHTML='';window.addCookingItemRow('',1);
    }catch(error){showToast('error','Gagal menyimpan laporan: '+error.message);}finally{if(btn)btn.disabled=false;}
  };

  async function fetchCooking(){
    const source=isAdmin()?collection(db,'laporan_masak'):query(collection(db,'laporan_masak'),where('user_uid','==',currentUser.uid),limit(500));
    const snap=await getDocs(source);return snap.docs.map(d=>({id:d.id,...d.data()}));
  }

  window.loadCookingHistory = async function () {
    const tbody=document.getElementById('cooking-history-tbody');if(!tbody)return;
    tbody.innerHTML='<tr><td colspan="5" class="text-center py-10 text-slate-400"><i class="fas fa-spinner fa-spin"></i> Memuat...</td></tr>';
    try{
      let rows=await fetchCooking(); populateNameFilter('cooking-history-nama',rows);
      const from=document.getElementById('cooking-history-dari')?.value,to=document.getElementById('cooking-history-sampai')?.value;
      const employee=isAdmin()?document.getElementById('cooking-history-nama')?.value:'';
      rows=rows.filter(row=>(!from||row.tanggal>=from)&&(!to||row.tanggal<=to));
      if(employee)rows=rows.filter(row=>(row.id_karyawan||row.user_uid||row.nama)===employee);
      rows.sort((a,b)=>(b.tanggal||'').localeCompare(a.tanggal||'')||timestampValue(b.created_at)-timestampValue(a.created_at));
      cookingHistoryRows=rows; renderCookingHistory(rows);
    }catch(error){tbody.innerHTML=`<tr><td colspan="5" class="text-center py-10 text-rose-500">Gagal: ${esc(error.message)}</td></tr>`;}
  };

  function renderCookingHistory(rows){
    const tbody=document.getElementById('cooking-history-tbody');
    if(!rows.length){tbody.innerHTML='<tr><td colspan="5" class="text-center py-10 text-slate-400">Belum ada laporan masak.</td></tr>';return;}
    tbody.innerHTML=rows.map(row=>{
      const items=normalizeCookingItems(row);
      const actions=isAdmin()?`<td><div class="flex gap-2"><button onclick='openCookingEdit(${JSON.stringify(row.id)})' class="px-3 py-1.5 rounded-lg bg-sky-50 text-sky-700 font-bold text-xs border border-sky-200"><i class="fas fa-pencil mr-1"></i>Edit</button><button onclick='deleteCookingRecord(${JSON.stringify(row.id)})' class="px-3 py-1.5 rounded-lg bg-rose-50 text-rose-600 font-bold text-xs border border-rose-200"><i class="fas fa-trash-alt mr-1"></i>Hapus</button></div></td>`:'';
      return `<tr><td class="font-semibold">${esc(row.tanggal||'-')}</td><td>${esc(row.nama||'-')}</td><td class="font-bold">${items.map(x=>`<div>${esc(x.item)}</div>`).join('')||'-'}</td><td class="text-center font-black">${items.map(x=>`<div>${x.qty}x</div>`).join('')||'-'}</td>${actions}</tr>`;
    }).join('');
  }

  window.openCookingEdit=function(id){
    if(!isAdmin())return showToast('error','Hanya admin yang dapat mengedit.');
    const row=cookingHistoryRows.find(item=>item.id===id);if(!row)return showToast('error','Data tidak ditemukan.');
    editingCookingId=id;document.getElementById('edit-cooking-owner').textContent=row.nama||'-';document.getElementById('edit-cooking-date').value=dateValue(row.tanggal);const container=document.getElementById('edit-cooking-items');container.innerHTML='';normalizeCookingItems(row).forEach(x=>window.addCookingItemRow(x.item,x.qty,'edit-cooking-items'));if(!container.children.length)window.addCookingItemRow('Paket Biasa',1,'edit-cooking-items');showEl('edit-cooking-modal');
  };
  window.closeCookingEdit=function(){editingCookingId='';hideEl('edit-cooking-modal');};
  window.saveCookingEdit=async function(){
    if(!isAdmin()||!editingCookingId)return;
    const date=document.getElementById('edit-cooking-date').value,items=readCookingItems('edit-cooking-items');
    if(!date||!items.length)return showToast('warning','Data edit belum valid.');
    try{await updateDoc(doc(db,'laporan_masak',editingCookingId),{tanggal:date,items,updated_at:serverTimestamp(),updated_by:currentUser.uid});showToast('success','Laporan masak diperbarui.');window.closeCookingEdit();await window.loadCookingHistory();}catch(error){showToast('error','Gagal memperbarui: '+error.message);}
  };
  window.deleteCookingRecord=function(id){
    if(!isAdmin())return showToast('error','Hanya admin yang dapat menghapus.');
    openActionConfirm({title:'Hapus Laporan Masak?',message:'Laporan ini akan dihapus permanen.',confirmText:'Ya, Hapus',variant:'danger',onConfirm:async()=>{await deleteDoc(doc(db,'laporan_masak',id));showToast('success','Laporan masak dihapus.');await window.loadCookingHistory();}});
  };

  function injectEditModals(){
    if(document.getElementById('edit-sales-modal'))return;
    document.body.insertAdjacentHTML('beforeend',`
      <div id="edit-sales-modal" style="display:none" class="modal-backdrop"><div class="modal-card" style="max-width:620px"><div class="flex items-center justify-between mb-5"><div><p class="text-xs font-bold text-sky-600 uppercase">Admin</p><h3 class="text-lg font-extrabold">Edit Penjualan</h3><p id="edit-sales-owner" class="text-xs text-slate-400 mt-1"></p></div><button onclick="closeSalesEdit()" class="h-9 w-9 rounded-lg bg-slate-100"><i class="fas fa-times"></i></button></div><div class="space-y-4"><div><label class="mb-1.5 block text-sm font-semibold">Tanggal</label><input id="edit-sales-date" type="date" class="input-field"></div><div class="flex justify-between items-center"><label class="text-sm font-semibold">Item dan Qty</label><button onclick="addSalesItemRow('Paket Biasa',1,'edit-sales-items')" class="btn-secondary text-xs"><i class="fas fa-plus mr-1"></i>Tambah</button></div><div id="edit-sales-items" class="space-y-2 max-h-64 overflow-y-auto"></div><div class="rounded-xl bg-sky-50 p-3 flex justify-between"><span class="font-semibold">Total</span><strong id="edit-sales-total" class="text-sky-700">Rp 0</strong></div><div class="flex gap-3"><button onclick="closeSalesEdit()" class="btn-secondary flex-1">Batal</button><button onclick="saveSalesEdit()" class="btn-primary flex-1"><i class="fas fa-save mr-1"></i>Simpan</button></div></div></div></div>
      <div id="edit-cooking-modal" style="display:none" class="modal-backdrop"><div class="modal-card" style="max-width:560px"><div class="flex items-center justify-between mb-5"><div><p class="text-xs font-bold text-orange-600 uppercase">Admin</p><h3 class="text-lg font-extrabold">Edit Laporan Masak</h3><p id="edit-cooking-owner" class="text-xs text-slate-400 mt-1"></p></div><button onclick="closeCookingEdit()" class="h-9 w-9 rounded-lg bg-slate-100"><i class="fas fa-times"></i></button></div><div class="space-y-4"><div><label class="mb-1.5 block text-sm font-semibold">Tanggal</label><input id="edit-cooking-date" type="date" class="input-field"></div><div class="flex items-center justify-between"><label class="text-sm font-semibold">Item dan Qty</label><button onclick="addCookingItemRow('Paket Biasa',1,'edit-cooking-items')" class="btn-secondary text-xs"><i class="fas fa-plus mr-1"></i>Add Item</button></div><div id="edit-cooking-items" class="space-y-2 max-h-56 overflow-y-auto"></div><div class="flex gap-3"><button onclick="closeCookingEdit()" class="btn-secondary flex-1">Batal</button><button onclick="saveCookingEdit()" class="btn-primary flex-1"><i class="fas fa-save mr-1"></i>Simpan</button></div></div></div></div>`);
  }

  document.addEventListener('DOMContentLoaded', injectEditModals);
})();

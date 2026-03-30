/* ============================================================
   Sales Analytics Dashboard — app.js
   Reads data at runtime from CSV_DATA_URL below.
   ============================================================ */

// ── CONFIGURAZIONE PERCORSO CSV ──────────────────────────────
const DATA_URL = "./dataset_kpi_test_200_righe.csv";
// ────────────────────────────────────────────────────────────

// ── Stato globale ────────────────────────────────────────────
let rawData = [];
let filteredData = [];
let chartInstances = {};
let activeSection = 'overview';

// Palette fissa per i brand (max 8)
const BRAND_COLORS = [
  '#01696f','#da7101','#7a39bb','#a13544','#437a22','#006494','#d19900','#964219'
];

// ── Dark/Light toggle ────────────────────────────────────────
(function(){
  const t = document.querySelector('[data-theme-toggle]');
  const r = document.documentElement;
  let d = matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light';
  r.setAttribute('data-theme', d);
  updateToggleIcon(t, d);
  if(t) t.addEventListener('click', () => {
    d = d === 'dark' ? 'light' : 'dark';
    r.setAttribute('data-theme', d);
    updateToggleIcon(t, d);
    setTimeout(() => redrawAllCharts(), 100);
  });
  function updateToggleIcon(btn, theme) {
    if(!btn) return;
    btn.innerHTML = theme === 'dark'
      ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`
      : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
    btn.setAttribute('aria-label', `Passa a modalità ${theme === 'dark' ? 'chiara' : 'scura'}`);
  }
})();

// ── Parsing CSV ──────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const vals = line.split(',');
    const row = {};
    headers.forEach((h, i) => row[h] = (vals[i] || '').trim());
    // Derivati
    const d = new Date(row.data);
    row._date = d;
    row._year = d.getFullYear();
    row._month = d.getMonth() + 1;
    row._monthLabel = d.toLocaleDateString('it-IT', { month: 'short', year: '2-digit' });
    row._quarter = `Q${Math.ceil(row._month / 3)} ${row._year}`;
    row._importo = parseFloat(row.importo_fattura) || 0;
    row._finanziato = parseFloat(row.importo_finanziato) || 0;
    row._hasFinanziamento = row.finanziamento === 'SI';
    row._hasAssicurazione = row.pacchetto_assicurativo === 'SI';
    row._hasGaranzia = row.estensione_garanzia === 'SI';
    row._ratioFinanz = row._hasFinanziamento && row._importo > 0
      ? (row._finanziato / row._importo) * 100 : 0;
    return row;
  }).filter(r => !isNaN(r._date.getTime()));
}

// ── Caricamento dati ─────────────────────────────────────────
async function loadData() {
  showState('loading');
  try {
    const resp = await fetch(DATA_URL + '?nocache=' + Date.now());
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
    const text = await resp.text();
    if (!text.trim()) throw new Error('Il file CSV è vuoto.');
    rawData = parseCSV(text);
    if (rawData.length === 0) throw new Error('Nessuna riga valida trovata nel CSV.');
    populateFilters();
    applyFilters();
    hideState();
    updateLastUpdated();
  } catch(e) {
    showState('error', e.message);
  }
}

function showState(type, msg) {
  const overlay = document.getElementById('state-overlay');
  overlay.style.display = 'flex';
  if(type === 'loading') {
    overlay.innerHTML = `
      <div class="spinner"></div>
      <div>
        <div class="state-title">Caricamento dati…</div>
        <div class="state-body">Lettura di <code>${DATA_URL}</code></div>
      </div>`;
  } else {
    overlay.innerHTML = `
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="state-error" style="color:var(--color-notification)"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <div>
        <div class="state-title state-error">Errore nel caricamento</div>
        <div class="state-body">${msg}</div>
        <div class="state-body" style="margin-top:8px;color:var(--color-text-faint)">Verifica che il file CSV sia nella stessa cartella dell'HTML e ricarica la pagina.</div>
      </div>`;
  }
  document.getElementById('dashboard-content').style.display = 'none';
}

function hideState() {
  document.getElementById('state-overlay').style.display = 'none';
  document.getElementById('dashboard-content').style.display = 'block';
}

function updateLastUpdated() {
  const el = document.getElementById('last-updated');
  if(el) el.textContent = `${rawData.length} pratiche • ${new Date().toLocaleTimeString('it-IT', {hour:'2-digit',minute:'2-digit'})}`;
}

// ── Popola filtri ────────────────────────────────────────────
function populateFilters() {
  const brands = [...new Set(rawData.map(r => r.marca))].sort();
  const branches = [...new Set(rawData.map(r => r.filiale))].sort((a,b) => {
    const na = parseInt(a.replace(/\D/g,''));
    const nb = parseInt(b.replace(/\D/g,''));
    return na - nb;
  });
  const dates = rawData.map(r => r._date).sort((a,b) => a - b);
  const minDate = dates[0];
  const maxDate = dates[dates.length - 1];

  // Date
  const dStart = document.getElementById('filter-date-start');
  const dEnd   = document.getElementById('filter-date-end');
  dStart.value = toInputDate(minDate);
  dEnd.value   = toInputDate(maxDate);
  dStart.min = toInputDate(minDate); dStart.max = toInputDate(maxDate);
  dEnd.min   = toInputDate(minDate); dEnd.max   = toInputDate(maxDate);

  // Brand
  const fBrand = document.getElementById('filter-brand');
  fBrand.innerHTML = '<option value="">Tutte le marche</option>';
  brands.forEach(b => {
    const o = document.createElement('option');
    o.value = b; o.textContent = b;
    fBrand.appendChild(o);
  });

  // Filiale
  const fBranch = document.getElementById('filter-branch');
  fBranch.innerHTML = '<option value="">Tutte le filiali</option>';
  branches.forEach(b => {
    const o = document.createElement('option');
    o.value = b; o.textContent = b;
    fBranch.appendChild(o);
  });
}

function toInputDate(d) {
  return d.toISOString().split('T')[0];
}

// ── Applica filtri ───────────────────────────────────────────
function applyFilters() {
  const dateStart = document.getElementById('filter-date-start').value;
  const dateEnd   = document.getElementById('filter-date-end').value;
  const brand     = document.getElementById('filter-brand').value;
  const branch    = document.getElementById('filter-branch').value;

  filteredData = rawData.filter(r => {
    if(dateStart && r._date < new Date(dateStart)) return false;
    if(dateEnd   && r._date > new Date(dateEnd + 'T23:59:59')) return false;
    if(brand  && r.marca   !== brand)  return false;
    if(branch && r.filiale !== branch) return false;
    return true;
  });

  const countEl = document.getElementById('filter-record-count');
  if(countEl) {
    const pct = rawData.length > 0 ? Math.round(filteredData.length/rawData.length*100) : 0;
    countEl.innerHTML = `<span>${filteredData.length}</span> / ${rawData.length} pratiche (${pct}%)`;
  }

  renderAll();
}

function resetFilters() {
  populateFilters();
  applyFilters();
}

// ── Helpers aggregazione ─────────────────────────────────────
function groupBy(arr, key) {
  return arr.reduce((acc, r) => {
    const k = r[key];
    if(!acc[k]) acc[k] = [];
    acc[k].push(r);
    return acc;
  }, {});
}

function finRate(arr) {
  if(!arr.length) return 0;
  return arr.filter(r => r._hasFinanziamento).length / arr.length * 100;
}
function assRate(arr) {
  if(!arr.length) return 0;
  return arr.filter(r => r._hasAssicurazione).length / arr.length * 100;
}
function garRate(arr) {
  if(!arr.length) return 0;
  return arr.filter(r => r._hasGaranzia).length / arr.length * 100;
}
function sumFattura(arr) { return arr.reduce((s,r) => s + r._importo, 0); }
function avgFattura(arr) { return arr.length ? sumFattura(arr)/arr.length : 0; }
function avgFinanziato(arr) {
  const fin = arr.filter(r => r._hasFinanziamento);
  if(!fin.length) return 0;
  return fin.reduce((s,r) => s + r._finanziato, 0) / fin.length;
}

function fmt(n) {
  return new Intl.NumberFormat('it-IT', {style:'currency', currency:'EUR', maximumFractionDigits:0}).format(n);
}
function fmtPct(n) { return n.toFixed(1) + '%'; }
function fmtK(n) {
  if(n >= 1e6) return (n/1e6).toFixed(1) + 'M €';
  if(n >= 1e3) return (n/1e3).toFixed(0) + 'K €';
  return fmt(n);
}

// ── CSS var helper ────────────────────────────────────────────
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function getChartColors() {
  return [
    cssVar('--chart-1'), cssVar('--chart-2'), cssVar('--chart-3'),
    cssVar('--chart-4'), cssVar('--chart-5'), cssVar('--chart-6'),
    cssVar('--chart-7'), cssVar('--chart-8'),
  ];
}

// ── Chart.js defaults ─────────────────────────────────────────
function getChartDefaults() {
  return {
    color: cssVar('--color-text-muted'),
    borderColor: cssVar('--color-border'),
    font: { family: cssVar('--font-body'), size: 11 },
  };
}

function destroyChart(id) {
  if(chartInstances[id]) {
    chartInstances[id].destroy();
    delete chartInstances[id];
  }
}

// ── Render principale ─────────────────────────────────────────
function renderAll() {
  renderKPIs();
  if(activeSection === 'overview' || activeSection === 'all') renderOverview();
  if(activeSection === 'filiali'  || activeSection === 'all') renderFiliali();
  if(activeSection === 'servizi'  || activeSection === 'all') renderServizi();
  if(activeSection === 'brand'    || activeSection === 'all') renderBrand();
}

function redrawAllCharts() {
  const prev = activeSection;
  activeSection = 'all';
  if(filteredData.length) renderAll();
  activeSection = prev;
}

// ── KPI Cards ─────────────────────────────────────────────────
function renderKPIs() {
  const d = filteredData;
  const n = d.length;
  const fat = sumFattura(d);
  const ticket = n ? fat/n : 0;
  const pFin = finRate(d);
  const pAss = assRate(d);
  const pGar = garRate(d);

  animateKPI('kpi-pratiche',   n,       v => v.toLocaleString('it-IT'));
  animateKPI('kpi-fatturato',  fat,     v => fmtK(v));
  animateKPI('kpi-ticket',     ticket,  v => fmt(v));
  animateKPI('kpi-fin-pct',    pFin,    v => fmtPct(v));
  animateKPI('kpi-ass-pct',    pAss,    v => fmtPct(v));
  animateKPI('kpi-gar-pct',    pGar,    v => fmtPct(v));
}

function animateKPI(id, targetVal, formatter) {
  const el = document.getElementById(id);
  if(!el) return;
  el.classList.add('updating');
  setTimeout(() => {
    el.textContent = formatter(targetVal);
    el.classList.remove('updating');
  }, 120);
}

// ── Sezione 1: Overview ───────────────────────────────────────
function renderOverview() {
  renderTemporalChart();
}

function renderTemporalChart() {
  const d = filteredData;
  // Raggruppa per mese
  const byMonth = {};
  d.forEach(r => {
    const key = `${r._year}-${String(r._month).padStart(2,'0')}`;
    if(!byMonth[key]) byMonth[key] = { label: r._monthLabel, count: 0, fat: 0 };
    byMonth[key].count++;
    byMonth[key].fat += r._importo;
  });
  const sorted = Object.entries(byMonth).sort((a,b) => a[0].localeCompare(b[0]));
  const labels = sorted.map(([,v]) => v.label.charAt(0).toUpperCase() + v.label.slice(1));
  const counts = sorted.map(([,v]) => v.count);
  const fats   = sorted.map(([,v]) => v.fat);

  const ctx = document.getElementById('chart-temporal');
  if(!ctx) return;
  destroyChart('temporal');

  const colors = getChartColors();
  chartInstances['temporal'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Fatturato (€)',
          data: fats,
          borderColor: colors[0],
          backgroundColor: colors[0] + '18',
          fill: true,
          tension: 0.35,
          yAxisID: 'y',
          pointRadius: 4, pointHoverRadius: 6,
          borderWidth: 2,
        },
        {
          label: 'N° Pratiche',
          data: counts,
          borderColor: colors[1],
          backgroundColor: 'transparent',
          tension: 0.35,
          yAxisID: 'y1',
          pointRadius: 4, pointHoverRadius: 6,
          borderWidth: 2,
          borderDash: [4,3],
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true, position: 'top', labels: { color: cssVar('--color-text-muted'), boxWidth: 12, font: {size:11} } },
        tooltip: {
          callbacks: {
            label: ctx => {
              if(ctx.datasetIndex === 0) return ` Fatturato: ${fmt(ctx.raw)}`;
              return ` Pratiche: ${ctx.raw}`;
            }
          }
        }
      },
      scales: {
        x: { grid: { color: cssVar('--color-border') + '55' }, ticks: { color: cssVar('--color-text-muted'), font: {size:11} } },
        y: {
          type: 'linear', position: 'left',
          grid: { color: cssVar('--color-border') + '55' },
          ticks: { color: cssVar('--color-text-muted'), font:{size:11}, callback: v => fmtK(v) }
        },
        y1: {
          type: 'linear', position: 'right',
          grid: { drawOnChartArea: false },
          ticks: { color: cssVar('--color-text-muted'), font:{size:11} }
        },
      }
    }
  });

  // Insight
  const totFat = fats.reduce((a,b)=>a+b,0);
  const topMonth = sorted.reduce((best, cur) => cur[1].fat > best[1].fat ? cur : best, sorted[0]);
  document.getElementById('insight-temporal').innerHTML =
    `<strong>Andamento temporale:</strong> nel periodo selezionato sono state registrate <strong>${d.length}</strong> pratiche per un fatturato totale di <strong>${fmtK(totFat)}</strong>. Il mese con il maggiore fatturato è stato <strong>${topMonth ? topMonth[1].label : '—'}</strong> con <strong>${topMonth ? fmtK(topMonth[1].fat) : '—'}</strong>.`;
}

// ── Sezione 2: Filiali ────────────────────────────────────────
function renderFiliali() {
  renderRankingFiliali();
  renderFinFiliale();
  renderFinMarca();
}

function renderRankingFiliali() {
  const byFiliale = groupBy(filteredData, 'filiale');
  const list = Object.entries(byFiliale).map(([k, arr]) => ({
    name: k,
    count: arr.length,
    fat: sumFattura(arr),
  })).sort((a, b) => b.count - a.count);

  const maxCount = list[0]?.count || 1;
  const maxFat   = Math.max(...list.map(r => r.fat)) || 1;

  // Tabella pratiche
  const tbodyP = document.getElementById('ranking-pratiche-body');
  if(tbodyP) {
    tbodyP.innerHTML = list.map((r, i) => `
      <tr>
        <td><span class="rank-num ${i===0?'gold':i===1?'silver':i===2?'bronze':''}">${i+1}</span></td>
        <td>${r.name}</td>
        <td>
          <div class="bar-cell">
            <div class="mini-bar-track"><div class="mini-bar-fill" style="width:${r.count/maxCount*100}%"></div></div>
            <span style="font-variant-numeric:tabular-nums;min-width:24px;text-align:right">${r.count}</span>
          </div>
        </td>
        <td>${fmtK(r.fat)}</td>
      </tr>`).join('');
  }

  // Tabella fatturato
  const sorted2 = [...list].sort((a,b) => b.fat - a.fat);
  const tbodyF = document.getElementById('ranking-fatturato-body');
  if(tbodyF) {
    tbodyF.innerHTML = sorted2.map((r, i) => `
      <tr>
        <td><span class="rank-num ${i===0?'gold':i===1?'silver':i===2?'bronze':''}">${i+1}</span></td>
        <td>${r.name}</td>
        <td>
          <div class="bar-cell">
            <div class="mini-bar-track"><div class="mini-bar-fill" style="width:${r.fat/maxFat*100}%;background:var(--color-orange)"></div></div>
            <span style="font-variant-numeric:tabular-nums;min-width:60px;text-align:right">${fmtK(r.fat)}</span>
          </div>
        </td>
        <td>${r.count}</td>
      </tr>`).join('');
  }

  // Insight ranking
  const top1P = list[0];
  const top1F = sorted2[0];
  document.getElementById('insight-ranking').innerHTML =
    `<strong>Ranking filiali:</strong> la filiale con più pratiche è <strong>${top1P?.name||'—'}</strong> (${top1P?.count||0} contratti), mentre quella con il fatturato maggiore è <strong>${top1F?.name||'—'}</strong> con <strong>${top1F ? fmtK(top1F.fat) : '—'}</strong>.`;
}

function renderFinFiliale() {
  const byFiliale = groupBy(filteredData, 'filiale');
  const list = Object.entries(byFiliale)
    .map(([k, arr]) => ({ name: k, rate: finRate(arr), count: arr.length }))
    .sort((a, b) => b.rate - a.rate);

  const ctx = document.getElementById('chart-fin-filiale');
  if(!ctx) return;
  destroyChart('fin-filiale');

  const colors = getChartColors();
  chartInstances['fin-filiale'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: list.map(r => r.name),
      datasets: [{
        label: '% Finanziamento',
        data: list.map(r => +r.rate.toFixed(1)),
        backgroundColor: list.map(r => r.rate >= 50 ? colors[0] + 'cc' : colors[1] + 'cc'),
        borderColor: list.map(r => r.rate >= 50 ? colors[0] : colors[1]),
        borderWidth: 1,
        borderRadius: 4,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` Tasso finanziamento: ${fmtPct(ctx.raw)} (${list[ctx.dataIndex].count} pratiche)`
          }
        }
      },
      scales: {
        x: {
          min: 0, max: 100,
          grid: { color: cssVar('--color-border') + '55' },
          ticks: { color: cssVar('--color-text-muted'), font:{size:11}, callback: v => v + '%' }
        },
        y: { ticks: { color: cssVar('--color-text-muted'), font:{size:11} }, grid: { display: false } }
      }
    }
  });

  const avg = finRate(filteredData);
  const topFin = list[0];
  document.getElementById('insight-fin-filiale').innerHTML =
    `<strong>Finanziamento per filiale:</strong> la media di penetrazione è <strong>${fmtPct(avg)}</strong>. La filiale con il tasso più alto è <strong>${topFin?.name||'—'}</strong> con <strong>${topFin ? fmtPct(topFin.rate) : '—'}</strong> delle pratiche finanziate.`;
}

function renderFinMarca() {
  const byMarca = groupBy(filteredData, 'marca');
  const list = Object.entries(byMarca)
    .map(([k, arr]) => ({ name: k, rate: finRate(arr), count: arr.length }))
    .sort((a, b) => b.rate - a.rate);

  const ctx = document.getElementById('chart-fin-marca');
  if(!ctx) return;
  destroyChart('fin-marca');

  const colors = getChartColors();
  chartInstances['fin-marca'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: list.map(r => r.name),
      datasets: [{
        label: '% Finanziamento',
        data: list.map(r => +r.rate.toFixed(1)),
        backgroundColor: list.map((_, i) => colors[i % colors.length] + 'cc'),
        borderColor: list.map((_, i) => colors[i % colors.length]),
        borderWidth: 1,
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${fmtPct(ctx.raw)} (${list[ctx.dataIndex].count} pratiche)`
          }
        }
      },
      scales: {
        x: { ticks: { color: cssVar('--color-text-muted'), font:{size:11} }, grid: { display:false } },
        y: {
          min: 0, max: 100,
          grid: { color: cssVar('--color-border') + '55' },
          ticks: { color: cssVar('--color-text-muted'), font:{size:11}, callback: v => v + '%' }
        }
      }
    }
  });

  const topM = list[0]; const botM = list[list.length-1];
  document.getElementById('insight-fin-marca').innerHTML =
    `<strong>Finanziamento per marca:</strong> <strong>${topM?.name||'—'}</strong> guida con <strong>${topM ? fmtPct(topM.rate) : '—'}</strong> di penetrazione. <strong>${botM?.name||'—'}</strong> ha il tasso più basso (<strong>${botM ? fmtPct(botM.rate) : '—'}</strong>).`;
}

// ── Sezione 3: Servizi Accessori ──────────────────────────────
function renderServizi() {
  renderValoriMedi();
  renderPenetrazioneTotale();
  renderPenetrazioneFiliale();
  renderPenetrazioneMarca();
}

function renderValoriMedi() {
  const d = filteredData;
  const avgFat = avgFattura(d);
  const avgFin = avgFinanziato(d);
  const finRows = d.filter(r => r._hasFinanziamento);
  const avgRatio = finRows.length
    ? finRows.reduce((s,r) => s + r._ratioFinanz, 0) / finRows.length : 0;

  const el = document.getElementById('valori-medi-content');
  if(!el) return;

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:var(--space-4);text-align:center;">
      <div style="padding:var(--space-5);background:var(--color-surface-offset);border-radius:var(--radius-lg);border:1px solid var(--color-border)">
        <div style="font-size:var(--text-xs);font-weight:600;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:var(--space-2)">Fattura media</div>
        <div style="font-size:var(--text-xl);font-weight:800;letter-spacing:-.03em;font-variant-numeric:tabular-nums lining-nums;color:var(--color-text)">${fmt(avgFat)}</div>
        <div style="font-size:var(--text-xs);color:var(--color-text-faint);margin-top:var(--space-1)">su tutte le pratiche</div>
      </div>
      <div style="padding:var(--space-5);background:var(--color-surface-offset);border-radius:var(--radius-lg);border:1px solid var(--color-border)">
        <div style="font-size:var(--text-xs);font-weight:600;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:var(--space-2)">Finanziato medio</div>
        <div style="font-size:var(--text-xl);font-weight:800;letter-spacing:-.03em;font-variant-numeric:tabular-nums lining-nums;color:var(--chart-2)">${fmt(avgFin)}</div>
        <div style="font-size:var(--text-xs);color:var(--color-text-faint);margin-top:var(--space-1)">solo pratiche finanziate (${finRows.length})</div>
      </div>
      <div style="padding:var(--space-5);background:var(--color-surface-offset);border-radius:var(--radius-lg);border:1px solid var(--color-border)">
        <div style="font-size:var(--text-xs);font-weight:600;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:var(--space-2)">Copertura media</div>
        <div style="font-size:var(--text-xl);font-weight:800;letter-spacing:-.03em;font-variant-numeric:tabular-nums lining-nums;color:var(--chart-3)">${fmtPct(avgRatio)}</div>
        <div style="font-size:var(--text-xs);color:var(--color-text-faint);margin-top:var(--space-1)">finanziato / fattura</div>
      </div>
    </div>
    <div class="insight-box" style="margin-top:var(--space-4)">
      <strong>Valore medio:</strong> le pratiche finanziate coprono in media il <strong>${fmtPct(avgRatio)}</strong> del valore della fattura. Il ticket medio generale è <strong>${fmt(avgFat)}</strong>, mentre l'importo medio finanziato è <strong>${fmt(avgFin)}</strong>.
    </div>`;
}

function renderPenetrazioneTotale() {
  const d = filteredData;
  const items = [
    { label: 'Finanziamento', val: finRate(d), color: 'var(--chart-1)' },
    { label: 'Pacchetto assicurativo', val: assRate(d), color: 'var(--chart-2)' },
    { label: 'Estensione garanzia',    val: garRate(d), color: 'var(--chart-3)' },
  ];

  const el = document.getElementById('pene-totale-content');
  if(!el) return;

  el.innerHTML = `<div class="pene-list">` +
    items.map(item => `
    <div class="pene-row">
      <div class="pene-row-header">
        <span class="pene-row-label">${item.label}</span>
        <span class="pene-row-value" style="color:${item.color}">${fmtPct(item.val)}</span>
      </div>
      <div class="pene-track">
        <div class="pene-fill" style="width:${item.val}%;background:${item.color}"></div>
      </div>
    </div>`).join('') + `</div>`;

  // Donut chart
  const ctx = document.getElementById('chart-pene-donut');
  if(ctx) {
    destroyChart('pene-donut');
    const colors = getChartColors();
    const n = filteredData.length;
    const nFin = filteredData.filter(r => r._hasFinanziamento).length;
    const nAss = filteredData.filter(r => r._hasAssicurazione).length;
    const nGar = filteredData.filter(r => r._hasGaranzia).length;

    chartInstances['pene-donut'] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Finanziamento', 'Assicurazione', 'Garanzia'],
        datasets: [{
          data: [nFin, nAss, nGar],
          backgroundColor: [colors[0] + 'dd', colors[1] + 'dd', colors[2] + 'dd'],
          borderColor: [colors[0], colors[1], colors[2]],
          borderWidth: 2,
          hoverOffset: 6,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => {
                const pct = n > 0 ? (ctx.raw/n*100).toFixed(1) : 0;
                return ` ${ctx.raw} pratiche (${pct}%)`;
              }
            }
          }
        }
      }
    });
  }
}

function renderPenetrazioneFiliale() {
  const byF = groupBy(filteredData, 'filiale');
  const list = Object.entries(byF)
    .map(([k, arr]) => ({ name: k, fin: finRate(arr), ass: assRate(arr), gar: garRate(arr) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'it', { numeric: true }));

  const ctx = document.getElementById('chart-pene-filiale');
  if(!ctx) return;
  destroyChart('pene-filiale');

  const colors = getChartColors();
  chartInstances['pene-filiale'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: list.map(r => r.name),
      datasets: [
        { label: 'Finanziamento', data: list.map(r => +r.fin.toFixed(1)), backgroundColor: colors[0]+'cc', borderColor: colors[0], borderWidth:1, borderRadius:3 },
        { label: 'Assicurazione', data: list.map(r => +r.ass.toFixed(1)), backgroundColor: colors[1]+'cc', borderColor: colors[1], borderWidth:1, borderRadius:3 },
        { label: 'Garanzia',      data: list.map(r => +r.gar.toFixed(1)), backgroundColor: colors[2]+'cc', borderColor: colors[2], borderWidth:1, borderRadius:3 },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'top', labels: { color: cssVar('--color-text-muted'), boxWidth:10, font:{size:11} } },
        tooltip: {
          callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmtPct(ctx.raw)}` }
        }
      },
      scales: {
        x: { ticks: { color: cssVar('--color-text-muted'), font:{size:10}, maxRotation:45 }, grid: { display:false } },
        y: { min:0, max:100, grid: { color: cssVar('--color-border')+'55' }, ticks: { color: cssVar('--color-text-muted'), font:{size:11}, callback: v => v+'%' } }
      }
    }
  });
}

function renderPenetrazioneMarca() {
  const byM = groupBy(filteredData, 'marca');
  const list = Object.entries(byM)
    .map(([k, arr]) => ({ name: k, fin: finRate(arr), ass: assRate(arr), gar: garRate(arr) }))
    .sort((a,b) => a.name.localeCompare(b.name));

  const ctx = document.getElementById('chart-pene-marca');
  if(!ctx) return;
  destroyChart('pene-marca');

  const colors = getChartColors();
  chartInstances['pene-marca'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: list.map(r => r.name),
      datasets: [
        { label: 'Finanziamento', data: list.map(r => +r.fin.toFixed(1)), backgroundColor: colors[0]+'cc', borderColor: colors[0], borderWidth:1, borderRadius:3 },
        { label: 'Assicurazione', data: list.map(r => +r.ass.toFixed(1)), backgroundColor: colors[1]+'cc', borderColor: colors[1], borderWidth:1, borderRadius:3 },
        { label: 'Garanzia',      data: list.map(r => +r.gar.toFixed(1)), backgroundColor: colors[2]+'cc', borderColor: colors[2], borderWidth:1, borderRadius:3 },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'top', labels: { color: cssVar('--color-text-muted'), boxWidth:10, font:{size:11} } },
        tooltip: {
          callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmtPct(ctx.raw)}` }
        }
      },
      scales: {
        x: { ticks: { color: cssVar('--color-text-muted'), font:{size:11} }, grid: { display:false } },
        y: { min:0, max:100, grid: { color: cssVar('--color-border')+'55' }, ticks: { color: cssVar('--color-text-muted'), font:{size:11}, callback: v => v+'%' } }
      }
    }
  });
}

// ── Sezione 4: Brand Mix ──────────────────────────────────────
let brandMixMetric = 'count'; // 'count' | 'fat'

function renderBrand() {
  renderBrandMixChart();
  renderBrandDonut();
}

function renderBrandMixChart() {
  const byFiliale = groupBy(filteredData, 'filiale');
  const brands = [...new Set(filteredData.map(r => r.marca))].sort();
  const filiali = Object.keys(byFiliale).sort((a,b) => a.localeCompare(b,'it',{numeric:true}));

  const colors = getChartColors();
  const datasets = brands.map((brand, i) => ({
    label: brand,
    data: filiali.map(f => {
      const arr = byFiliale[f] || [];
      const brandArr = arr.filter(r => r.marca === brand);
      if(brandMixMetric === 'fat') {
        const tot = sumFattura(arr);
        return tot > 0 ? +(sumFattura(brandArr)/tot*100).toFixed(1) : 0;
      } else {
        return arr.length > 0 ? +(brandArr.length/arr.length*100).toFixed(1) : 0;
      }
    }),
    backgroundColor: colors[i % colors.length] + 'dd',
    borderColor: colors[i % colors.length],
    borderWidth: 1,
    borderRadius: 2,
  }));

  const ctx = document.getElementById('chart-brand-mix');
  if(!ctx) return;
  destroyChart('brand-mix');

  chartInstances['brand-mix'] = new Chart(ctx, {
    type: 'bar',
    data: { labels: filiali, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true, ticks: { color: cssVar('--color-text-muted'), font:{size:10}, maxRotation:45 }, grid: { display:false } },
        y: { stacked: true, min:0, max:100,
          grid: { color: cssVar('--color-border')+'55' },
          ticks: { color: cssVar('--color-text-muted'), font:{size:11}, callback: v => v+'%' }
        }
      },
      plugins: {
        legend: { display: true, position: 'bottom', labels: { color: cssVar('--color-text-muted'), boxWidth:12, font:{size:11} } },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${ctx.raw}% ${brandMixMetric==='fat'?'del fatturato':'dei volumi'}`
          }
        }
      }
    }
  });

  // Insight brand mix
  const byBrand = groupBy(filteredData, 'marca');
  const topBrand = Object.entries(byBrand)
    .map(([k,v]) => ({name:k, count:v.length}))
    .sort((a,b)=>b.count-a.count)[0];
  document.getElementById('insight-brand-mix').innerHTML =
    `<strong>Mix brand per filiale (${brandMixMetric==='fat'?'fatturato':'volumi'}):</strong> la composizione percentuale per filiale evidenzia la distribuzione dei brand. <strong>${topBrand?.name||'—'}</strong> è il brand con più pratiche nel periodo selezionato (${topBrand?.count||0} contratti, ${topBrand && filteredData.length ? fmtPct(topBrand.count/filteredData.length*100) : '—'} del totale).`;
}

function renderBrandDonut() {
  const byBrand = groupBy(filteredData, 'marca');
  const brands = [...new Set(filteredData.map(r => r.marca))].sort();
  const colors = getChartColors();

  const brandData = brands.map((b,i) => ({
    name: b,
    count: (byBrand[b]||[]).length,
    fat: sumFattura(byBrand[b]||[]),
    color: colors[i % colors.length],
  })).sort((a,b) => b.count - a.count);

  const totalCount = filteredData.length;
  const totalFat   = sumFattura(filteredData);

  const ctx = document.getElementById('chart-brand-donut');
  if(!ctx) return;
  destroyChart('brand-donut');

  chartInstances['brand-donut'] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: brandData.map(b => b.name),
      datasets: [{
        data: brandData.map(b => b.count),
        backgroundColor: brandData.map(b => b.color + 'dd'),
        borderColor: brandData.map(b => b.color),
        borderWidth: 2,
        hoverOffset: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const b = brandData[ctx.dataIndex];
              const pct = totalCount > 0 ? (b.count/totalCount*100).toFixed(1) : 0;
              return ` ${b.count} pratiche (${pct}%) — ${fmtK(b.fat)}`;
            }
          }
        }
      }
    }
  });

  // Legend
  const legendEl = document.getElementById('brand-donut-legend');
  if(legendEl) {
    legendEl.innerHTML = brandData.map(b => `
      <div class="legend-item">
        <div class="legend-dot" style="background:${b.color}"></div>
        <span class="legend-name">${b.name}</span>
        <span class="legend-val">${b.count}</span>
        <span class="legend-pct">${totalCount>0?fmtPct(b.count/totalCount*100):'-'}</span>
      </div>`).join('');
  }
}

// ── Navigazione tab ───────────────────────────────────────────
function switchSection(id) {
  activeSection = id;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.section === id));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'section-' + id));
  if(filteredData.length) renderAll();
}

// ── Toggle brand mix metric ────────────────────────────────────
function setBrandMetric(metric) {
  brandMixMetric = metric;
  document.querySelectorAll('[data-brand-metric]').forEach(b =>
    b.classList.toggle('active', b.dataset.brandMetric === metric));
  if(filteredData.length) renderBrandMixChart();
}

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Tab navigation
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchSection(btn.dataset.section));
  });

  // Filtri
  ['filter-date-start','filter-date-end','filter-brand','filter-branch'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', applyFilters);
  });
  document.getElementById('btn-reset-filters')?.addEventListener('click', resetFilters);

  // Brand metric toggle
  document.querySelectorAll('[data-brand-metric]').forEach(btn => {
    btn.addEventListener('click', () => setBrandMetric(btn.dataset.brandMetric));
  });

  // Carica dati
  loadData();
});

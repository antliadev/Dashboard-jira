import '../styles/hours.css';
import { dataService } from '../data/data-service.js';
import { sanitize } from '../utils/helpers.js';

const PROJECT_KEY = 'CRAWFORD';
const TIME_ZONE = 'America/Sao_Paulo';
let currentReport = null;

function currentCompetence() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit'
  }).format(new Date());
}

function normalizeCompetence(value) {
  return /^\d{4}-\d{2}$/.test(value || '') ? value : currentCompetence();
}

function competenceLabel(value) {
  const [year, month] = normalizeCompetence(value).split('-').map(Number);
  const monthName = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1)));
  return `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)}/${year}`;
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatHours(value) {
  return `${number(value).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} h`;
}

function formatDuration(entry) {
  const totalSeconds = Math.max(0, Math.round(number(entry.timeSeconds ?? number(entry.timeHours) * 3600)));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function formatDate(value) {
  if (!value) return '—';
  const dateOnly = String(value).slice(0, 10);
  const [year, month, day] = dateOnly.split('-');
  return year && month && day ? `${day}/${month}/${year}` : String(value);
}

function alertInfo(level, utilization) {
  const normalized = String(level || '').toLowerCase();
  if (normalized === 'exceeded' || utilization > 100) return { css: 'exceeded', label: 'Excedido' };
  if (normalized === 'exhausted' || utilization === 100) return { css: 'exhausted', label: 'Esgotado' };
  if (normalized === 'critical' || utilization >= 90) return { css: 'critical', label: 'Crítico' };
  if (normalized === 'attention' || utilization >= 80) return { css: 'attention', label: 'Atenção' };
  return { css: 'healthy', label: 'Dentro da meta' };
}

function reportModel(payload, competence) {
  const usedHours = number(payload.usedHours);
  const allowanceHours = number(payload.allowanceHours || 100);
  const utilizationPercent = number(payload.utilizationPercent ?? (allowanceHours ? usedHours / allowanceHours * 100 : 0));
  return {
    ...payload,
    projectKey: payload.projectKey || PROJECT_KEY,
    competence: normalizeCompetence(payload.competence || competence),
    usedHours,
    allowanceHours,
    availableHours: Math.max(0, number(payload.availableHours ?? allowanceHours - usedHours)),
    overageHours: Math.max(0, number(payload.overageHours ?? usedHours - allowanceHours)),
    utilizationPercent,
    byApplication: Array.isArray(payload.byApplication) ? payload.byApplication : [],
    monthlyHistory: Array.isArray(payload.monthlyHistory) ? payload.monthlyHistory : [],
    entries: Array.isArray(payload.entries) ? payload.entries : []
  };
}

function renderLoading(competence) {
  document.getElementById('page-content').innerHTML = `
    <section class="hours-page" aria-busy="true">
      <div class="hours-loading"><div class="spinner"></div><p>Carregando apontamentos de ${sanitize(competenceLabel(competence))}…</p></div>
    </section>`;
}

function renderError(error, competence) {
  document.getElementById('page-content').innerHTML = `
    <section class="hours-page">
      <div class="hours-state hours-error" role="alert">
        <h3>Não foi possível carregar o controle de horas</h3>
        <p>${sanitize(error?.message || 'Falha inesperada ao consultar os apontamentos.')}</p>
        <button class="btn btn-primary" id="hours-retry">Tentar novamente</button>
      </div>
    </section>`;
  document.getElementById('hours-retry')?.addEventListener('click', () => loadReport(competence));
}

function applicationBars(items) {
  if (!items.length) return '<div class="hours-inline-empty">Nenhuma aplicação ou épico com horas nesta competência.</div>';
  const max = Math.max(...items.map(item => number(item.hours)), 1);
  return items.map(item => {
    const width = Math.max(2, number(item.hours) / max * 100);
    return `<div class="hours-bar-row">
      <span title="${sanitize(item.name || 'Sem aplicação')}">${sanitize(item.name || 'Sem aplicação')}</span>
      <div class="hours-bar-track"><i style="width:${width}%"></i></div>
      <strong>${sanitize(formatHours(item.hours))}</strong>
    </div>`;
  }).join('');
}

function monthlyBars(items) {
  if (!items.length) return '<div class="hours-inline-empty">O histórico mensal ainda não está disponível.</div>';
  const max = Math.max(...items.map(item => number(item.usedHours)), 1);
  return `<div class="hours-month-bars">${items.map(item => {
    const height = Math.max(3, number(item.usedHours) / max * 100);
    const label = competenceLabel(item.competence).replace('/', ' ');
    return `<div class="hours-month-column" title="${sanitize(`${label}: ${formatHours(item.usedHours)}`)}">
      <strong>${sanitize(number(item.usedHours).toLocaleString('pt-BR', { maximumFractionDigits: 1 }))}</strong>
      <div><i style="height:${height}%"></i></div>
      <span>${sanitize(label)}</span>
    </div>`;
  }).join('')}</div>`;
}

function entriesTable(entries) {
  if (!entries.length) {
    return `<div class="hours-state hours-empty">
      <h3>Nenhum apontamento em ${sanitize(competenceLabel(currentReport.competence))}</h3>
      <p>Registre worklogs nos cards Crawford para que o consumo seja calculado automaticamente.</p>
    </div>`;
  }
  return `<div class="hours-table-wrap"><table class="hours-table">
    <thead><tr><th>Data</th><th>Ticket</th><th>Aplicativo / Épico</th><th>Descrição</th><th>Responsável</th><th>Tempo</th><th>Mês/Ano</th></tr></thead>
    <tbody>${entries.map(entry => `<tr>
      <td>${sanitize(formatDate(entry.date))}</td>
      <td><strong>${sanitize(entry.ticket || '—')}</strong></td>
      <td>${sanitize(entry.application || 'Sem aplicação')}</td>
      <td class="hours-description" title="${sanitize(entry.description || '')}">${sanitize(entry.description || '—')}</td>
      <td>${sanitize(entry.author || 'Não informado')}</td>
      <td>${sanitize(formatDuration(entry))}</td>
      <td>${sanitize(entry.monthYear || currentReport.competence)}</td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

function renderReport(report) {
  currentReport = report;
  const alert = alertInfo(report.alertLevel, report.utilizationPercent);
  const content = document.getElementById('page-content');
  content.innerHTML = `
    <section class="hours-page">
      <div class="hours-toolbar">
        <div class="hours-report-intro">
          <div class="hours-client-brand" aria-label="Cliente Crawford">
            <span>Cliente</span>
            <div class="hours-client-logo"><img src="/crawford-logo.png" alt="Crawford"></div>
          </div>
          <div>
            <span class="hours-eyebrow">Controle executivo · ${sanitize(report.projectKey)}</span>
            <h1>Relatório de Horas ${sanitize(competenceLabel(report.competence))}</h1>
            <p>Consumo calculado pelos worklogs do Jira na competência selecionada.</p>
          </div>
        </div>
        <div class="hours-actions">
          <label for="hours-competence">Competência
            <input type="month" id="hours-competence" value="${sanitize(report.competence)}" aria-label="Selecionar competência">
          </label>
          <button class="btn btn-primary" id="hours-export" ${report.entries.length ? '' : 'disabled'}>Exportar planilha</button>
        </div>
      </div>

      <div class="hours-kpis">
        <article class="hours-kpi used"><span>Horas utilizadas</span><strong>${sanitize(formatHours(report.usedHours))}</strong><small>de ${sanitize(formatHours(report.allowanceHours))}</small></article>
        <article class="hours-kpi available"><span>Horas disponíveis</span><strong>${sanitize(formatHours(report.availableHours))}</strong><small>renovação mensal, sem acúmulo</small></article>
        <article class="hours-kpi utilization ${alert.css}"><span>Consumo</span><strong>${sanitize(report.utilizationPercent.toLocaleString('pt-BR', { maximumFractionDigits: 1 }))}%</strong><small>${sanitize(alert.label)}</small></article>
        <article class="hours-kpi overage ${report.overageHours > 0 ? 'visible' : ''}"><span>Horas excedentes</span><strong>${sanitize(formatHours(report.overageHours))}</strong><small>${report.overageHours > 0 ? 'acima do limite contratado' : 'sem excedente no período'}</small></article>
      </div>

      <div class="hours-chart-grid">
        <article class="hours-panel"><div class="hours-panel-heading"><h2>Horas por aplicativo / épico</h2><span>Distribuição da competência</span></div>${applicationBars(report.byApplication)}</article>
        <article class="hours-panel"><div class="hours-panel-heading"><h2>Consumo por mês</h2><span>Histórico de horas utilizadas</span></div>${monthlyBars(report.monthlyHistory)}</article>
      </div>

      <article class="hours-panel hours-detail-panel">
        <div class="hours-panel-heading"><h2>Detalhamento dos apontamentos</h2><span>${report.entries.length} registro${report.entries.length === 1 ? '' : 's'}</span></div>
        ${entriesTable(report.entries)}
      </article>
    </section>`;

  document.getElementById('hours-competence')?.addEventListener('change', event => loadReport(event.target.value));
  document.getElementById('hours-export')?.addEventListener('click', exportWorkbook);
}

function excelSafe(value) {
  const text = String(value ?? '');
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function styleWorksheet(sheet, widths) {
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + widths.length)}1` };
  sheet.columns = widths.map(width => ({ width }));
  const header = sheet.getRow(1);
  header.height = 24;
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF97316' } };
  header.alignment = { vertical: 'middle' };
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1 && rowNumber % 2 === 0) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
    row.alignment = { vertical: 'top' };
  });
}

async function exportWorkbook() {
  if (!currentReport?.entries?.length) return;
  const button = document.getElementById('hours-export');
  button.disabled = true;
  button.textContent = 'Gerando…';
  try {
    const ExcelModule = await import('exceljs');
    const ExcelJS = ExcelModule.default || ExcelModule;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Jira Dash';
    workbook.created = new Date();

    const description = workbook.addWorksheet('Descricao');
    description.addRow(['DATA', 'TICKET', 'APLICATIVO', 'DESCRIÇÃO DA ATUAÇÃO', 'RESPONSÁVEL', 'TEMPO', 'MES/ANO']);
    currentReport.entries.forEach(entry => description.addRow([
      formatDate(entry.date), excelSafe(entry.ticket), excelSafe(entry.application || 'Sem aplicação'),
      excelSafe(entry.description), excelSafe(entry.author || 'Não informado'), formatDuration(entry),
      excelSafe(entry.monthYear || currentReport.competence)
    ]));
    styleWorksheet(description, [14, 16, 28, 58, 24, 12, 14]);

    const consumption = workbook.addWorksheet('Consumo');
    consumption.addRow(['MES/ANO', 'HORAS UTILIZADAS', 'CONSUMO (%)']);
    currentReport.monthlyHistory.forEach(item => consumption.addRow([
      excelSafe(item.competence), number(item.usedHours), currentReport.allowanceHours ? number(item.usedHours) / currentReport.allowanceHours : 0
    ]));
    consumption.getColumn(2).numFmt = '0.00';
    consumption.getColumn(3).numFmt = '0.00%';
    styleWorksheet(consumption, [16, 22, 18]);

    const hours = workbook.addWorksheet('Horas');
    hours.addRow(['PROJETO', 'MES/ANO', 'HORAS CONTRATADAS', 'HORAS UTILIZADAS', 'HORAS DISPONÍVEIS', 'HORAS EXCEDENTES']);
    hours.addRow([excelSafe(currentReport.projectKey), excelSafe(currentReport.competence), currentReport.allowanceHours, currentReport.usedHours, currentReport.availableHours, currentReport.overageHours]);
    [3, 4, 5, 6].forEach(index => { hours.getColumn(index).numFmt = '0.00'; });
    styleWorksheet(hours, [18, 16, 22, 20, 22, 20]);

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `Relatorio-Horas-${currentReport.projectKey}-${currentReport.competence}.xlsx`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('[Hours] Falha ao exportar planilha:', error);
    window.alert('Não foi possível gerar a planilha. Tente novamente.');
  } finally {
    button.disabled = false;
    button.textContent = 'Exportar planilha';
  }
}

async function loadReport(competence) {
  const normalized = normalizeCompetence(competence);
  renderLoading(normalized);
  try {
    const payload = await dataService.loadHoursDashboard(PROJECT_KEY, normalized);
    renderReport(reportModel(payload, normalized));
  } catch (error) {
    renderError(error, normalized);
  }
}

export function renderHours() {
  const header = document.getElementById('page-header');
  if (header) header.innerHTML = '<div><h2>Controle de Horas</h2><div class="subtitle">Crawford · dados automáticos do Jira</div></div>';
  const hashQuery = window.location.hash.split('?')[1] || '';
  const competence = normalizeCompetence(new URLSearchParams(hashQuery).get('competence'));
  loadReport(competence);
}

import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, forkJoin, of } from 'rxjs';

type View = 'dashboard' | 'condominiums' | 'reports';

interface Condominium {
  _id: string;
  name: string;
  address: string;
  units: number;
  administratorName?: string;
  contactEmail?: string;
  score?: number;
  trend?: number;
  lastEvaluation?: string;
  reportCount?: number;
}

interface Report {
  _id?: string;
  condominiumId?: string | Condominium;
  condominium?: Condominium;
  totalScore?: number;
  score?: number;
  evaluationDate?: string;
  createdAt?: string;
  evaluator?: string;
  rating?: string;
  categoryScores?: Record<string, number>;
  scores?: Record<string, number>;
  metrics?: Record<string, Record<string, number | boolean>>;
  indicators?: Array<{ key: string; name?: string; score: number; weightedScore?: number }>;
}

interface MetricField {
  key: string;
  label: string;
  type: 'number' | 'boolean';
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = '/api';

  readonly view = signal<View>('dashboard');
  readonly reports = signal<Report[]>([]);
  readonly condominiums = signal<Condominium[]>([]);
  readonly selected = signal<Condominium | null>(null);
  readonly activeReport = signal<Report | null>(null);
  readonly loading = signal(true);
  readonly apiOnline = signal(true);
  readonly query = signal('');
  readonly showCondoForm = signal(false);
  readonly showReportForm = signal(false);
  readonly saving = signal(false);
  readonly notice = signal('');

  newCondo = {
    name: '',
    address: '',
    units: 1,
    administratorName: '',
    contactEmail: ''
  };

  newReport = {
    condominiumId: '',
    evaluationDate: new Date().toISOString().slice(0, 10),
    evaluator: '',
    notes: '',
    metrics: {
      governance: { signedAndArchivedMinutesPercent: 90, regulationAgeYears: 3, undeclaredConflictsCount: 0, legalNoticeCompliancePercent: 100 },
      finances: { reserveFundingPercent: 70, delinquencyRatePercent: 8, budgetDeviationPercent: 5, hasFinancialStatementsUnder90Days: true },
      infrastructure: { facilityConditionIndexPercent: 12, preventiveMaintenanceCoveragePercent: 85, criticalSystemsWeightedAgeYears: 7, emergencyIncidentsLast12Months: 2 },
      operations: { securityStaffCoveragePercent: 100, operationalCamerasPercent: 95, hasWrittenEmergencyProtocol: true, documentedSecurityChecksPercent: 90 },
      technology: { digitizedAdministrativeProcessesPercent: 75, hasDigitalAndPhysicalCriticalDocumentBackup: true, hasDigitalCommunicationChannel: true, lastDocumentBackupAgeDays: 7 },
      residentExperience: { generalSatisfaction: 4.2, averageRequestResponseHours: 12, claimsResolvedUnder15BusinessDaysPercent: 88, lastAssemblyParticipationPercent: 65 },
      sustainability: { efficientLightingPercent: 80, hasRecyclingProgram: true, hasSustainabilityPolicyOrCommittee: false, universalAccessibilityPercent: 60 },
      humanTalent: { formallyEmployedStaffPercent: 100, contractedCriticalProvidersPercent: 90, hasPeriodicProviderEvaluation: true, annualStaffTurnoverPercent: 15 },
      communication: { hasWrittenCrisisCommunicationProtocol: true, escalatedClaimOfficialResponseHours: 18, formallySupportedCommunicationsPercent: 90, transparencyPerception: 4 },
      innovation: { previousImprovementPlanImplementedPercent: 70, hasRecentBoardTraining: true, condoScoreYearOverYearVariation: 4, adoptedManagementInnovation: true }
    } as Record<string, Record<string, number | boolean>>
  };

  readonly metricGroups: Array<{ key: string; label: string; fields: MetricField[] }> = [
    { key: 'governance', label: 'Gobernanza', fields: [
      { key: 'signedAndArchivedMinutesPercent', label: 'Actas firmadas y archivadas', type: 'number', min: 0, max: 100, suffix: '%' },
      { key: 'regulationAgeYears', label: 'Antigüedad del reglamento', type: 'number', min: 0, suffix: 'años' },
      { key: 'undeclaredConflictsCount', label: 'Conflictos no declarados', type: 'number', min: 0 },
      { key: 'legalNoticeCompliancePercent', label: 'Cumplimiento de avisos legales', type: 'number', min: 0, max: 100, suffix: '%' }
    ]},
    { key: 'finances', label: 'Finanzas', fields: [
      { key: 'reserveFundingPercent', label: 'Fondo de reserva financiado', type: 'number', min: 0, max: 100, suffix: '%' },
      { key: 'delinquencyRatePercent', label: 'Tasa de morosidad', type: 'number', min: 0, max: 100, suffix: '%' },
      { key: 'budgetDeviationPercent', label: 'Desvío presupuestario', type: 'number', min: 0, max: 100, suffix: '%' },
      { key: 'hasFinancialStatementsUnder90Days', label: 'Estados financieros menores a 90 días', type: 'boolean' }
    ]},
    { key: 'infrastructure', label: 'Infraestructura', fields: [
      { key: 'facilityConditionIndexPercent', label: 'Índice de deterioro de instalaciones', type: 'number', min: 0, max: 100, suffix: '%' },
      { key: 'preventiveMaintenanceCoveragePercent', label: 'Cobertura de mantenimiento preventivo', type: 'number', min: 0, max: 100, suffix: '%' },
      { key: 'criticalSystemsWeightedAgeYears', label: 'Edad ponderada de sistemas críticos', type: 'number', min: 0, suffix: 'años' },
      { key: 'emergencyIncidentsLast12Months', label: 'Incidentes de emergencia (12 meses)', type: 'number', min: 0 }
    ]},
    { key: 'operations', label: 'Operaciones', fields: [
      { key: 'securityStaffCoveragePercent', label: 'Cobertura del personal de seguridad', type: 'number', min: 0, max: 100, suffix: '%' },
      { key: 'operationalCamerasPercent', label: 'Cámaras operativas', type: 'number', min: 0, max: 100, suffix: '%' },
      { key: 'hasWrittenEmergencyProtocol', label: 'Protocolo de emergencia escrito', type: 'boolean' },
      { key: 'documentedSecurityChecksPercent', label: 'Controles de seguridad documentados', type: 'number', min: 0, max: 100, suffix: '%' }
    ]},
    { key: 'technology', label: 'Tecnología', fields: [
      { key: 'digitizedAdministrativeProcessesPercent', label: 'Procesos administrativos digitalizados', type: 'number', min: 0, max: 100, suffix: '%' },
      { key: 'hasDigitalAndPhysicalCriticalDocumentBackup', label: 'Respaldo digital y físico de documentos', type: 'boolean' },
      { key: 'hasDigitalCommunicationChannel', label: 'Canal digital de comunicación', type: 'boolean' },
      { key: 'lastDocumentBackupAgeDays', label: 'Antigüedad del último respaldo', type: 'number', min: 0, suffix: 'días' }
    ]},
    { key: 'residentExperience', label: 'Experiencia de residentes', fields: [
      { key: 'generalSatisfaction', label: 'Satisfacción general', type: 'number', min: 1, max: 5, step: .1, suffix: '/ 5' },
      { key: 'averageRequestResponseHours', label: 'Respuesta promedio a solicitudes', type: 'number', min: 0, suffix: 'horas' },
      { key: 'claimsResolvedUnder15BusinessDaysPercent', label: 'Reclamos resueltos antes de 15 días', type: 'number', min: 0, max: 100, suffix: '%' },
      { key: 'lastAssemblyParticipationPercent', label: 'Participación en última asamblea', type: 'number', min: 0, max: 100, suffix: '%' }
    ]},
    { key: 'sustainability', label: 'Sostenibilidad', fields: [
      { key: 'efficientLightingPercent', label: 'Iluminación eficiente', type: 'number', min: 0, max: 100, suffix: '%' },
      { key: 'hasRecyclingProgram', label: 'Programa de reciclaje', type: 'boolean' },
      { key: 'hasSustainabilityPolicyOrCommittee', label: 'Política o comité de sostenibilidad', type: 'boolean' },
      { key: 'universalAccessibilityPercent', label: 'Accesibilidad universal', type: 'number', min: 0, max: 100, suffix: '%' }
    ]},
    { key: 'humanTalent', label: 'Talento humano', fields: [
      { key: 'formallyEmployedStaffPercent', label: 'Personal formalmente empleado', type: 'number', min: 0, max: 100, suffix: '%' },
      { key: 'contractedCriticalProvidersPercent', label: 'Proveedores críticos contratados', type: 'number', min: 0, max: 100, suffix: '%' },
      { key: 'hasPeriodicProviderEvaluation', label: 'Evaluación periódica de proveedores', type: 'boolean' },
      { key: 'annualStaffTurnoverPercent', label: 'Rotación anual del personal', type: 'number', min: 0, max: 100, suffix: '%' }
    ]},
    { key: 'communication', label: 'Comunicación', fields: [
      { key: 'hasWrittenCrisisCommunicationProtocol', label: 'Protocolo escrito de crisis', type: 'boolean' },
      { key: 'escalatedClaimOfficialResponseHours', label: 'Respuesta oficial a reclamos escalados', type: 'number', min: 0, suffix: 'horas' },
      { key: 'formallySupportedCommunicationsPercent', label: 'Comunicaciones con respaldo formal', type: 'number', min: 0, max: 100, suffix: '%' },
      { key: 'transparencyPerception', label: 'Percepción de transparencia', type: 'number', min: 1, max: 5, step: .1, suffix: '/ 5' }
    ]},
    { key: 'innovation', label: 'Innovación', fields: [
      { key: 'previousImprovementPlanImplementedPercent', label: 'Plan de mejora anterior implementado', type: 'number', min: 0, max: 100, suffix: '%' },
      { key: 'hasRecentBoardTraining', label: 'Capacitación reciente del consejo', type: 'boolean' },
      { key: 'condoScoreYearOverYearVariation', label: 'Variación interanual del CondoScore', type: 'number', min: -100, max: 100, suffix: 'pts.' },
      { key: 'adoptedManagementInnovation', label: 'Innovación de gestión adoptada', type: 'boolean' }
    ]}
  ];

  readonly filteredCondominiums = computed(() => {
    const term = this.query().trim().toLocaleLowerCase();
    return this.condominiums().filter((condo) =>
      !term || `${condo.name} ${condo.address}`.toLocaleLowerCase().includes(term)
    );
  });

  readonly averageScore = computed(() => {
    const values = this.condominiums().map((c) => c.score).filter((v): v is number => typeof v === 'number');
    return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
  });

  readonly totalUnits = computed(() => this.condominiums().reduce((sum, c) => sum + Number(c.units || 0), 0));

  readonly selectedReports = computed(() => {
    const id = this.selected()?._id;
    if (!id) return [];
    return this.reports()
      .filter((report) => this.reportCondoId(report) === id)
      .sort((a, b) => this.reportDate(b).localeCompare(this.reportDate(a)));
  });

  readonly activeScore = computed(() => {
    const report = this.activeReport();
    return report ? Number(report.totalScore ?? report.score ?? 0) : Number(this.selected()?.score ?? 0);
  });

  readonly categories = computed(() => {
    const report = this.activeReport() ?? this.latestReport(this.selected()?._id);
    const scores = this.extractCategoryScores(report);
    return this.metricGroups.map(({ key, label }) => ({ label, value: Math.round(scores[key] ?? 0) }));
  });

  ngOnInit(): void {
    this.loadReports();
  }

  setView(view: View): void {
    this.view.set(view);
    this.selected.set(null);
  }

  loadReports(): void {
    this.loading.set(true);
    this.http.get<unknown>(`${this.api}/reports`).subscribe({
      next: (response) => {
        const reports = this.unwrap<Report>(response);
        const derived = this.deriveCondominiums(reports);
        this.reports.set(reports);
        this.apiOnline.set(true);
        if (!derived.length) {
          this.condominiums.set([]);
          this.loading.set(false);
          return;
        }

        forkJoin(derived.map((condo) =>
          this.http.get<any>(`${this.api}/condominiums/${condo._id}/profile`).pipe(
            catchError(() => of(null))
          )
        )).subscribe((profiles) => {
          this.condominiums.set(derived.map((condo, index) => {
            const response = profiles[index];
            const profile = response?.data ?? response;
            if (!profile) return condo;
            return this.normalizeCondo(
              profile.condominium
                ? { ...profile.condominium, reportSummary: profile.reportSummary }
                : profile,
              condo
            );
          }));
          this.loading.set(false);
        });
      },
      error: () => {
        this.apiOnline.set(false);
        this.loading.set(false);
      }
    });
  }

  openReport(condo: Condominium): void {
    this.selected.set(condo);
    this.activeReport.set(this.latestReport(condo._id) ?? null);
    this.http.get<unknown>(`${this.api}/condominiums/${condo._id}/profile`).subscribe({
      next: (response) => {
        const profile = (response as any)?.data ?? response;
        const enriched = this.normalizeCondo(
          profile?.condominium ? { ...profile.condominium, reportSummary: profile.reportSummary } : profile,
          condo
        );
        this.selected.set(enriched);
        const profileReports = this.findReports(profile);
        if (profileReports.length) {
          const newest = profileReports.sort((a, b) => this.reportDate(b).localeCompare(this.reportDate(a)))[0];
          this.activeReport.set(newest);
        }
      }
    });
  }

  closeDetail(): void {
    this.selected.set(null);
    this.activeReport.set(null);
  }

  selectReport(report: Report): void {
    this.activeReport.set(report);
  }

  createCondominium(): void {
    if (!this.newCondo.name || !this.newCondo.address || !this.newCondo.contactEmail) return;
    this.saving.set(true);
    this.http.post<any>(`${this.api}/condominiums`, this.newCondo).subscribe({
      next: (response) => {
        const created = response?.data ?? response;
        this.condominiums.update((items) => [this.normalizeCondo(created, created), ...items]);
        this.showCondoForm.set(false);
        this.saving.set(false);
        this.flash('Condominio registrado correctamente');
        this.newCondo = { name: '', address: '', units: 1, administratorName: '', contactEmail: '' };
      },
      error: () => {
        this.saving.set(false);
        this.flash('No se pudo registrar. Verificá que la API esté disponible.');
      }
    });
  }

  createReport(): void {
    if (!this.newReport.condominiumId || !this.newReport.evaluator) return;
    const { condominiumId, ...payload } = this.newReport;
    this.saving.set(true);
    this.http.post(`${this.api}/condominiums/${condominiumId}/reports`, payload).subscribe({
      next: () => {
        this.showReportForm.set(false);
        this.saving.set(false);
        this.flash('Evaluación guardada y reporte generado');
        this.loadReports();
      },
      error: () => {
        this.saving.set(false);
        this.flash('No se pudo generar el reporte. Revisá la conexión con la API.');
      }
    });
  }

  latestReport(id?: string): Report | undefined {
    return this.reports()
      .filter((report) => this.reportCondoId(report) === id)
      .sort((a, b) => this.reportDate(b).localeCompare(this.reportDate(a)))[0];
  }

  scoreClass(score = 0): string {
    return score >= 80 ? 'good' : score >= 60 ? 'medium' : 'low';
  }

  reportDate(report: Report): string {
    return report.evaluationDate ?? report.createdAt ?? '';
  }

  formatDate(value?: string): string {
    if (!value) return 'Sin evaluación';
    return new Intl.DateTimeFormat('es-UY', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
  }

  private deriveCondominiums(reports: Report[]): Condominium[] {
    const map = new Map<string, Condominium>();
    for (const report of reports) {
      const source = typeof report.condominiumId === 'object' ? report.condominiumId : report.condominium;
      const id = this.reportCondoId(report);
      if (!id) continue;
      const existing = map.get(id);
      const score = Number(report.totalScore ?? report.score ?? 0);
      const date = this.reportDate(report);
      map.set(id, this.normalizeCondo(source, {
        ...(existing ?? {}),
        _id: id,
        name: source?.name ?? existing?.name ?? 'Condominio',
        address: source?.address ?? existing?.address ?? 'Dirección no disponible',
        units: source?.units ?? existing?.units ?? 0,
        score: !existing?.lastEvaluation || date >= existing.lastEvaluation ? score : existing.score,
        lastEvaluation: !existing?.lastEvaluation || date >= existing.lastEvaluation ? date : existing.lastEvaluation,
        reportCount: (existing?.reportCount ?? 0) + 1
      } as Condominium));
    }
    return [...map.values()];
  }

  private normalizeCondo(value: any, fallback: Condominium): Condominium {
    return {
      _id: value?._id ?? value?.id ?? fallback?._id,
      name: value?.name ?? fallback?.name,
      address: value?.address ?? fallback?.address,
      units: Number(value?.units ?? fallback?.units ?? 0),
      administratorName: value?.administratorName ?? fallback?.administratorName,
      contactEmail: value?.contactEmail ?? fallback?.contactEmail,
      score: Number(value?.reportSummary?.latestScore ?? value?.score ?? fallback?.score ?? 0),
      trend: Number(value?.reportSummary?.trend ?? value?.trend ?? fallback?.trend ?? 0),
      lastEvaluation: value?.reportSummary?.lastEvaluation ?? value?.lastEvaluation ?? fallback?.lastEvaluation,
      reportCount: Number(value?.reportSummary?.reportCount ?? value?.reportCount ?? fallback?.reportCount ?? 0)
    };
  }

  private reportCondoId(report: Report): string {
    if (typeof report.condominiumId === 'string') return report.condominiumId;
    return report.condominiumId?._id ?? report.condominium?._id ?? '';
  }

  private unwrap<T>(response: unknown): T[] {
    if (Array.isArray(response)) return response as T[];
    const value = response as any;
    for (const key of ['data', 'reports', 'items', 'results']) {
      if (Array.isArray(value?.[key])) return value[key] as T[];
      if (Array.isArray(value?.data?.[key])) return value.data[key] as T[];
    }
    return [];
  }

  private findReports(value: any): Report[] {
    if (!value || typeof value !== 'object') return [];
    for (const key of ['reports', 'reportHistory', 'evaluations']) {
      if (Array.isArray(value[key])) return value[key] as Report[];
    }
    for (const key of ['latestReport', 'report', 'lastReport']) {
      if (value[key] && typeof value[key] === 'object') return [value[key] as Report];
    }
    if (value.reportSummary && typeof value.reportSummary === 'object') return this.findReports(value.reportSummary);
    if (value.profile && typeof value.profile === 'object') return this.findReports(value.profile);
    return [];
  }

  private extractCategoryScores(report?: Report | null): Record<string, number> {
    if (!report) return {};
    const source = report as any;
    if (Array.isArray(source.indicators)) {
      const indicatorScores = Object.fromEntries(
        source.indicators
          .filter((indicator: any) => indicator?.key && Number.isFinite(Number(indicator?.score)))
          .map((indicator: any) => [indicator.key, this.normalizeScore(Number(indicator.score))])
      );
      if (Object.keys(indicatorScores).length) return indicatorScores;
    }
    const candidates = [
      source.categoryScores, source.scores, source.dimensionScores, source.dimensions,
      source.calculatedReport?.categoryScores, source.calculatedReport?.scores,
      source.result?.categoryScores, source.result?.scores, source.analysis?.scores
    ];
    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== 'object') continue;
      const normalized: Record<string, number> = {};
      for (const group of this.metricGroups) {
        const raw = candidate[group.key];
        const value = typeof raw === 'number' ? raw : raw?.score ?? raw?.value ?? raw?.percentage;
        if (Number.isFinite(Number(value))) normalized[group.key] = this.normalizeScore(Number(value));
      }
      if (Object.keys(normalized).length) return normalized;
    }

    const metrics = source.metrics ?? source.observableMetrics ?? source.input?.metrics;
    if (!metrics || typeof metrics !== 'object') return {};
    return Object.fromEntries(this.metricGroups.map((group) => [
      group.key,
      this.estimateMetricScore(group.key, metrics[group.key] ?? {})
    ]));
  }

  private normalizeScore(value: number): number {
    return Math.max(0, Math.min(100, value <= 5 ? value * 20 : value));
  }

  private estimateMetricScore(groupKey: string, values: Record<string, number | boolean>): number {
    const group = this.metricGroups.find((item) => item.key === groupKey);
    if (!group) return 0;
    const negative = new Set([
      'regulationAgeYears', 'undeclaredConflictsCount', 'delinquencyRatePercent',
      'budgetDeviationPercent', 'facilityConditionIndexPercent', 'criticalSystemsWeightedAgeYears',
      'emergencyIncidentsLast12Months', 'lastDocumentBackupAgeDays',
      'averageRequestResponseHours', 'annualStaffTurnoverPercent',
      'escalatedClaimOfficialResponseHours'
    ]);
    const scores = group.fields.map((field) => {
      const raw = values[field.key];
      if (typeof raw === 'boolean') return raw ? 100 : 0;
      const number = Number(raw);
      if (!Number.isFinite(number)) return 0;
      if (field.max === 5) return this.normalizeScore(number);
      if (negative.has(field.key)) {
        const ceiling = field.key.includes('Percent') ? 100
          : field.key.includes('Hours') ? 72
          : field.key.includes('Days') ? 90
          : field.key.includes('Years') ? 20 : 10;
        return Math.max(0, 100 - (number / ceiling) * 100);
      }
      return this.normalizeScore(number);
    });
    return scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : 0;
  }

  private flash(message: string): void {
    this.notice.set(message);
    window.setTimeout(() => this.notice.set(''), 4000);
  }
}

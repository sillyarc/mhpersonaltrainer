'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import PageShell from '@/components/PageShell';
import AcademyGate from '@/components/AcademyGate';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/firestoreHooks';
import { useAcademyData } from '@/lib/hooks/useAcademyData';
import {
  generateAcademyLinkSuggestions,
  type AcademyLinkSuggestion,
} from '@/lib/services/ai';
import { fetchEvaluationsForStudents } from '@/lib/services/evaluations';
import { createPaymentForUser } from '@/lib/services/financeiro';
import { getFirebaseDb } from '@/lib/services/firebase';
import { formatCurrency } from '@/lib/services/payments';
import { firestoreService } from '@/lib/services/firestoreService';
import {
  createAppointment,
  fetchAppointmentsForStudents,
} from '@/lib/services/scheduling';
import type { PhysicalEvaluation } from '@/lib/types/evaluation';
import type { Appointment, AppointmentStatus, AppointmentType } from '@/lib/types/scheduling';

const EVALUATION_LABELS: Record<string, string> = {
  online: 'Online',
  personalizada: 'Personalizada',
  postural: 'Postural',
  fisica: 'Fisica',
};

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateInput = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const formatTime = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

const parseTime = (value: string) => {
  const [hour, minute] = value.split(':').map(Number);
  return (hour || 0) * 60 + (minute || 0);
};

const isSameMonth = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

const getLatestEvaluationDate = (evaluations: PhysicalEvaluation[]) => {
  if (!evaluations.length) return null;
  return evaluations[0]?.date || null;
};

const getLastPhysicalMetrics = (evaluation?: PhysicalEvaluation) => {
  if (!evaluation || evaluation.type !== 'fisica') return [];
  const data = (evaluation as any).composicaoCorporal;
  const metrics: string[] = [];
  if (data?.imc) metrics.push(`IMC ${data.imc}`);
  if (data?.percentualGordura) metrics.push(`Gordura ${data.percentualGordura}%`);
  if (data?.peso) metrics.push(`Peso ${data.peso}kg`);
  return metrics;
};

const getAppointmentLabel = (type: AppointmentType) =>
  ({
    treino: 'Treino',
    avaliacao: 'Avaliacao',
    consulta: 'Consulta',
    acompanhamento: 'Acompanhamento',
    online: 'Online',
    presencial: 'Presencial',
  })[type] || type;

const getStatusLabel = (status: AppointmentStatus) =>
  ({
    agendado: 'Agendado',
    confirmado: 'Confirmado',
    em_andamento: 'Em andamento',
    concluido: 'Concluido',
    cancelado: 'Cancelado',
    reagendado: 'Reagendado',
    nao_compareceu: 'Nao compareceu',
  })[status] || status;

export default function AcademyAiPage() {
  const { user } = useAuth();
  const {
    academyCodeRaw,
    personals,
    students,
    plans,
    invoices,
    loadingAcademy,
    academyError,
    reloadAcademy,
    reloadInvoices,
  } = useAcademyData();
  const [suggestions, setSuggestions] = useState<AcademyLinkSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [applyMessage, setApplyMessage] = useState('');
  const [includeAssigned, setIncludeAssigned] = useState(false);

  const [evaluations, setEvaluations] = useState<PhysicalEvaluation[]>([]);
  const [evaluationLoading, setEvaluationLoading] = useState(false);
  const [evaluationError, setEvaluationError] = useState('');

  const [invoicePlanId, setInvoicePlanId] = useState('');
  const [invoiceValue, setInvoiceValue] = useState('');
  const [invoiceDueDay, setInvoiceDueDay] = useState('');
  const [invoiceOnlyActive, setInvoiceOnlyActive] = useState(true);
  const [invoiceMessage, setInvoiceMessage] = useState('');
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceProgress, setInvoiceProgress] = useState({ total: 0, current: 0 });

  const [scheduleStartDate, setScheduleStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return toDateInputValue(date);
  });
  const [schedulePerDay, setSchedulePerDay] = useState('5');
  const [scheduleDuration, setScheduleDuration] = useState('60');
  const [scheduleStartHour, setScheduleStartHour] = useState('09:00');
  const [scheduleOnlyOverdue, setScheduleOnlyOverdue] = useState(true);
  const [scheduleMessage, setScheduleMessage] = useState('');
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [schedulePreview, setSchedulePreview] = useState<Appointment[]>([]);

  const hasOpenRouter = Boolean(
    process.env.NEXT_PUBLIC_OPENROUTER_API_KEY || process.env.EXPO_PUBLIC_OPENROUTER_API_KEY
  );

  const unassignedStudents = students.filter((student) => !student.codigoPersonal);
  const suggestionStudents = includeAssigned ? students : unassignedStudents;
  const canGenerate = hasOpenRouter && suggestionStudents.length > 0 && personals.length > 0;
  const suggestionCount = suggestions.length;
  const currentMonthLabel = useMemo(
    () =>
      new Date().toLocaleDateString('pt-BR', {
        month: 'long',
        year: 'numeric',
      }),
    []
  );

  const personalsByCode = useMemo(() => {
    const map = new Map<string, string>();
    personals.forEach((personal) => {
      if (personal.codigoPersonal === undefined || personal.codigoPersonal === null) return;
      map.set(String(personal.codigoPersonal), personal.displayName);
    });
    return map;
  }, [personals]);

  const evaluationSample = useMemo(() => students.slice(0, 40), [students]);
  const isSampled = students.length > evaluationSample.length;

  useEffect(() => {
    let active = true;
    if (!evaluationSample.length) {
      setEvaluations([]);
      return;
    }
    setEvaluationLoading(true);
    setEvaluationError('');
    fetchEvaluationsForStudents(evaluationSample.map((student) => student.id))
      .then((result) => {
        if (!active) return;
        if (result.error) {
          setEvaluationError(result.error);
        }
        setEvaluations(result.data || []);
      })
      .catch((err: any) => {
        if (!active) return;
        setEvaluationError(err.message || 'Erro ao carregar avaliacoes.');
      })
      .finally(() => {
        if (active) setEvaluationLoading(false);
      });
    return () => {
      active = false;
    };
  }, [evaluationSample]);

  const evaluationsByStudent = useMemo(() => {
    const map = new Map<string, PhysicalEvaluation[]>();
    evaluations.forEach((evaluation) => {
      const list = map.get(evaluation.userId) || [];
      list.push(evaluation);
      map.set(evaluation.userId, list);
    });
    map.forEach((list) => list.sort((a, b) => b.date.getTime() - a.date.getTime()));
    return map;
  }, [evaluations]);

  const evaluationTypeRows = useMemo(() => {
    const counts: Record<string, number> = {
      online: 0,
      personalizada: 0,
      postural: 0,
      fisica: 0,
    };
    evaluations.forEach((evaluation) => {
      counts[evaluation.type] = (counts[evaluation.type] || 0) + 1;
    });
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    return Object.entries(counts).map(([key, value]) => ({
      key,
      label: EVALUATION_LABELS[key] || key,
      count: value,
      percent: total ? Math.round((value / total) * 100) : 0,
    }));
  }, [evaluations]);

  const statusRows = useMemo(() => {
    const activeCount = students.filter((student) => student.status === 'ativo').length;
    const inactiveCount = students.length - activeCount;
    return [
      {
        key: 'ativos',
        label: 'Ativos',
        count: activeCount,
        percent: students.length ? Math.round((activeCount / students.length) * 100) : 0,
      },
      {
        key: 'inativos',
        label: 'Inativos',
        count: inactiveCount,
        percent: students.length ? Math.round((inactiveCount / students.length) * 100) : 0,
      },
      {
        key: 'sem-personal',
        label: 'Sem personal',
        count: unassignedStudents.length,
        percent: students.length ? Math.round((unassignedStudents.length / students.length) * 100) : 0,
      },
    ];
  }, [students, unassignedStudents.length]);

  const evaluationCoverage = useMemo(() => {
    let withEvaluation = 0;
    students.forEach((student) => {
      if ((evaluationsByStudent.get(student.id) || []).length) {
        withEvaluation += 1;
      }
    });
    return {
      withEvaluation,
      withoutEvaluation: students.length - withEvaluation,
    };
  }, [students, evaluationsByStudent]);

  const evaluationOps = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 60);

    let recent = 0;
    let overdue = 0;
    let never = 0;

    students.forEach((student) => {
      const latest = getLatestEvaluationDate(evaluationsByStudent.get(student.id) || []);
      if (!latest) {
        never += 1;
        overdue += 1;
        return;
      }

      if (latest < cutoff) {
        overdue += 1;
      } else {
        recent += 1;
      }
    });

    const coveragePercent = students.length
      ? Math.round((evaluationCoverage.withEvaluation / students.length) * 100)
      : 0;

    return {
      recent,
      overdue,
      never,
      coveragePercent,
    };
  }, [students, evaluationsByStudent, evaluationCoverage.withEvaluation]);

  const financeOps = useMemo(() => {
    const currentMonth = new Date();
    let pendingCount = 0;
    let pendingValue = 0;
    let billedThisMonth = 0;
    let paidThisMonth = 0;

    invoices.forEach((invoice) => {
      const value = Number(invoice.valorDaCombranca || 0);
      const isPaid = Boolean(invoice.pago);

      if (!isPaid) {
        pendingCount += 1;
        pendingValue += value;
      }

      const lastDate = invoice.datas?.length ? invoice.datas[invoice.datas.length - 1] : null;
      if (!lastDate || !isSameMonth(lastDate, currentMonth)) return;

      billedThisMonth += 1;
      if (isPaid) paidThisMonth += 1;
    });

    const paidRate = billedThisMonth ? Math.round((paidThisMonth / billedThisMonth) * 100) : 0;

    return {
      pendingCount,
      pendingValue,
      billedThisMonth,
      paidThisMonth,
      paidRate,
    };
  }, [invoices]);

  const pendingInvoicesByStudent = useMemo(() => {
    const map = new Map<
      string,
      {
        count: number;
        amount: number;
        lastDate: Date | null;
      }
    >();

    invoices.forEach((invoice) => {
      if (!invoice.studentId || invoice.pago) return;
      const current = map.get(invoice.studentId) || { count: 0, amount: 0, lastDate: null };
      current.count += 1;
      current.amount += Number(invoice.valorDaCombranca || 0);
      const issueDate = invoice.datas?.length ? invoice.datas[invoice.datas.length - 1] : null;
      if (issueDate && (!current.lastDate || issueDate > current.lastDate)) {
        current.lastDate = issueDate;
      }
      map.set(invoice.studentId, current);
    });

    return map;
  }, [invoices]);

  const linkOps = useMemo(() => {
    const assigned = students.length - unassignedStudents.length;
    const linkageRate = students.length ? Math.round((assigned / students.length) * 100) : 0;
    const avgPerPersonal = personals.length ? Number((assigned / personals.length).toFixed(1)) : 0;
    return {
      assigned,
      linkageRate,
      avgPerPersonal,
    };
  }, [students.length, unassignedStudents.length, personals.length]);

  const operationalQueue = useMemo(
    () => unassignedStudents.length + evaluationOps.overdue + financeOps.pendingCount,
    [unassignedStudents.length, evaluationOps.overdue, financeOps.pendingCount]
  );

  const priorityQueue = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 60);

    return students
      .map((student) => {
        const latestEvaluation = getLatestEvaluationDate(evaluationsByStudent.get(student.id) || []);
        const needsEvaluation = !latestEvaluation || latestEvaluation < cutoff;
        const needsLinking = !student.codigoPersonal;
        const pendingFinance = pendingInvoicesByStudent.get(student.id);
        const pendingCount = pendingFinance?.count || 0;
        const pendingAmount = pendingFinance?.amount || 0;
        const score =
          (needsLinking ? 3 : 0) + (needsEvaluation ? 2 : 0) + Math.min(3, pendingCount);

        if (!score) return null;

        return {
          id: student.id,
          name: student.name,
          personalName:
            (student.codigoPersonal
              ? personalsByCode.get(String(student.codigoPersonal))
              : student.personalName) || 'Sem personal vinculado',
          latestEvaluation,
          needsEvaluation,
          needsLinking,
          pendingCount,
          pendingAmount,
          score,
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const first = a as NonNullable<typeof a>;
        const second = b as NonNullable<typeof b>;
        if (second.score !== first.score) return second.score - first.score;
        if (second.pendingAmount !== first.pendingAmount) return second.pendingAmount - first.pendingAmount;
        return first.name.localeCompare(second.name);
      })
      .slice(0, 10) as Array<{
      id: string;
      name: string;
      personalName: string;
      latestEvaluation: Date | null;
      needsEvaluation: boolean;
      needsLinking: boolean;
      pendingCount: number;
      pendingAmount: number;
      score: number;
    }>;
  }, [students, evaluationsByStudent, pendingInvoicesByStudent, personalsByCode]);

  const personalLoad = useMemo(() => {
    const counters = new Map<string, number>();
    students.forEach((student) => {
      if (!student.codigoPersonal) return;
      const code = String(student.codigoPersonal);
      counters.set(code, (counters.get(code) || 0) + 1);
    });

    return personals
      .map((personal) => {
        const code =
          personal.codigoPersonal === undefined || personal.codigoPersonal === null
            ? ''
            : String(personal.codigoPersonal);
        return {
          id: personal.id,
          code: code || '--',
          name: personal.displayName,
          students: code ? counters.get(code) || 0 : 0,
        };
      })
      .sort((a, b) => b.students - a.students);
  }, [students, personals]);

  const idlePersonals = useMemo(
    () => personalLoad.filter((personal) => personal.students === 0).length,
    [personalLoad]
  );

  const personalDistributionRows = useMemo(() => {
    const top = personalLoad.slice(0, 8);
    const peak = Math.max(...top.map((item) => item.students), 1);
    const linkedBase = Math.max(linkOps.assigned, 1);
    return top.map((item) => ({
      id: item.id,
      name: item.name,
      code: item.code,
      students: item.students,
      loadPercent: Math.round((item.students / peak) * 100),
      sharePercent: Math.round((item.students / linkedBase) * 100),
    }));
  }, [personalLoad, linkOps.assigned]);

  const operationHealth = useMemo(() => {
    const linkScore = linkOps.linkageRate;
    const evaluationScore = students.length
      ? Math.max(0, 100 - Math.round((evaluationOps.overdue / students.length) * 100))
      : 100;
    const financeScore = financeOps.billedThisMonth
      ? financeOps.paidRate
      : financeOps.pendingCount
        ? 0
        : 100;

    const score = Math.round(linkScore * 0.4 + evaluationScore * 0.35 + financeScore * 0.25);

    let level = 'Critico';
    if (score >= 85) level = 'Operacao forte';
    else if (score >= 65) level = 'Operacao estavel';
    else if (score >= 45) level = 'Em atencao';

    return {
      score,
      level,
      linkScore,
      evaluationScore,
      financeScore,
    };
  }, [
    linkOps.linkageRate,
    students.length,
    evaluationOps.overdue,
    financeOps.billedThisMonth,
    financeOps.paidRate,
    financeOps.pendingCount,
  ]);

  const suggestionContext = useMemo(() => {
    if (!hasOpenRouter) {
      return {
        title: 'IA indisponivel neste ambiente',
        description: 'Configure a chave do OpenRouter para liberar sugestoes automaticas.',
      };
    }

    if (!students.length) {
      return {
        title: 'Nenhum aluno cadastrado',
        description: 'Cadastre alunos para que a IA possa montar recomendacoes de vinculo.',
      };
    }

    if (!personals.length) {
      return {
        title: 'Nenhum personal ativo',
        description: 'Adicione personais na academia antes de gerar sugestoes de distribuicao.',
      };
    }

    if (!includeAssigned && !unassignedStudents.length) {
      return {
        title: 'Todos os alunos ja estao vinculados',
        description:
          'Ative a opcao "Incluir alunos ja vinculados" para a IA revisar e otimizar a distribuicao.',
      };
    }

    return {
      title: loading ? 'Gerando sugestoes...' : 'Nenhuma sugestao carregada ainda',
      description: `Clique em atualizar para analisar ${suggestionStudents.length} alunos elegiveis.`,
    };
  }, [
    hasOpenRouter,
    students.length,
    personals.length,
    includeAssigned,
    unassignedStudents.length,
    loading,
    suggestionStudents.length,
  ]);

  const suggestionPlaybook = useMemo(() => {
    const items: Array<{
      id: string;
      title: string;
      description: string;
      actionLabel: string;
      href?: string;
      actionType?: 'enableAssigned';
    }> = [];

    if (unassignedStudents.length > 0) {
      items.push({
        id: 'linking',
        title: `${unassignedStudents.length} alunos sem personal`,
        description: 'Priorize vinculo para liberar acompanhamento e agendamento com personal.',
        actionLabel: 'Abrir vinculos',
        href: '/academy/linking',
      });
    }

    if (evaluationOps.overdue > 0) {
      items.push({
        id: 'evaluation',
        title: `${evaluationOps.overdue} com avaliacao atrasada`,
        description: 'Agende revisao fisica para manter prescricao atualizada e reduzir risco.',
        actionLabel: 'Abrir agenda',
        href: '/academy/agenda',
      });
    }

    if (financeOps.pendingCount > 0) {
      items.push({
        id: 'finance',
        title: `${financeOps.pendingCount} faturas em aberto`,
        description: 'Regularize pendencias para manter previsibilidade de caixa no mes.',
        actionLabel: 'Abrir financeiro',
        href: '/academy/billing',
      });
    }

    if (!includeAssigned && !unassignedStudents.length && students.length > 0 && personals.length > 0) {
      items.push({
        id: 'redistribute',
        title: 'Redistribuir base vinculada',
        description: 'Sua base esta vinculada. A IA pode sugerir melhorias de carteira entre personais.',
        actionLabel: 'Incluir vinculados',
        actionType: 'enableAssigned',
      });
    }

    if (!items.length) {
      items.push({
        id: 'stable',
        title: 'Operacao sem pendencia critica',
        description:
          'A academia esta equilibrada. Gere uma rodada para validar oportunidades de otimizacao.',
        actionLabel: 'Atualizar sugestoes',
      });
    }

    return items.slice(0, 4);
  }, [
    unassignedStudents.length,
    evaluationOps.overdue,
    financeOps.pendingCount,
    includeAssigned,
    students.length,
    personals.length,
  ]);

  const getStudentEvaluationSummary = (studentId: string) => {
    const list = evaluationsByStudent.get(studentId) || [];
    if (!list.length) return 'Sem avaliacoes registradas.';
    const latest = list[0];
    const pieces = [
      `Total ${list.length}`,
      `Ultima ${EVALUATION_LABELS[latest.type] || latest.type} em ${formatDate(latest.date)}`,
    ];
    const metrics = getLastPhysicalMetrics(latest);
    if (metrics.length) pieces.push(metrics.join(', '));
    return `${pieces.join('. ')}.`;
  };

  const handleGenerate = async () => {
    if (!hasOpenRouter) {
      setError('OpenRouter nao configurado.');
      return;
    }
    if (!personals.length) {
      setError('Nenhum personal ativo encontrado para gerar sugestoes.');
      return;
    }
    if (!suggestionStudents.length) {
      if (!students.length) {
        setError('Nenhum aluno cadastrado para analisar.');
      } else if (!includeAssigned && !unassignedStudents.length) {
        setError('Todos os alunos ja estao vinculados. Ative "Incluir alunos ja vinculados".');
      } else {
        setError('Sem alunos elegiveis para gerar sugestoes.');
      }
      return;
    }

    setLoading(true);
    setError('');
    setApplyMessage('');
    try {
      const result = await generateAcademyLinkSuggestions({
        students: suggestionStudents.slice(0, 8).map((student) => ({
          name: student.name,
          goal: student.goal,
          level: student.level,
          lastActive: student.lastActive ? formatDate(student.lastActive) : undefined,
          evaluationSummary: getStudentEvaluationSummary(student.id),
        })),
        personals: personals.slice(0, 8).map((personal) => ({
          name: personal.displayName,
          code: personal.codigoPersonal,
          specialty: Array.isArray(personal.especializacao)
            ? personal.especializacao.join(', ')
            : personal.especializacao,
        })),
      });
      setSuggestions(result);
      if (!result.length) {
        setError('Nenhuma sugestao encontrada.');
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao gerar sugestoes.');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async (suggestion: AcademyLinkSuggestion) => {
    const student = students.find(
      (item) => item.name.toLowerCase() === suggestion.studentName.toLowerCase()
    );
    const personal = personals.find((item) => {
      if (suggestion.personalCode) {
        return String(item.codigoPersonal || '') === String(suggestion.personalCode);
      }
      return item.displayName.toLowerCase() === suggestion.personalName.toLowerCase();
    });

    if (!student || !personal || !personal.codigoPersonal) {
      setApplyMessage('Nao foi possivel aplicar a sugestao.');
      return;
    }

    setApplyMessage('');
    try {
      const capacity = await firestoreService.getPersonalStudentCapacityByCode(personal.codigoPersonal, {
        excludeUserId: student.id,
      });
      if (!capacity.allowed) {
        setApplyMessage(
          capacity.reason === 'personal_not_found'
            ? 'Codigo do personal nao encontrado.'
            : 'Esse personal atingiu o limite de 4 alunos no plano gratuito. Peca para ele assinar o Premium para liberar alunos ilimitados.'
        );
        return;
      }

      const db = getFirebaseDb();
      await updateDoc(doc(db, 'users', student.id), {
        codigoPersonal: personal.codigoPersonal,
        codigoAcademia: academyCodeRaw,
        vinculadoPorAcademia: true,
        personalVinculadoEm: serverTimestamp(),
        nameDoSeuPersonal: personal.displayName || capacity.personalName,
      });
      setApplyMessage(`Aluno ${student.name} vinculado ao personal ${personal.displayName}.`);
      await reloadAcademy();
    } catch (err: any) {
      setApplyMessage(err.message || 'Erro ao aplicar sugestao.');
    }
  };

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === invoicePlanId) || null,
    [plans, invoicePlanId]
  );

  const invoiceAmount = useMemo(() => {
    if (selectedPlan) return selectedPlan.valor;
    const parsed = Number(invoiceValue.replace(',', '.'));
    return Number.isNaN(parsed) ? 0 : parsed;
  }, [selectedPlan, invoiceValue]);

  const candidatesForInvoice = useMemo(() => {
    const base = invoiceOnlyActive ? students.filter((s) => s.status === 'ativo') : students;
    const month = new Date();
    const existing = new Set<string>();
    invoices.forEach((invoice) => {
      if (!invoice.studentId) return;
      if (selectedPlan && invoice.planName !== selectedPlan.nome) return;
      const lastDate = invoice.datas?.length ? invoice.datas[invoice.datas.length - 1] : null;
      if (lastDate && isSameMonth(lastDate, month)) {
        existing.add(invoice.studentId);
      }
    });
    return base.filter((student) => !existing.has(student.id));
  }, [students, invoices, invoiceOnlyActive, selectedPlan]);

  const estimatedInvoiceTotal = invoiceAmount * candidatesForInvoice.length;

  const handleAutoInvoices = async () => {
    if (!user?.uid) {
      setInvoiceMessage('Conta da academia nao encontrada.');
      return;
    }
    if (!invoiceAmount || invoiceAmount <= 0) {
      setInvoiceMessage('Informe o valor da cobranca ou escolha um plano.');
      return;
    }
    if (!candidatesForInvoice.length) {
      setInvoiceMessage('Nenhum aluno disponivel para faturar.');
      return;
    }

    const dueDay = invoiceDueDay ? Number(invoiceDueDay) : undefined;
    if (dueDay && (Number.isNaN(dueDay) || dueDay < 1 || dueDay > 31)) {
      setInvoiceMessage('Dia de vencimento invalido.');
      return;
    }

    setInvoiceLoading(true);
    setInvoiceMessage('');
    setInvoiceProgress({ total: candidatesForInvoice.length, current: 0 });
    let success = 0;
    for (let i = 0; i < candidatesForInvoice.length; i += 1) {
      const student = candidatesForInvoice[i];
      const result = await createPaymentForUser(student.id, {
        valorDaCombranca: invoiceAmount,
        descricao: selectedPlan?.nome || 'Cobranca automatica',
        todoDiaDoMes: dueDay,
        pago: false,
        repetirPMes: 1,
        datas: [new Date()],
        academyCode: academyCodeRaw || undefined,
        personalCode: student.codigoPersonal,
        planName: selectedPlan?.nome,
        createdByAcademy: true,
        academyId: user.uid,
      });
      if (!result.error) success += 1;
      setInvoiceProgress({ total: candidatesForInvoice.length, current: i + 1 });
    }
    setInvoiceLoading(false);
    setInvoiceMessage(`Faturas criadas: ${success} de ${candidatesForInvoice.length}.`);
    await reloadInvoices();
  };

  const buildSchedulePreview = async (): Promise<Appointment[]> => {
    const baseDate = parseDateInput(scheduleStartDate);
    const perDay = Math.max(1, Number(schedulePerDay) || 1);
    const duration = Math.max(30, Number(scheduleDuration) || 60);
    const startMinutes = parseTime(scheduleStartHour);
    const now = new Date();
    const cutoff = new Date();
    cutoff.setDate(now.getDate() + 30);

    const candidates = students.filter((student) => {
      if (student.status !== 'ativo') return false;
      if (!student.codigoPersonal) return false;
      if (!scheduleOnlyOverdue) return true;
      const list = evaluationsByStudent.get(student.id) || [];
      const latest = getLatestEvaluationDate(list);
      if (!latest) return true;
      const diff = now.getTime() - latest.getTime();
      return diff > 1000 * 60 * 60 * 24 * 60;
    });

    if (!candidates.length) {
      setSchedulePreview([]);
      return [];
    }

    const existingResult = await fetchAppointmentsForStudents(candidates.map((item) => item.id));
    const upcomingMap = new Map<string, boolean>();
    (existingResult.data || []).forEach((appointment) => {
      if (appointment.tipo !== 'avaliacao') return;
      if (appointment.data > now && appointment.data < cutoff) {
        upcomingMap.set(appointment.alunoId, true);
      }
    });

    const filtered = candidates.filter((student) => !upcomingMap.get(student.id));
    const previews: Appointment[] = [];

    filtered.slice(0, 40).forEach((student, index) => {
      const personal = personals.find(
        (item) => String(item.codigoPersonal || '') === String(student.codigoPersonal)
      );
      if (!personal) return;
      const dayOffset = Math.floor(index / perDay);
      const slotIndex = index % perDay;
      const minutesStart = startMinutes + slotIndex * duration;
      const minutesEnd = minutesStart + duration;
      const date = new Date(baseDate);
      date.setDate(baseDate.getDate() + dayOffset);
      previews.push({
        id: `preview-${student.id}`,
        alunoId: student.id,
        personalId: personal.id,
        alunoNome: student.name,
        personalNome: personal.displayName,
        data: date,
        horaInicio: formatTime(minutesStart),
        horaFim: formatTime(minutesEnd),
        tipo: 'avaliacao',
        status: 'agendado',
        servico: 'Avaliacao fisica',
        createdAt: new Date(),
      });
    });

    setSchedulePreview(previews);
    return previews;
  };

  const handleAutoSchedule = async () => {
    setScheduleLoading(true);
    setScheduleMessage('');
    const previews = await buildSchedulePreview();
    if (!previews.length) {
      setScheduleMessage('Nenhum aluno elegivel para agendar.');
      setScheduleLoading(false);
      return;
    }

    let success = 0;
    for (let i = 0; i < previews.length; i += 1) {
      const appointment = previews[i];
      const result = await createAppointment({
        alunoId: appointment.alunoId,
        personalId: appointment.personalId,
        alunoNome: appointment.alunoNome,
        personalNome: appointment.personalNome,
        data: appointment.data,
        horaInicio: appointment.horaInicio,
        horaFim: appointment.horaFim,
        tipo: appointment.tipo,
        status: 'agendado',
        servico: appointment.servico,
      });
      if (!result.error) success += 1;
    }
    setScheduleLoading(false);
    setScheduleMessage(`Agendamentos criados: ${success} de ${previews.length}.`);
  };

  return (
    <PageShell
      title="IA da academia"
      description="Distribuicao inteligente, automacoes e insights da base."
      actions={[
        { label: 'Agenda', href: '/academy/agenda' },
        { label: 'Vincular manualmente', href: '/academy/linking' },
      ]}
    >
      <AcademyGate>
        {academyError && (
          <div className="academy-alert is-danger" style={{ marginBottom: 20 }}>
            <div>
              <strong>Erro ao carregar</strong>
              <span>{academyError}</span>
            </div>
          </div>
        )}

        <div className="academy-dashboard academy-ai-console">
          <section className="ai-console-overview">
            <div className="ai-console-overview-main">
              <p className="ai-console-eyebrow">Operacao IA</p>
              <h2>Painel operacional para vinculo, avaliacao e cobranca.</h2>
              <p className="subtle">
                Este painel mostra fila real de acao da academia. A IA ajuda no vinculo de alunos,
                mas as prioridades financeiras e de avaliacao ficam visiveis em uma unica tela.
              </p>
              <div className="ai-console-actions">
                <button
                  type="button"
                  className="button"
                  onClick={handleGenerate}
                  disabled={loading || !canGenerate || loadingAcademy}
                >
                  {loading ? 'Gerando...' : 'Gerar sugestoes IA'}
                </button>
                <Link href="/academy/students" className="button secondary">
                  Abrir alunos
                </Link>
                <Link href="/academy/linking" className="button secondary">
                  Ajustar vinculos
                </Link>
                <Link href="/academy/agenda" className="button secondary">
                  Abrir agenda
                </Link>
              </div>
              <div className="ai-console-status">
                <span className="ai-console-chip">Painel da academia</span>
                <span className={`ai-console-chip ${hasOpenRouter ? 'is-on' : 'is-off'}`}>
                  IA {hasOpenRouter ? 'Ativa' : 'Inativa'}
                </span>
                <span className="ai-console-chip">{students.length} alunos na base</span>
                <span className="ai-console-chip is-alert">
                  Fila hoje {loadingAcademy ? '...' : operationalQueue}
                </span>
              </div>
            </div>
            <aside className="ai-console-overview-side">
              <div className="ai-console-health">
                <span>Saude operacional</span>
                <strong>{loadingAcademy ? '...' : `${operationHealth.score}/100`}</strong>
                <small>{operationHealth.level}</small>
              </div>
              <div className="ai-console-health-breakdown">
                <div>
                  <span>Vinculos</span>
                  <strong>{loadingAcademy ? '...' : `${operationHealth.linkScore}%`}</strong>
                </div>
                <div>
                  <span>Avaliacoes</span>
                  <strong>{evaluationLoading ? '...' : `${operationHealth.evaluationScore}%`}</strong>
                </div>
                <div>
                  <span>Financeiro</span>
                  <strong>{`${operationHealth.financeScore}%`}</strong>
                </div>
              </div>
              {isSampled && (
                <span className="ai-console-note">Analise de avaliacao feita em amostra de 40 alunos.</span>
              )}
            </aside>
          </section>

          <section className="ai-console-priority-grid">
            <article className="ai-console-priority-card is-link">
              <span>Vinculos pendentes</span>
              <strong>{loadingAcademy ? '...' : unassignedStudents.length}</strong>
              <small>{linkOps.linkageRate}% da base ja vinculada a personal</small>
              <Link href="/academy/linking" className="button secondary sm">
                Resolver vinculos
              </Link>
            </article>
            <article className="ai-console-priority-card is-evaluation">
              <span>Avaliacao fora do prazo</span>
              <strong>{evaluationLoading ? '...' : evaluationOps.overdue}</strong>
              <small>
                {evaluationOps.never} sem avaliacao e {evaluationOps.recent} em dia
              </small>
              <Link href="/academy/agenda" className="button secondary sm">
                Abrir agenda
              </Link>
            </article>
            <article className="ai-console-priority-card is-finance">
              <span>Financeiro em aberto</span>
              <strong>{formatCurrency(financeOps.pendingValue)}</strong>
              <small>
                {financeOps.pendingCount} faturas pendentes em {currentMonthLabel}
              </small>
              <Link href="/academy/billing" className="button secondary sm">
                Abrir financeiro
              </Link>
            </article>
            <article className="ai-console-priority-card is-capacity">
              <span>Capacidade da equipe</span>
              <strong>{loadingAcademy ? '...' : linkOps.avgPerPersonal}</strong>
              <small>
                media de alunos por personal, {idlePersonals} personal sem carteira
              </small>
              <Link href="/academy/personals" className="button secondary sm">
                Abrir personais
              </Link>
            </article>
          </section>

          <section className="ai-console-workboard">
            <div className="ai-console-panel ai-console-queue">
              <div className="ai-console-panel-head">
                <div>
                  <p className="ai-console-eyebrow">Fila de acao</p>
                  <h3>Alunos para tratar hoje</h3>
                  <p className="subtle">
                    Prioridade combinando falta de personal, avaliacao vencida e pendencia financeira.
                  </p>
                </div>
              </div>
              {priorityQueue.length ? (
                <div className="ai-console-task-list">
                  {priorityQueue.map((item) => (
                    <article key={item.id} className="ai-console-task-item">
                      <div className="ai-console-task-main">
                        <strong>{item.name}</strong>
                        <p className="subtle">{item.personalName}</p>
                        <small className="ai-console-task-sub">
                          {item.latestEvaluation
                            ? `Ultima avaliacao ${formatDate(item.latestEvaluation)}`
                            : 'Sem avaliacao registrada'}
                          {item.pendingAmount
                            ? ` | ${formatCurrency(item.pendingAmount)} em aberto`
                            : ''}
                        </small>
                      </div>
                      <div className="ai-console-task-meta">
                        {item.needsLinking && <span className="ai-console-pill is-link">Sem personal</span>}
                        {item.needsEvaluation && (
                          <span className="ai-console-pill is-evaluation">Avaliacao atrasada</span>
                        )}
                        {item.pendingCount > 0 && (
                          <span className="ai-console-pill is-finance">{item.pendingCount} faturas</span>
                        )}
                        <span className="ai-console-score">{item.score} pts</span>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="ai-console-empty">
                  <strong>Sem fila critica no momento</strong>
                  <p className="subtle">A base atual nao possui alunos com prioridade combinada.</p>
                </div>
              )}
            </div>

            <div className="ai-console-panel ai-console-capacity-board">
              <div className="ai-console-panel-head">
                <div>
                  <p className="ai-console-eyebrow">Equipe</p>
                  <h3>Distribuicao por personal</h3>
                  <p className="subtle">
                    Compare a carga por personal para equilibrar novos vinculos da academia.
                  </p>
                </div>
              </div>
              <div className="ai-console-capacity-metrics">
                <div>
                  <span>Personais ativos</span>
                  <strong>{personals.length}</strong>
                </div>
                <div>
                  <span>Maior carteira</span>
                  <strong>{personalLoad[0] ? `${personalLoad[0].students} alunos` : '--'}</strong>
                </div>
                <div>
                  <span>Sem alunos</span>
                  <strong>{idlePersonals}</strong>
                </div>
              </div>
              {personalLoad.length ? (
                <div className="ai-console-capacity-list">
                  {personalLoad.slice(0, 6).map((personal) => (
                    <div key={personal.id} className="ai-console-capacity-item">
                      <div>
                        <strong>{personal.name}</strong>
                        <span>Codigo {personal.code}</span>
                      </div>
                      <span>{personal.students} alunos</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="subtle">Nenhum personal ativo encontrado para esta academia.</p>
              )}
            </div>
          </section>

          <section className="ai-console-grid">
            <div className="ai-console-panel ai-console-suggestions">
              <div className="ai-console-panel-head">
                <div>
                  <p className="ai-console-eyebrow">Distribuicao inteligente</p>
                  <h3>Sugestoes da IA</h3>
                  <p className="subtle">
                    {includeAssigned
                      ? `Modo redistribuicao: ${suggestionStudents.length} alunos para ${personals.length} personais.`
                      : `Modo vinculo inicial: ${unassignedStudents.length} sem personal para ${personals.length} personais.`}
                  </p>
                </div>
                <div className="ai-console-panel-actions">
                  <label className="academy-ai-toggle">
                    <input
                      type="checkbox"
                      checked={includeAssigned}
                      onChange={(event) => setIncludeAssigned(event.target.checked)}
                    />
                    <span>Incluir alunos ja vinculados</span>
                  </label>
                  <button
                    type="button"
                    className="button secondary sm"
                    onClick={handleGenerate}
                    disabled={loading || !canGenerate || loadingAcademy}
                  >
                    {loading
                      ? 'Gerando...'
                      : includeAssigned
                        ? 'Gerar redistribuicao'
                        : 'Gerar sugestoes de vinculo'}
                  </button>
                </div>
              </div>

              {!hasOpenRouter && (
                <div className="academy-alert">
                  <div>
                    <strong>OpenRouter nao configurado</strong>
                    <span>Adicione a chave para liberar as sugestoes inteligentes.</span>
                  </div>
                </div>
              )}
              {error && (
                <div className="academy-alert is-danger">
                  <div>
                    <strong>Erro na IA</strong>
                    <span>{error}</span>
                  </div>
                </div>
              )}
              {applyMessage && (
                <div className="academy-alert">
                  <div>
                    <strong>Acao aplicada</strong>
                    <span>{applyMessage}</span>
                  </div>
                </div>
              )}
              {suggestionCount ? (
                <div className="ai-console-suggest-list">
                  {suggestions.map((suggestion) => {
                    const target = students.find(
                      (item) => item.name.toLowerCase() === suggestion.studentName.toLowerCase()
                    );
                    return (
                      <article
                        key={`${suggestion.studentName}-${suggestion.personalName}`}
                        className="ai-console-suggest-card"
                      >
                        <header>
                          <div>
                            <span className="ai-console-tag">Aluno</span>
                            <strong>{suggestion.studentName}</strong>
                            <p className="subtle">
                              {target ? getStudentEvaluationSummary(target.id) : 'Sem dados extras.'}
                            </p>
                          </div>
                          <span className="academy-pill is-paid">Sugestao pronta</span>
                        </header>
                        <div className="ai-console-suggest-body">
                          <div>
                            <span className="ai-console-tag">Personal sugerido</span>
                            <strong>
                              {suggestion.personalName}
                              {suggestion.personalCode ? ` (codigo ${suggestion.personalCode})` : ''}
                            </strong>
                          </div>
                          <div>
                            <span className="ai-console-tag">Motivo</span>
                            <p className="subtle">
                              {suggestion.reason || 'Compatibilidade baseada nos dados do aluno.'}
                            </p>
                          </div>
                        </div>
                        <div className="ai-console-suggest-actions">
                          <button
                            type="button"
                            className="button secondary sm"
                            onClick={() => handleApply(suggestion)}
                          >
                            Aplicar sugestao
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="ai-console-empty">
                  <strong>{suggestionContext.title}</strong>
                  <p className="subtle">
                    {suggestionContext.description}
                  </p>
                  <div className="ai-console-empty-actions">
                    {!includeAssigned && !unassignedStudents.length && students.length > 0 && (
                      <button
                        type="button"
                        className="button secondary sm"
                        onClick={() => setIncludeAssigned(true)}
                      >
                        Incluir alunos vinculados
                      </button>
                    )}
                    {canGenerate && (
                      <button type="button" className="button secondary sm" onClick={handleGenerate}>
                        Gerar agora
                      </button>
                    )}
                  </div>
                </div>
              )}

              {!suggestionCount && (
                <div className="ai-console-guidance">
                  <span className="ai-console-tag">Plano de acao recomendado</span>
                  <div className="ai-console-guidance-list">
                    {suggestionPlaybook.map((item) => (
                      <article key={item.id} className="ai-console-guidance-item">
                        <div>
                          <strong>{item.title}</strong>
                          <p className="subtle">{item.description}</p>
                        </div>
                        {item.href ? (
                          <Link href={item.href} className="button secondary sm">
                            {item.actionLabel}
                          </Link>
                        ) : item.actionType === 'enableAssigned' ? (
                          <button
                            type="button"
                            className="button secondary sm"
                            onClick={() => setIncludeAssigned(true)}
                          >
                            {item.actionLabel}
                          </button>
                        ) : (
                          <button type="button" className="button secondary sm" onClick={handleGenerate}>
                            {item.actionLabel}
                          </button>
                        )}
                      </article>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="ai-console-panel ai-console-insights">
              <div className="ai-console-panel-head">
                <div>
                  <p className="ai-console-eyebrow">Insights</p>
                  <h3>Indicadores de execucao</h3>
                  <p className="subtle">
                    Cobertura atual de {evaluationOps.coveragePercent}% com {evaluationOps.overdue}{' '}
                    alunos fora da janela de 60 dias, {evaluationOps.recent} em dia e{' '}
                    {financeOps.pendingCount} pendencias no financeiro.
                  </p>
                </div>
              </div>

              {evaluationError && (
                <div className="academy-alert is-danger">
                  <div>
                    <strong>Erro ao carregar avaliacoes</strong>
                    <span>{evaluationError}</span>
                  </div>
                </div>
              )}

              <div className="ai-console-insight-grid">
                <article className="ai-console-insight-list-card">
                  <h4>Avaliacoes por tipo</h4>
                  <div className="ai-console-insight-list">
                    {evaluationTypeRows.map((row) => (
                      <div key={row.key} className="ai-console-insight-row">
                        <div className="ai-console-insight-row-head">
                          <span>{row.label}</span>
                          <strong>{row.count}</strong>
                        </div>
                        <div className="ai-console-meter">
                          <span style={{ width: `${row.percent}%` }} />
                        </div>
                        <small>{row.percent}% das avaliacoes</small>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="ai-console-insight-list-card">
                  <h4>Status da base de alunos</h4>
                  <div className="ai-console-insight-list">
                    {statusRows.map((row) => (
                      <div key={row.key} className="ai-console-insight-row">
                        <div className="ai-console-insight-row-head">
                          <span>{row.label}</span>
                          <strong>{row.count}</strong>
                        </div>
                        <div className="ai-console-meter">
                          <span style={{ width: `${row.percent}%` }} />
                        </div>
                        <small>{row.percent}% da base total</small>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="ai-console-insight-list-card">
                  <h4>Carga por personal</h4>
                  {personalDistributionRows.length ? (
                    <div className="ai-console-insight-list">
                      {personalDistributionRows.map((row) => (
                        <div key={row.id} className="ai-console-insight-row">
                          <div className="ai-console-insight-row-head">
                            <span>
                              {row.name} ({row.code})
                            </span>
                            <strong>{row.students}</strong>
                          </div>
                          <div className="ai-console-meter">
                            <span style={{ width: `${row.loadPercent}%` }} />
                          </div>
                          <small>{row.sharePercent}% dos alunos vinculados</small>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="subtle">Sem personais vinculados para comparar carga.</p>
                  )}
                </article>
              </div>

              <div className="ai-console-insight-metrics">
                <div>
                  <span>Alunos com avaliacao</span>
                  <strong>{evaluationCoverage.withEvaluation}</strong>
                </div>
                <div>
                  <span>Avaliacoes atrasadas +60d</span>
                  <strong>{evaluationOps.overdue}</strong>
                </div>
                <div>
                  <span>Adimplencia ({currentMonthLabel})</span>
                  <strong>
                    {financeOps.billedThisMonth
                      ? `${financeOps.paidRate}% (${financeOps.paidThisMonth}/${financeOps.billedThisMonth})`
                      : 'Sem faturas no mes'}
                  </strong>
                </div>
                <div>
                  <span>Faturas pendentes</span>
                  <strong>{financeOps.pendingCount}</strong>
                </div>
              </div>
            </div>
          </section>

          <section className="ai-console-panel ai-console-automation">
            <div className="ai-console-panel-head">
              <div>
                <p className="ai-console-eyebrow">Automacoes</p>
                <h3>Faturas e agenda automatizadas</h3>
                <p className="subtle">
                  Prioridade atual: {financeOps.pendingCount} pendencias financeiras e{' '}
                  {evaluationOps.overdue} alunos sem avaliacao recente.
                </p>
              </div>
            </div>

            <div className="ai-console-automation-grid">
              <div className="ai-console-automation-card">
                <div>
                  <h4>Gerar faturas automaticamente</h4>
                  <p className="subtle">
                    Gera cobranca para elegiveis sem duplicar no mes corrente.
                  </p>
                </div>
                <div className="academy-form">
                  <label>
                    <span>Plano da academia</span>
                    <select
                      value={invoicePlanId}
                      onChange={(event) => setInvoicePlanId(event.target.value)}
                    >
                      <option value="">Selecionar plano</option>
                      {plans.map((plan) => (
                        <option key={plan.id} value={plan.id}>
                          {plan.nome} - {formatCurrency(plan.valor)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {!selectedPlan && (
                    <label>
                      <span>Valor manual</span>
                      <input
                        type="text"
                        value={invoiceValue}
                        onChange={(event) => setInvoiceValue(event.target.value)}
                        placeholder="150"
                      />
                    </label>
                  )}
                  <div className="academy-form-row">
                    <label>
                      <span>Dia de vencimento</span>
                      <input
                        type="number"
                        value={invoiceDueDay}
                        onChange={(event) => setInvoiceDueDay(event.target.value)}
                        placeholder="10"
                      />
                    </label>
                    <label className="academy-ai-toggle">
                      <input
                        type="checkbox"
                        checked={invoiceOnlyActive}
                        onChange={(event) => setInvoiceOnlyActive(event.target.checked)}
                      />
                      <span>Somente alunos ativos</span>
                    </label>
                  </div>
                  <div className="ai-console-batch-summary">
                    <span>Alunos elegiveis</span>
                    <strong>{candidatesForInvoice.length}</strong>
                    <span>Total estimado</span>
                    <strong>{invoiceAmount ? formatCurrency(estimatedInvoiceTotal) : '--'}</strong>
                    <span>Pendencias abertas</span>
                    <strong>{financeOps.pendingCount}</strong>
                  </div>
                  <button
                    type="button"
                    className="button"
                    onClick={handleAutoInvoices}
                    disabled={invoiceLoading}
                  >
                    {invoiceLoading ? 'Gerando...' : 'Gerar faturas'}
                  </button>
                  {invoiceProgress.total > 0 && (
                    <span className="academy-form-feedback">
                      Processando {invoiceProgress.current} de {invoiceProgress.total}
                    </span>
                  )}
                  {invoiceMessage && <span className="academy-form-feedback">{invoiceMessage}</span>}
                </div>
              </div>

              <div className="ai-console-automation-card">
                <div>
                  <h4>Automatizar agenda de avaliacoes</h4>
                  <p className="subtle">
                    Agenda avaliacao para alunos com personal que estao sem revisao recente.
                  </p>
                </div>
                <div className="academy-form">
                  <div className="academy-form-row">
                    <label>
                      <span>Data inicial</span>
                      <input
                        type="date"
                        value={scheduleStartDate}
                        onChange={(event) => setScheduleStartDate(event.target.value)}
                      />
                    </label>
                    <label>
                      <span>Sessoes por dia</span>
                      <input
                        type="number"
                        value={schedulePerDay}
                        onChange={(event) => setSchedulePerDay(event.target.value)}
                      />
                    </label>
                  </div>
                  <div className="academy-form-row">
                    <label>
                      <span>Duracao (min)</span>
                      <input
                        type="number"
                        value={scheduleDuration}
                        onChange={(event) => setScheduleDuration(event.target.value)}
                      />
                    </label>
                    <label>
                      <span>Horario inicial</span>
                      <input
                        type="time"
                        value={scheduleStartHour}
                        onChange={(event) => setScheduleStartHour(event.target.value)}
                      />
                    </label>
                  </div>
                  <label className="academy-ai-toggle">
                    <input
                      type="checkbox"
                      checked={scheduleOnlyOverdue}
                      onChange={(event) => setScheduleOnlyOverdue(event.target.checked)}
                    />
                    <span>Somente alunos sem avaliacao nos ultimos 60 dias</span>
                  </label>
                  <button
                    type="button"
                    className="button"
                    onClick={handleAutoSchedule}
                    disabled={scheduleLoading}
                  >
                    {scheduleLoading ? 'Agendando...' : 'Criar agenda'}
                  </button>
                  {scheduleMessage && <span className="academy-form-feedback">{scheduleMessage}</span>}
                </div>
              </div>
            </div>
          </section>

          <section className="ai-console-panel ai-console-preview">
            <div className="ai-console-panel-head">
              <div>
                <p className="ai-console-eyebrow">Preview</p>
                <h3>Agenda gerada</h3>
                <p className="subtle">Ultimos agendamentos criados pela automacao da IA.</p>
              </div>
              <div className="ai-console-panel-actions">
                <Link href="/academy/agenda" className="button secondary sm">
                  Ver agenda completa
                </Link>
              </div>
            </div>
            {schedulePreview.length ? (
              <div className="ai-console-preview-list">
                {schedulePreview.slice(0, 6).map((appointment) => (
                  <div key={appointment.id} className="ai-console-preview-card">
                    <div>
                      <strong>{appointment.alunoNome || 'Aluno'}</strong>
                      <span>{appointment.personalNome || 'Personal'}</span>
                    </div>
                    <div className="ai-console-preview-meta">
                      <span>{formatDate(appointment.data)}</span>
                      <span>
                        {appointment.horaInicio} - {appointment.horaFim}
                      </span>
                      <span className="academy-pill">
                        {getAppointmentLabel(appointment.tipo)}
                      </span>
                      <span className="academy-pill">{getStatusLabel(appointment.status)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="subtle">Nenhum agendamento gerado ainda.</p>
            )}
          </section>
        </div>
      </AcademyGate>
    </PageShell>
  );
}




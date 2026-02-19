'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import PageShell from '@/components/PageShell';
import { useAuth } from '@/lib/auth';
import { useDashboardData } from '@/lib/hooks/useDashboardData';
import { firestoreHelpers, formatDate, useCollectionData } from '@/lib/firestoreHooks';
import { generateText } from '@/lib/services/ai';
import { firestoreService } from '@/lib/services/firestoreService';

interface UserRow {
  id: string;
  displayName?: string;
  email?: string;
  role?: string;
  createdTime?: any;
}

interface StudentCard {
  id: string;
  name: string;
  email?: string;
  photoUrl?: string;
  personalPhotoUrl?: string;
  status?: string;
  createdAt?: Date;
  lastActive?: Date;
  role?: string;
  codigoAcademia?: string | number;
  vinculadoPorAcademia?: boolean;
}

type PromoThemeKey = 'oceano' | 'energia' | 'grafite';
type PromoFormatKey = 'feed' | 'story' | 'square';
type PromoTextEffectKey = 'clean' | 'shadow' | 'outline' | 'neon' | 'gradient' | 'glass' | 'lift';
type PromoBackgroundEffectKey = 'texture' | 'rings' | 'dots' | 'wave' | 'mesh' | 'burst';
type PromoTextAlignKey = 'left' | 'center' | 'right';
type PromoAiToneKey = 'conversion' | 'motivational' | 'premium';
type PromoPostModeKey = 'invite' | 'general';
type AdminPostPresetKey = 'venda' | 'motivacao' | 'resultado' | 'comunidade';
type PromoLayoutKey = 'impact' | 'center-stage' | 'split-right' | 'minimal';
type PromoFilterKey = 'none' | 'cinematic' | 'cold' | 'warm' | 'mono';
type PromoFontKey = 'brand' | 'clean' | 'headline' | 'editorial' | 'athletic';
type PromoPhotoFitKey = 'cover' | 'contain';
type PromoStickerKey = 'none' | 'mh-badge' | 'spark' | 'target' | 'bolt';
type PromoStickerLayerKey = 'back' | 'front';
interface PromoAiCopy {
  title: string;
  subtitle: string;
  cta: string;
}
interface PromoAiCopyLimits {
  titleMinChars: number;
  titleMaxChars: number;
  titleMinWords: number;
  subtitleMinChars: number;
  subtitleMaxChars: number;
  subtitleMinWords: number;
  ctaMinChars: number;
  ctaMaxChars: number;
  ctaMinWords: number;
}

const PROMO_THEME_LABELS: Record<PromoThemeKey, string> = {
  oceano: 'Oceano',
  energia: 'Energia',
  grafite: 'Grafite',
};

const PROMO_TEXT_EFFECT_LABELS: Record<PromoTextEffectKey, string> = {
  clean: 'Limpo',
  shadow: 'Sombra',
  outline: 'Contorno',
  neon: 'Neon',
  gradient: 'Gradiente',
  glass: 'Vidro',
  lift: 'Relevo',
};

const PROMO_BACKGROUND_EFFECT_LABELS: Record<PromoBackgroundEffectKey, string> = {
  texture: 'Linhas',
  rings: 'Aneis',
  dots: 'Pontos',
  wave: 'Ondas',
  mesh: 'Mesh',
  burst: 'Explosao',
};

const PROMO_TEXT_ALIGN_LABELS: Record<PromoTextAlignKey, string> = {
  left: 'Esquerda',
  center: 'Centro',
  right: 'Direita',
};

const PROMO_AI_TONE_LABELS: Record<PromoAiToneKey, string> = {
  conversion: 'Conversao',
  motivational: 'Motivacional',
  premium: 'Premium',
};

const PROMO_LAYOUT_LABELS: Record<PromoLayoutKey, string> = {
  impact: 'Impacto',
  'center-stage': 'Centro',
  'split-right': 'Split',
  minimal: 'Minimal',
};

const PROMO_FILTER_LABELS: Record<PromoFilterKey, string> = {
  none: 'Natural',
  cinematic: 'Cinema',
  cold: 'Frio',
  warm: 'Quente',
  mono: 'Mono',
};

const PROMO_FONT_LABELS: Record<PromoFontKey, string> = {
  brand: 'Brand',
  clean: 'Clean',
  headline: 'Headline',
  editorial: 'Editorial',
  athletic: 'Athletic',
};

const PROMO_PHOTO_FIT_LABELS: Record<PromoPhotoFitKey, string> = {
  cover: 'Preencher',
  contain: 'Mostrar completa',
};

const PROMO_STICKER_LABELS: Record<PromoStickerKey, string> = {
  none: 'Sem sticker',
  'mh-badge': 'MH',
  spark: 'Estrela',
  target: 'Alvo',
  bolt: 'Raio',
};

const PROMO_STICKER_LAYER_LABELS: Record<PromoStickerLayerKey, string> = {
  back: 'Atras do texto',
  front: 'Na frente do texto',
};

const PROMO_THEME_COLORS: Record<
  PromoThemeKey,
  {
    bgStart: string;
    bgEnd: string;
    accent: string;
    accentSoft: string;
    text: string;
    muted: string;
  }
> = {
  oceano: {
    bgStart: '#031327',
    bgEnd: '#123d72',
    accent: '#59b8ff',
    accentSoft: 'rgba(89, 184, 255, 0.2)',
    text: '#eff6ff',
    muted: 'rgba(239, 246, 255, 0.78)',
  },
  energia: {
    bgStart: '#1f123f',
    bgEnd: '#b32f6d',
    accent: '#ffd36c',
    accentSoft: 'rgba(255, 211, 108, 0.2)',
    text: '#fff9ee',
    muted: 'rgba(255, 249, 238, 0.8)',
  },
  grafite: {
    bgStart: '#131821',
    bgEnd: '#37445a',
    accent: '#8ad0ff',
    accentSoft: 'rgba(138, 208, 255, 0.2)',
    text: '#f6fbff',
    muted: 'rgba(246, 251, 255, 0.8)',
  },
};

const PROMO_FORMATS: Record<
  PromoFormatKey,
  {
    label: string;
    width: number;
    height: number;
    previewAspect: string;
  }
> = {
  feed: {
    label: 'Post feed',
    width: 1080,
    height: 1350,
    previewAspect: '4 / 5',
  },
  story: {
    label: 'Post story',
    width: 1080,
    height: 1920,
    previewAspect: '9 / 16',
  },
  square: {
    label: 'Post quadrado',
    width: 1080,
    height: 1080,
    previewAspect: '1 / 1',
  },
};

const PROMO_AI_COPY_LIMITS: Record<PromoFormatKey, PromoAiCopyLimits> = {
  feed: {
    titleMinChars: 34,
    titleMaxChars: 66,
    titleMinWords: 5,
    subtitleMinChars: 72,
    subtitleMaxChars: 126,
    subtitleMinWords: 11,
    ctaMinChars: 24,
    ctaMaxChars: 52,
    ctaMinWords: 4,
  },
  story: {
    titleMinChars: 42,
    titleMaxChars: 78,
    titleMinWords: 6,
    subtitleMinChars: 96,
    subtitleMaxChars: 150,
    subtitleMinWords: 14,
    ctaMinChars: 30,
    ctaMaxChars: 58,
    ctaMinWords: 5,
  },
  square: {
    titleMinChars: 26,
    titleMaxChars: 56,
    titleMinWords: 4,
    subtitleMinChars: 52,
    subtitleMaxChars: 100,
    subtitleMinWords: 8,
    ctaMinChars: 18,
    ctaMaxChars: 44,
    ctaMinWords: 3,
  },
};

const clampNumber = (value: number, min: number, max: number) => {
  return Math.min(max, Math.max(min, value));
};

const withAlpha = (hexColor: string, alpha: number) => {
  const normalized = hexColor.replace('#', '');
  const isShort = normalized.length === 3;
  const valid = isShort || normalized.length === 6;
  if (!valid) return `rgba(255, 255, 255, ${clampNumber(alpha, 0, 1)})`;
  const full = isShort
    ? normalized
        .split('')
        .map((char) => `${char}${char}`)
        .join('')
    : normalized;
  const red = parseInt(full.slice(0, 2), 16);
  const green = parseInt(full.slice(2, 4), 16);
  const blue = parseInt(full.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${clampNumber(alpha, 0, 1)})`;
};

const resolveFontVar = (variableName: string, fallback: string) => {
  if (typeof window === 'undefined') return fallback;
  const value = window.getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
  return value || fallback;
};

const resolvePromoFontSet = (key: PromoFontKey) => {
  const body = resolveFontVar('--font-body', '"Manrope", "Segoe UI", Arial, sans-serif');
  const display = resolveFontVar('--font-display', '"Space Grotesk", "Segoe UI", Arial, sans-serif');
  const sora = resolveFontVar('--font-sora', '"Sora", "Segoe UI", Arial, sans-serif');
  const oswald = resolveFontVar('--font-oswald', '"Oswald", "Arial Narrow", Arial, sans-serif');
  const editorial = resolveFontVar('--font-editorial', '"Merriweather", Georgia, serif');
  if (key === 'clean') {
    return { title: body, body, badge: sora, cta: body };
  }
  if (key === 'headline') {
    return { title: display, body: sora, badge: display, cta: display };
  }
  if (key === 'editorial') {
    return { title: editorial, body, badge: sora, cta: body };
  }
  if (key === 'athletic') {
    return { title: oswald, body: body, badge: oswald, cta: oswald };
  }
  return { title: display, body, badge: display, cta: sora };
};

const buildInviteLink = (base: string, code: string) => {
  const trimmedBase = base.trim();
  if (!trimmedBase) return '';
  const normalizedBase = trimmedBase.endsWith('/') ? trimmedBase.slice(0, -1) : trimmedBase;
  const joiner = normalizedBase.includes('?') ? '&' : '?';
  return `${normalizedBase}${joiner}code=${encodeURIComponent(code)}`;
};

const drawRoundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) => {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
};

const drawTextLines = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
  align: PromoTextAlignKey = 'left'
) => {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  words.forEach((word) => {
    const testLine = current ? `${current} ${word}` : word;
    if (ctx.measureText(testLine).width <= maxWidth) {
      current = testLine;
      return;
    }
    if (current) lines.push(current);
    current = word;
  });
  if (current) lines.push(current);
  const limited = lines.slice(0, maxLines);
  const anchorX = align === 'center' ? x + maxWidth / 2 : align === 'right' ? x + maxWidth : x;
  const textAlign = align === 'center' ? 'center' : align === 'right' ? 'right' : 'left';
  ctx.save();
  ctx.textAlign = textAlign;
  limited.forEach((line, index) => {
    ctx.fillText(line, anchorX, y + index * lineHeight);
  });
  ctx.restore();
  return limited.length;
};

const splitTextLines = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
) => {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  words.forEach((word) => {
    const testLine = current ? `${current} ${word}` : word;
    if (ctx.measureText(testLine).width <= maxWidth) {
      current = testLine;
      return;
    }
    if (current) lines.push(current);
    current = word;
  });
  if (current) lines.push(current);
  return lines.slice(0, maxLines);
};

const drawStyledTextLines = ({
  ctx,
  text,
  x,
  y,
  maxWidth,
  lineHeight,
  maxLines,
  effect,
  align,
  textColor,
  accentColor,
}: {
  ctx: CanvasRenderingContext2D;
  text: string;
  x: number;
  y: number;
  maxWidth: number;
  lineHeight: number;
  maxLines: number;
  effect: PromoTextEffectKey;
  align: PromoTextAlignKey;
  textColor: string;
  accentColor: string;
}) => {
  const lines = splitTextLines(ctx, text, maxWidth, maxLines);
  const anchorX = align === 'center' ? x + maxWidth / 2 : align === 'right' ? x + maxWidth : x;
  const textAlign = align === 'center' ? 'center' : align === 'right' ? 'right' : 'left';
  lines.forEach((line, index) => {
    const baselineY = y + index * lineHeight;
    const lineWidth = Math.max(1, ctx.measureText(line).width);
    const lineLeftX =
      align === 'center' ? anchorX - lineWidth / 2 : align === 'right' ? anchorX - lineWidth : anchorX;
    ctx.save();
    ctx.textAlign = textAlign;
    ctx.fillStyle = textColor;
    if (effect === 'shadow') {
      ctx.shadowColor = withAlpha('#000000', 0.55);
      ctx.shadowBlur = 20;
      ctx.shadowOffsetY = 5;
    }
    if (effect === 'outline') {
      ctx.lineWidth = Math.max(2, lineHeight * 0.08);
      ctx.strokeStyle = withAlpha('#020617', 0.72);
      ctx.strokeText(line, anchorX, baselineY);
    }
    if (effect === 'neon') {
      ctx.shadowColor = withAlpha(accentColor, 0.95);
      ctx.shadowBlur = 28;
      ctx.lineWidth = Math.max(1.5, lineHeight * 0.05);
      ctx.strokeStyle = withAlpha(accentColor, 0.68);
      ctx.strokeText(line, anchorX, baselineY);
    }
    if (effect === 'gradient') {
      const gradient = ctx.createLinearGradient(
        lineLeftX,
        baselineY - lineHeight,
        lineLeftX + lineWidth,
        baselineY
      );
      gradient.addColorStop(0, textColor);
      gradient.addColorStop(0.5, withAlpha(accentColor, 0.94));
      gradient.addColorStop(1, textColor);
      ctx.fillStyle = gradient;
    }
    if (effect === 'glass') {
      ctx.fillStyle = withAlpha('#ffffff', 0.95);
      ctx.shadowColor = withAlpha(accentColor, 0.75);
      ctx.shadowBlur = 22;
      ctx.fillText(line, anchorX, baselineY);
      ctx.fillStyle = withAlpha(accentColor, 0.35);
      ctx.fillText(line, anchorX, baselineY);
      ctx.restore();
      return;
    }
    if (effect === 'lift') {
      ctx.fillStyle = withAlpha('#020617', 0.58);
      ctx.fillText(line, anchorX + 3, baselineY + 4);
      ctx.fillStyle = textColor;
      ctx.fillText(line, anchorX, baselineY);
      ctx.restore();
      return;
    }
    ctx.fillText(line, anchorX, baselineY);
    ctx.restore();
  });
  return lines.length;
};

const extractJsonObject = (text: string) => {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  const candidate = text.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
};

const parsePromoAiCopy = (raw: string): PromoAiCopy | null => {
  const cleaned = raw
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  const maybeJson = extractJsonObject(cleaned);
  if (maybeJson && typeof maybeJson === 'object') {
    const title = String(
      maybeJson.titulo || maybeJson.title || maybeJson.headline || maybeJson.chamadaPrincipal || ''
    )
      .replace(/\s+/g, ' ')
      .trim();
    const subtitle = String(
      maybeJson.subtitulo || maybeJson.subtitle || maybeJson.descricao || maybeJson.body || ''
    )
      .replace(/\s+/g, ' ')
      .trim();
    const cta = String(maybeJson.cta || maybeJson.callToAction || maybeJson.final || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (title && subtitle && cta) {
      return { title, subtitle, cta };
    }
  }

  const lines = cleaned
    .split('\n')
    .map((line) => line.replace(/^[-*]\s*/, '').replace(/^\d+[.)]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 6);
  if (lines.length >= 3) {
    return {
      title: lines[0],
      subtitle: lines[1],
      cta: lines[2],
    };
  }
  return null;
};

const countWords = (value: string) => {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
};

const normalizePromoAiCopy = (copy: PromoAiCopy, limits: PromoAiCopyLimits): PromoAiCopy => {
  return {
    title: copy.title.replace(/\s+/g, ' ').trim().slice(0, limits.titleMaxChars),
    subtitle: copy.subtitle.replace(/\s+/g, ' ').trim().slice(0, limits.subtitleMaxChars),
    cta: copy.cta.replace(/\s+/g, ' ').trim().slice(0, limits.ctaMaxChars),
  };
};

const isPromoAiCopySized = (copy: PromoAiCopy, limits: PromoAiCopyLimits) => {
  return (
    copy.title.length >= limits.titleMinChars &&
    countWords(copy.title) >= limits.titleMinWords &&
    copy.subtitle.length >= limits.subtitleMinChars &&
    countWords(copy.subtitle) >= limits.subtitleMinWords &&
    copy.cta.length >= limits.ctaMinChars &&
    countWords(copy.cta) >= limits.ctaMinWords
  );
};

const buildPromoAiPrompt = ({
  personalName,
  personalCode,
  inviteLink,
  mode,
  campaign,
  format,
  tone,
  limits,
  strictMode = false,
}: {
  personalName: string;
  personalCode: string;
  inviteLink: string;
  mode: PromoPostModeKey;
  campaign: string;
  format: PromoFormatKey;
  tone: PromoAiToneKey;
  limits: PromoAiCopyLimits;
  strictMode?: boolean;
}) => {
  const toneLine =
    tone === 'conversion'
      ? 'Tom de conversao: foco em acao imediata e clareza.'
      : tone === 'motivational'
      ? 'Tom motivacional: energia, incentivo e proximidade.'
      : 'Tom premium: linguagem mais sofisticada e autoridade profissional.';
  const formatLine =
    format === 'story'
      ? 'Story: escreva copy com ritmo vertical (titulo forte + subtitulo desenvolvido + CTA concreto) para evitar areas vazias.'
      : format === 'feed'
      ? 'Feed: copy equilibrada, com gancho forte, beneficio concreto e sem ficar curta.'
      : 'Post quadrado: copy direta, sem ficar curta demais.';
  const scenarioLine =
    mode === 'general'
      ? 'Cenario: post geral de Instagram da marca MH Personal Trainer, sem link de convite e sem codigo obrigatorio.'
      : 'Cenario: card de convite para personal compartilhar com alunos.';
  const strictLine = strictMode
    ? 'ATENCAO: resposta anterior ficou curta. Agora escreva perto do limite maximo permitido.'
    : '';
  return [
    'Voce e um especialista em copy para posts fitness de personal trainer.',
    mode === 'general'
      ? 'Crie um texto promocional curto para post geral do Instagram do app MH Personal Trainer.'
      : 'Crie um texto promocional curto para card de convite do app MH Personal Trainer.',
    'Responda SOMENTE em JSON valido, sem markdown e sem texto extra.',
    'Formato exato: {"titulo":"...","subtitulo":"...","cta":"..."}',
    'Regras:',
    '- Portugues do Brasil.',
    `- Titulo: entre ${limits.titleMinChars} e ${limits.titleMaxChars} caracteres.`,
    `- Subtitulo: entre ${limits.subtitleMinChars} e ${limits.subtitleMaxChars} caracteres.`,
    `- CTA: entre ${limits.ctaMinChars} e ${limits.ctaMaxChars} caracteres.`,
    `- Titulo com no minimo ${limits.titleMinWords} palavras.`,
    `- Subtitulo com no minimo ${limits.subtitleMinWords} palavras.`,
    `- CTA com no minimo ${limits.ctaMinWords} palavras.`,
    '- Nao usar emojis.',
    '- Incluir beneficio concreto para o aluno.',
    '- Evitar qualquer frase vaga como "saia do zero" sem contexto.',
    '- Evitar textos muito curtos que deixem espaco vazio na arte.',
    mode === 'general'
      ? '- Nao mencionar codigo de convite nem link quando nao for necessario.'
      : '- Sugerir uso do codigo sem inventar preco.',
    '- Evitar frases curtas demais e genericas.',
    scenarioLine,
    toneLine,
    formatLine,
    strictLine,
    `Formato do card: ${PROMO_FORMATS[format].label}.`,
    `Objetivo da campanha: ${campaign || 'Atrair publico para o ecossistema MH Personal Trainer.'}.`,
    `Nome do personal: ${personalName || 'Personal MH'}.`,
    mode === 'general' ? 'Codigo de convite: nao usar.' : `Codigo de convite: ${personalCode || '000'}.`,
    mode === 'general' ? 'Link: nao usar.' : `Link: ${inviteLink || 'https://mhpersonaltrainer.com.br/invite'}.`,
  ].join('\n');
};

const drawBackgroundEffect = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  color: string,
  intensity: number,
  effect: PromoBackgroundEffectKey
) => {
  if (intensity <= 0) return;
  const normalized = clampNumber(intensity, 0, 100);
  if (effect === 'texture') {
    const spacing = clampNumber(58 - normalized * 0.36, 18, 58);
    ctx.save();
    ctx.strokeStyle = withAlpha(color, 0.06 + normalized * 0.0012);
    ctx.lineWidth = 1;
    for (let offset = -height; offset < width; offset += spacing) {
      ctx.beginPath();
      ctx.moveTo(offset, 0);
      ctx.lineTo(offset + height, height);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  if (effect === 'rings') {
    const ringCount = Math.max(3, Math.round(normalized / 18));
    ctx.save();
    ctx.strokeStyle = withAlpha(color, 0.12 + normalized * 0.0012);
    ctx.lineWidth = 2;
    for (let index = 0; index < ringCount; index += 1) {
      const x = width * (0.2 + (index * 0.17) % 0.7);
      const y = height * (0.14 + (index * 0.23) % 0.75);
      const radius = width * (0.08 + ((index % 4) * 0.045));
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  if (effect === 'dots') {
    const spacing = clampNumber(76 - normalized * 0.42, 24, 76);
    const radius = clampNumber(1.2 + normalized * 0.02, 1.2, 3.4);
    ctx.save();
    ctx.fillStyle = withAlpha(color, 0.08 + normalized * 0.0014);
    for (let y = spacing / 2; y < height; y += spacing) {
      for (let x = spacing / 2; x < width; x += spacing) {
        const jitterX = ((x + y) % 9) - 4;
        const jitterY = ((x + y) % 7) - 3;
        ctx.beginPath();
        ctx.arc(x + jitterX, y + jitterY, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    return;
  }

  if (effect === 'mesh') {
    const spacing = clampNumber(120 - normalized * 0.75, 34, 120);
    ctx.save();
    ctx.strokeStyle = withAlpha(color, 0.08 + normalized * 0.0014);
    ctx.lineWidth = 1.25;
    for (let x = spacing; x < width; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = spacing; y < height; y += spacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  if (effect === 'burst') {
    const rays = Math.max(14, Math.round(18 + normalized * 0.3));
    const sourceX = width * 0.1;
    const sourceY = height * 0.12;
    ctx.save();
    ctx.strokeStyle = withAlpha(color, 0.1 + normalized * 0.0015);
    ctx.lineWidth = 1.6;
    for (let index = 0; index < rays; index += 1) {
      const angle = (Math.PI * 2 * index) / rays;
      const length = Math.max(width, height) * (0.8 + ((index % 5) * 0.08));
      ctx.beginPath();
      ctx.moveTo(sourceX, sourceY);
      ctx.lineTo(sourceX + Math.cos(angle) * length, sourceY + Math.sin(angle) * length);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.strokeStyle = withAlpha(color, 0.09 + normalized * 0.0012);
  ctx.lineWidth = 2;
  const waves = Math.max(4, Math.round(normalized / 14));
  const amplitude = clampNumber(height * 0.018 + normalized * 0.18, 16, 52);
  for (let index = 0; index < waves; index += 1) {
    const startY = (height / waves) * index + 18;
    ctx.beginPath();
    ctx.moveTo(0, startY);
    for (let x = 0; x <= width; x += 18) {
      const y = startY + Math.sin((x / width) * Math.PI * 2 + index * 0.7) * amplitude;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
};

const applyPromoFilter = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  filter: PromoFilterKey
) => {
  if (filter === 'none') return;
  ctx.save();
  if (filter === 'cold') {
    ctx.fillStyle = 'rgba(72, 142, 224, 0.12)';
    ctx.fillRect(0, 0, width, height);
  } else if (filter === 'warm') {
    ctx.fillStyle = 'rgba(236, 145, 94, 0.14)';
    ctx.fillRect(0, 0, width, height);
  } else if (filter === 'mono') {
    ctx.fillStyle = 'rgba(96, 112, 134, 0.2)';
    ctx.fillRect(0, 0, width, height);
  } else if (filter === 'cinematic') {
    const topFade = ctx.createLinearGradient(0, 0, 0, height * 0.26);
    topFade.addColorStop(0, 'rgba(2, 6, 23, 0.5)');
    topFade.addColorStop(1, 'rgba(2, 6, 23, 0)');
    ctx.fillStyle = topFade;
    ctx.fillRect(0, 0, width, height * 0.26);

    const bottomFade = ctx.createLinearGradient(0, height, 0, height * 0.72);
    bottomFade.addColorStop(0, 'rgba(2, 6, 23, 0.56)');
    bottomFade.addColorStop(1, 'rgba(2, 6, 23, 0)');
    ctx.fillStyle = bottomFade;
    ctx.fillRect(0, height * 0.72, width, height * 0.28);
  }
  ctx.restore();
};

const drawPromoFilmGrain = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  intensity: number
) => {
  const normalized = clampNumber(intensity, 0, 100);
  if (normalized <= 0) return;
  const count = Math.round((width * height * (normalized / 100)) / 620);
  const alpha = 0.03 + normalized * 0.001;
  ctx.save();
  for (let i = 0; i < count; i += 1) {
    const x = (i * 1877 + 811) % width;
    const y = (i * 1237 + 421) % height;
    const tone = 185 + ((i * 37) % 60);
    ctx.fillStyle = `rgba(${tone}, ${tone}, ${tone}, ${alpha})`;
    ctx.fillRect(x, y, 1, 1);
  }
  ctx.restore();
};

const drawPromoVignette = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  intensity: number
) => {
  const normalized = clampNumber(intensity, 0, 100);
  if (normalized <= 0) return;
  const gradient = ctx.createRadialGradient(
    width * 0.5,
    height * 0.45,
    width * 0.14,
    width * 0.5,
    height * 0.5,
    Math.max(width, height) * 0.72
  );
  gradient.addColorStop(0, 'rgba(2, 6, 23, 0)');
  gradient.addColorStop(1, withAlpha('#020617', 0.15 + normalized * 0.0035));
  ctx.save();
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
};

const drawPromoPhotoLayer = ({
  ctx,
  width,
  height,
  image,
  fit,
  zoom,
  offsetX,
  offsetY,
  opacity,
}: {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  image: HTMLImageElement;
  fit: PromoPhotoFitKey;
  zoom: number;
  offsetX: number;
  offsetY: number;
  opacity: number;
}) => {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) return;
  const fitRatio =
    fit === 'contain'
      ? Math.min(width / sourceWidth, height / sourceHeight)
      : Math.max(width / sourceWidth, height / sourceHeight);
  const zoomRatio = clampNumber(zoom, 70, 220) / 100;
  const drawWidth = sourceWidth * fitRatio * zoomRatio;
  const drawHeight = sourceHeight * fitRatio * zoomRatio;
  const shiftX = (clampNumber(offsetX, -100, 100) / 100) * width * 0.42;
  const shiftY = (clampNumber(offsetY, -100, 100) / 100) * height * 0.42;
  const drawX = (width - drawWidth) / 2 + shiftX;
  const drawY = (height - drawHeight) / 2 + shiftY;
  const normalizedOpacity = clampNumber(opacity, 0, 100) / 100;
  if (normalizedOpacity <= 0) return;

  ctx.save();
  ctx.globalAlpha = normalizedOpacity;
  ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  ctx.restore();
};

const drawPromoStickerLayer = ({
  ctx,
  width,
  height,
  type,
  x,
  y,
  size,
  opacity,
  rotation,
  accentColor,
  fontSet,
}: {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  type: PromoStickerKey;
  x: number;
  y: number;
  size: number;
  opacity: number;
  rotation: number;
  accentColor: string;
  fontSet: {
    title: string;
    body: string;
    badge: string;
    cta: string;
  };
}) => {
  if (type === 'none') return;
  const normalizedOpacity = clampNumber(opacity, 0, 100) / 100;
  if (normalizedOpacity <= 0) return;
  const safeSize = clampNumber(size, 8, 64);
  const stickerSize = (safeSize / 100) * width;
  const cx = (clampNumber(x, 0, 100) / 100) * width;
  const cy = (clampNumber(y, 0, 100) / 100) * height;
  const radius = stickerSize / 2;
  const rotationRad = (clampNumber(rotation, -180, 180) * Math.PI) / 180;

  ctx.save();
  ctx.globalAlpha = normalizedOpacity;
  ctx.translate(cx, cy);
  ctx.rotate(rotationRad);

  if (type === 'mh-badge') {
    drawRoundedRect(ctx, -radius, -radius, stickerSize, stickerSize, Math.max(14, stickerSize * 0.22));
    const badgeGradient = ctx.createLinearGradient(-radius, -radius, radius, radius);
    badgeGradient.addColorStop(0, withAlpha(accentColor, 0.94));
    badgeGradient.addColorStop(1, withAlpha('#1d4f85', 0.9));
    ctx.fillStyle = badgeGradient;
    ctx.fill();
    ctx.strokeStyle = withAlpha('#ffffff', 0.36);
    ctx.lineWidth = Math.max(1.4, stickerSize * 0.012);
    ctx.stroke();
    ctx.fillStyle = withAlpha('#031327', 0.9);
    ctx.font = `900 ${Math.max(14, stickerSize * 0.34)}px ${fontSet.title}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('MH', 0, 0);
    ctx.restore();
    return;
  }

  if (type === 'target') {
    ctx.strokeStyle = withAlpha(accentColor, 0.84);
    ctx.lineWidth = Math.max(2, stickerSize * 0.04);
    for (let i = 1; i <= 3; i += 1) {
      ctx.beginPath();
      ctx.arc(0, 0, (radius * i) / 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = withAlpha('#ffffff', 0.86);
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  if (type === 'bolt') {
    ctx.fillStyle = withAlpha(accentColor, 0.9);
    ctx.beginPath();
    ctx.moveTo(-radius * 0.18, -radius);
    ctx.lineTo(radius * 0.2, -radius * 0.15);
    ctx.lineTo(-radius * 0.02, -radius * 0.15);
    ctx.lineTo(radius * 0.18, radius);
    ctx.lineTo(-radius * 0.2, radius * 0.2);
    ctx.lineTo(radius * 0.01, radius * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = withAlpha('#ffffff', 0.34);
    ctx.lineWidth = Math.max(1.2, stickerSize * 0.02);
    ctx.stroke();
    ctx.restore();
    return;
  }

  ctx.fillStyle = withAlpha('#ffffff', 0.9);
  ctx.strokeStyle = withAlpha(accentColor, 0.74);
  ctx.lineWidth = Math.max(2, stickerSize * 0.032);
  const spikes = 8;
  const outerRadius = radius;
  const innerRadius = radius * 0.5;
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i += 1) {
    const currentRadius = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = (Math.PI / spikes) * i - Math.PI / 2;
    const pointX = Math.cos(angle) * currentRadius;
    const pointY = Math.sin(angle) * currentRadius;
    if (i === 0) ctx.moveTo(pointX, pointY);
    else ctx.lineTo(pointX, pointY);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
};

const createPromotionalInviteImage = ({
  code,
  link,
  personalName,
  title,
  subtitle,
  cta,
  mode,
  brandLabel,
  footerLabel,
  typography,
  overlayOpacity,
  showFrame,
  design,
  fontSet,
  format,
  textAlign,
  colors,
  effects,
  photo,
  sticker,
}: {
  code: string;
  link: string;
  personalName: string;
  title: string;
  subtitle: string;
  cta: string;
  mode: PromoPostModeKey;
  brandLabel: string;
  footerLabel: string;
  typography: {
    titleScale: number;
    subtitleScale: number;
    ctaScale: number;
    uppercaseTitle: boolean;
  };
  overlayOpacity: number;
  showFrame: boolean;
  design: {
    layout: PromoLayoutKey;
    filter: PromoFilterKey;
    grain: number;
    vignette: number;
    accentLevel: number;
  };
  fontSet: {
    title: string;
    body: string;
    badge: string;
    cta: string;
  };
  format: PromoFormatKey;
  textAlign: PromoTextAlignKey;
  colors: {
    bgStart: string;
    bgEnd: string;
    accent: string;
  };
  effects: {
    angle: number;
    glow: number;
    texture: number;
    text: PromoTextEffectKey;
    background: PromoBackgroundEffectKey;
  };
  photo: {
    image: HTMLImageElement | null;
    fit: PromoPhotoFitKey;
    zoom: number;
    offsetX: number;
    offsetY: number;
    opacity: number;
  };
  sticker: {
    type: PromoStickerKey;
    x: number;
    y: number;
    size: number;
    opacity: number;
    rotation: number;
    layer: PromoStickerLayerKey;
  };
}) => {
  if (typeof document === 'undefined') return '';
  const selectedFormat = PROMO_FORMATS[format];
  const width = selectedFormat.width;
  const height = selectedFormat.height;
  const accentSoft = withAlpha(colors.accent, 0.22);
  const textColor = '#eff6ff';
  const mutedColor = 'rgba(239, 246, 255, 0.8)';

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const gradientAngleRad = (effects.angle * Math.PI) / 180;
  const halfDiagonal = Math.sqrt(width ** 2 + height ** 2) / 2;
  const centerX = width / 2;
  const centerY = height / 2;
  const gradient = ctx.createLinearGradient(
    centerX - Math.cos(gradientAngleRad) * halfDiagonal,
    centerY - Math.sin(gradientAngleRad) * halfDiagonal,
    centerX + Math.cos(gradientAngleRad) * halfDiagonal,
    centerY + Math.sin(gradientAngleRad) * halfDiagonal
  );
  gradient.addColorStop(0, colors.bgStart);
  gradient.addColorStop(1, colors.bgEnd);

  if (photo.image) {
    drawPromoPhotoLayer({
      ctx,
      width,
      height,
      image: photo.image,
      fit: photo.fit,
      zoom: photo.zoom,
      offsetX: photo.offsetX,
      offsetY: photo.offsetY,
      opacity: photo.opacity,
    });
    ctx.save();
    ctx.globalAlpha = 0.68;
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  } else {
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  drawBackgroundEffect(ctx, width, height, colors.accent, effects.texture, effects.background);

  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.beginPath();
  ctx.arc(width * 0.86, height * 0.12, width * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(width * 0.12, height * 0.86, width * 0.24, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const glowStrength = clampNumber(effects.glow / 100, 0, 1);
  if (glowStrength > 0) {
    const glow = ctx.createRadialGradient(width * 0.8, height * 0.2, 10, width * 0.8, height * 0.2, width * 0.48);
    glow.addColorStop(0, withAlpha(colors.accent, 0.3 * glowStrength));
    glow.addColorStop(1, withAlpha(colors.accent, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
  }

  const normalizedOverlay = clampNumber(overlayOpacity, 0, 80) / 100;
  if (normalizedOverlay > 0) {
    ctx.fillStyle = withAlpha('#020617', normalizedOverlay);
    ctx.fillRect(0, 0, width, height);
  }
  applyPromoFilter(ctx, width, height, design.filter);

  if (sticker.layer === 'back') {
    drawPromoStickerLayer({
      ctx,
      width,
      height,
      type: sticker.type,
      x: sticker.x,
      y: sticker.y,
      size: sticker.size,
      opacity: sticker.opacity,
      rotation: sticker.rotation,
      accentColor: colors.accent,
      fontSet,
    });
  }

  const unit = width / 360;
  const contentInsetXBase = Math.round(16 * unit);
  const contentInsetX =
    design.layout === 'split-right'
      ? Math.round(14 * unit)
      : design.layout === 'minimal'
      ? Math.round(18 * unit)
      : contentInsetXBase;
  const contentInsetY = Math.round(14 * unit);
  const contentX = contentInsetX;
  const contentTop = contentInsetY;
  const contentWidth =
    design.layout === 'split-right'
      ? Math.round(width * 0.58)
      : width - contentInsetX * 2;
  const contentBottom = height - contentInsetY;
  const sectionGap = Math.round(12 * unit);
  const resolvedAlign: PromoTextAlignKey =
    design.layout === 'center-stage' ? 'center' : textAlign;
  let cursorY = contentTop;

  const accentBoost = clampNumber(design.accentLevel, 0, 100) / 100;
  if (accentBoost > 0) {
    ctx.save();
    const flare = ctx.createRadialGradient(
      width * (design.layout === 'split-right' ? 0.84 : 0.74),
      height * 0.18,
      8,
      width * (design.layout === 'split-right' ? 0.84 : 0.74),
      height * 0.18,
      width * 0.42
    );
    flare.addColorStop(0, withAlpha(colors.accent, 0.35 * accentBoost));
    flare.addColorStop(1, withAlpha(colors.accent, 0));
    ctx.fillStyle = flare;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  if (design.layout === 'split-right') {
    const panelWidth = Math.round(width * 0.3);
    const panelX = width - panelWidth - Math.round(16 * unit);
    const panelY = Math.round(72 * unit);
    const panelHeight = height - panelY - Math.round(72 * unit);
    drawRoundedRect(ctx, panelX, panelY, panelWidth, panelHeight, Math.round(16 * unit));
    ctx.fillStyle = withAlpha(colors.accent, 0.12 + accentBoost * 0.12);
    ctx.fill();
    ctx.strokeStyle = withAlpha('#ffffff', 0.18);
    ctx.lineWidth = Math.max(1.1, unit * 0.7);
    ctx.stroke();
  }

  const chipHeight = Math.round(26 * unit);
  ctx.font = `700 ${Math.round(11 * unit)}px ${fontSet.badge}`;
  const chipLabel = (brandLabel || 'MH PERSONAL TRAINER').trim() || 'MH PERSONAL TRAINER';
  const measuredChip = ctx.measureText(chipLabel).width + Math.round(20 * unit);
  const chipWidth = Math.round(
    clampNumber(measuredChip, 128 * unit, contentWidth * (design.layout === 'minimal' ? 0.58 : 0.74))
  );
  if (design.layout !== 'minimal') {
    const chipX =
      resolvedAlign === 'center'
        ? contentX + (contentWidth - chipWidth) / 2
        : resolvedAlign === 'right'
        ? contentX + contentWidth - chipWidth
        : contentX;
    drawRoundedRect(ctx, chipX, cursorY, chipWidth, chipHeight, Math.round(chipHeight / 2));
    ctx.fillStyle = accentSoft;
    ctx.fill();
    ctx.fillStyle = colors.accent;
    ctx.fillText(chipLabel, chipX + Math.round(10 * unit), cursorY + Math.round(chipHeight * 0.67));
    cursorY += chipHeight + Math.round(8 * unit);
  } else {
    cursorY += Math.round(6 * unit);
  }

  const ctaText = cta.trim() || 'Use o codigo e comece hoje';
  const inviteUrl = link || 'https://mhpersonaltrainer.com.br/invite';
  const byline =
    mode === 'general'
      ? footerLabel.trim() || 'mhpersonaltrainer.com.br'
      : personalName
      ? `Personal ${personalName}`
      : 'Personal MH';

  const ctaScale = clampNumber(typography.ctaScale || 100, 70, 150) / 100;
  const ctaFontSize = Math.round(15 * unit * ctaScale);
  const ctaLineHeight = Math.round(20 * unit * ctaScale);
  const linkFontSize = Math.round(12 * unit);
  const linkLineHeight = Math.round(16 * unit);
  const footerFontSize = Math.round(11 * unit);
  const footerLineHeight = Math.round(15 * unit);
  const ctaMaxLines = format === 'square' ? 1 : 2;
  const linkMaxLines = format === 'story' ? 2 : 1;
  ctx.font = `700 ${ctaFontSize}px ${fontSet.cta}`;
  const ctaLineCount = Math.max(1, splitTextLines(ctx, ctaText, contentWidth, ctaMaxLines).length);
  ctx.font = `500 ${linkFontSize}px ${fontSet.body}`;
  const linkLineCount = Math.max(1, splitTextLines(ctx, inviteUrl, contentWidth, linkMaxLines).length);

  const titleScale = clampNumber(typography.titleScale || 100, 70, 150) / 100;
  const subtitleScale = clampNumber(typography.subtitleScale || 100, 70, 150) / 100;
  const titleFontSize = Math.round(26 * unit * titleScale);
  const titleLineHeight = Math.round(31 * unit * titleScale);
  const subtitleFontSize = Math.round(14 * unit * subtitleScale);
  const subtitleLineHeight = Math.round(20 * unit * subtitleScale);
  const titleMaxLinesBase =
    design.layout === 'minimal' ? 2 : format === 'story' ? 5 : format === 'feed' ? 3 : 2;
  const subtitleMaxLinesBase =
    design.layout === 'minimal' ? 2 : format === 'story' ? 5 : format === 'feed' ? 3 : 2;
  let titleMaxLines = titleMaxLinesBase;
  let subtitleMaxLines = subtitleMaxLinesBase;
  const minTitleLines = format === 'story' ? 2 : 1;
  const minSubtitleLines = format === 'story' ? 2 : 1;
  const codeCardReserveHeight = Math.round((format === 'story' ? 68 : format === 'feed' ? 64 : 60) * unit);
  const inviteReserveHeight =
    codeCardReserveHeight +
    Math.round(10 * unit) +
    ctaLineCount * ctaLineHeight +
    Math.round(6 * unit) +
    linkLineCount * linkLineHeight +
    Math.round(4 * unit) +
    footerLineHeight +
    Math.round(10 * unit);
  const generalReserveHeight =
    Math.round((format === 'story' ? 76 : 68) * unit) + Math.round(10 * unit) + footerLineHeight + Math.round(8 * unit);
  const estimatedBottomReserve = mode === 'general' ? generalReserveHeight : inviteReserveHeight;
  const titleSubtitleGap = Math.round(8 * unit);
  const availableTextHeight = Math.max(
    titleLineHeight + subtitleLineHeight,
    contentBottom - cursorY - sectionGap - estimatedBottomReserve
  );
  while (
    titleMaxLines * titleLineHeight + titleSubtitleGap + subtitleMaxLines * subtitleLineHeight >
      availableTextHeight &&
    (subtitleMaxLines > minSubtitleLines || titleMaxLines > minTitleLines)
  ) {
    if (
      subtitleMaxLines > minSubtitleLines &&
      (subtitleMaxLines * subtitleLineHeight >= titleMaxLines * titleLineHeight || titleMaxLines <= minTitleLines)
    ) {
      subtitleMaxLines -= 1;
      continue;
    }
    if (titleMaxLines > minTitleLines) {
      titleMaxLines -= 1;
      continue;
    }
    break;
  }

  const titleText = typography.uppercaseTitle ? title.toUpperCase() : title;
  ctx.font = `800 ${titleFontSize}px ${fontSet.title}`;
  const titleLines = drawStyledTextLines({
    ctx,
    text: titleText,
    x: contentX,
    y: cursorY + titleFontSize,
    maxWidth: contentWidth,
    lineHeight: titleLineHeight,
    maxLines: titleMaxLines,
    effect: effects.text,
    align: resolvedAlign,
    textColor,
    accentColor: colors.accent,
  });
  cursorY += Math.max(1, titleLines) * titleLineHeight + titleSubtitleGap;

  ctx.fillStyle = mutedColor;
  ctx.font = `500 ${subtitleFontSize}px ${fontSet.body}`;
  const subtitleLines = drawTextLines(
    ctx,
    subtitle,
    contentX,
    cursorY + subtitleFontSize,
    contentWidth,
    subtitleLineHeight,
    subtitleMaxLines,
    resolvedAlign
  );
  cursorY += subtitleLines * subtitleLineHeight;

  const lineFillRatio =
    (Math.max(1, titleLines) + Math.max(1, subtitleLines)) /
    Math.max(2, titleMaxLines + subtitleMaxLines);
  const layoutLiftRatio =
    format === 'story' ? clampNumber((0.7 - lineFillRatio) * 0.4, 0, 0.16) : 0;
  const smartVerticalLift = Math.round(height * layoutLiftRatio);

  if (mode === 'general') {
    const ctaBoxHeight = Math.round((format === 'story' ? 76 : 68) * unit);
    const footerGap = Math.round(10 * unit);
    const minCtaY = cursorY + sectionGap;
    const ctaY = Math.max(
      minCtaY,
      contentBottom - ctaBoxHeight - footerGap - footerLineHeight - smartVerticalLift
    );
    drawRoundedRect(ctx, contentX, ctaY, contentWidth, ctaBoxHeight, Math.round(14 * unit));
    ctx.fillStyle = withAlpha(colors.accent, 0.18);
    ctx.fill();
    ctx.strokeStyle = withAlpha('#ffffff', 0.24);
    ctx.lineWidth = Math.max(1.25, unit * 0.8);
    ctx.stroke();

    ctx.fillStyle = textColor;
    ctx.font = `700 ${ctaFontSize}px ${fontSet.cta}`;
    drawTextLines(
      ctx,
      ctaText,
      contentX + Math.round(10 * unit),
      ctaY + Math.round(16 * unit) + ctaFontSize,
      contentWidth - Math.round(20 * unit),
      ctaLineHeight,
      ctaMaxLines,
      resolvedAlign
    );

    const footerY = Math.min(ctaY + ctaBoxHeight + footerGap + footerFontSize, contentBottom - Math.round(2 * unit));
    ctx.fillStyle = mutedColor;
    ctx.font = `600 ${footerFontSize}px ${fontSet.body}`;
    drawTextLines(ctx, byline, contentX, footerY, contentWidth, footerLineHeight, 1, resolvedAlign);
    ctx.textAlign = 'left';
  } else {
    const codeCardMinHeight = Math.round(56 * unit);
    const codeCardMaxHeight = Math.round(92 * unit);
    const codeCardIdealHeight = Math.round((format === 'story' ? 68 : format === 'feed' ? 64 : 60) * unit);
    const codeCtaGap = Math.round(10 * unit);
    const ctaLinkGap = Math.round(6 * unit);
    const linkFooterGap = Math.round(4 * unit);
    const minCodeY = cursorY + sectionGap;
    const availableBottomHeight = contentBottom - minCodeY;
    const textBlockHeight =
      codeCtaGap +
      ctaLineCount * ctaLineHeight +
      ctaLinkGap +
      linkLineCount * linkLineHeight +
      linkFooterGap +
      footerLineHeight;
    const codeCardHeightMaxFit = Math.max(
      codeCardMinHeight,
      Math.min(codeCardMaxHeight, availableBottomHeight - textBlockHeight)
    );
    const codeCardHeight = clampNumber(codeCardIdealHeight, codeCardMinHeight, codeCardHeightMaxFit);
    const bottomBlockHeight = codeCardHeight + textBlockHeight;
    const codeCardY = Math.max(minCodeY, contentBottom - bottomBlockHeight - smartVerticalLift);

    drawRoundedRect(ctx, contentX, codeCardY, contentWidth, codeCardHeight, Math.round(14 * unit));
    ctx.fillStyle = 'rgba(7, 16, 34, 0.35)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = Math.max(1.5, 1 * unit);
    ctx.stroke();

    const codeAnchorX =
      resolvedAlign === 'center'
        ? contentX + contentWidth / 2
        : resolvedAlign === 'right'
        ? contentX + contentWidth - Math.round(12 * unit)
        : contentX + Math.round(12 * unit);
    ctx.textAlign = resolvedAlign === 'center' ? 'center' : resolvedAlign === 'right' ? 'right' : 'left';
    ctx.fillStyle = mutedColor;
    ctx.font = `600 ${Math.round(11 * unit)}px ${fontSet.body}`;
    const codeLabelY = codeCardY + Math.round(10 * unit) + Math.round(11 * unit);
    ctx.fillText('SEU CODIGO DE CONVITE', codeAnchorX, codeLabelY);

    const safeCode = code || '--';
    ctx.font = `900 ${Math.round(30 * unit)}px ${fontSet.title}`;
    ctx.fillStyle = colors.accent;
    if (effects.text === 'neon') {
      ctx.shadowColor = withAlpha(colors.accent, 0.9);
      ctx.shadowBlur = Math.round(12 * unit);
    } else if (effects.text === 'shadow') {
      ctx.shadowColor = withAlpha('#000000', 0.5);
      ctx.shadowBlur = Math.round(8 * unit);
      ctx.shadowOffsetY = Math.round(2 * unit);
    }
    const codeValueY = codeLabelY + Math.round(4 * unit) + Math.round(30 * unit);
    ctx.fillText(safeCode, codeAnchorX, codeValueY);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    const ctaStartY = codeCardY + codeCardHeight + codeCtaGap;
    ctx.fillStyle = textColor;
    ctx.font = `700 ${ctaFontSize}px ${fontSet.cta}`;
    drawTextLines(
      ctx,
      ctaText,
      contentX,
      ctaStartY + ctaFontSize,
      contentWidth,
      ctaLineHeight,
      ctaMaxLines,
      resolvedAlign
    );

    const linkStartY = ctaStartY + ctaLineCount * ctaLineHeight + ctaLinkGap;
    ctx.fillStyle = mutedColor;
    ctx.font = `500 ${linkFontSize}px ${fontSet.body}`;
    drawTextLines(
      ctx,
      inviteUrl,
      contentX,
      linkStartY + linkFontSize,
      contentWidth,
      linkLineHeight,
      linkMaxLines,
      resolvedAlign
    );

    const footerStartY = linkStartY + linkLineCount * linkLineHeight + linkFooterGap;
    const footerY = Math.min(footerStartY + footerFontSize, contentBottom - Math.round(2 * unit));
    ctx.fillStyle = mutedColor;
    ctx.font = `600 ${footerFontSize}px ${fontSet.body}`;
    drawTextLines(ctx, byline, contentX, footerY, contentWidth, footerLineHeight, 1, resolvedAlign);
    ctx.textAlign = 'left';
  }

  if (sticker.layer === 'front') {
    drawPromoStickerLayer({
      ctx,
      width,
      height,
      type: sticker.type,
      x: sticker.x,
      y: sticker.y,
      size: sticker.size,
      opacity: sticker.opacity,
      rotation: sticker.rotation,
      accentColor: colors.accent,
      fontSet,
    });
  }

  if (showFrame) {
    ctx.save();
    drawRoundedRect(ctx, Math.round(5 * unit), Math.round(5 * unit), width - Math.round(10 * unit), height - Math.round(10 * unit), Math.round(16 * unit));
    ctx.strokeStyle = withAlpha('#ffffff', 0.22);
    ctx.lineWidth = Math.max(1.4, unit * 0.9);
    ctx.stroke();
    ctx.restore();
  }
  drawPromoVignette(ctx, width, height, design.vignette);
  drawPromoFilmGrain(ctx, width, height, design.grain);

  return canvas.toDataURL('image/png');
};

export default function StudentsPage() {
  const { user, role } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const dashboard = useDashboardData();
  const isPersonal = role === 'personal' || role === 'professor';
  const isAdmin = role === 'admin';
  const isAdminInstagramMode =
    isAdmin &&
    (searchParams.get('adminStudio') === '1' || searchParams.get('adminStudio') === 'true');
  const canUsePromoStudio = isPersonal || isAdminInstagramMode;
  const [query, setQuery] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [inviteFeedback, setInviteFeedback] = useState('');
  const [personalCode, setPersonalCode] = useState('');
  const [adminBrandLabel, setAdminBrandLabel] = useState('MH PERSONAL TRAINER');
  const [adminFooterLabel, setAdminFooterLabel] = useState('@mhpersonaltrainer');
  const [adminCampaignBrief, setAdminCampaignBrief] = useState(
    'Promocao geral da marca para Instagram'
  );
  const [actionId, setActionId] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [openActionId, setOpenActionId] = useState<string | null>(null);
  const [promoTheme, setPromoTheme] = useState<PromoThemeKey>('oceano');
  const [promoFormat, setPromoFormat] = useState<PromoFormatKey>('feed');
  const [promoTitle, setPromoTitle] = useState('Treine comigo no MH Personal Trainer');
  const [promoSubtitle, setPromoSubtitle] = useState(
    'Entre no app com meu codigo e receba treinos personalizados.'
  );
  const [promoCta, setPromoCta] = useState('Use o codigo e comece hoje');
  const [promoBgStartColor, setPromoBgStartColor] = useState(PROMO_THEME_COLORS.oceano.bgStart);
  const [promoBgEndColor, setPromoBgEndColor] = useState(PROMO_THEME_COLORS.oceano.bgEnd);
  const [promoAccentColor, setPromoAccentColor] = useState(PROMO_THEME_COLORS.oceano.accent);
  const [promoGradientAngle, setPromoGradientAngle] = useState(128);
  const [promoGlow, setPromoGlow] = useState(60);
  const [promoTexture, setPromoTexture] = useState(32);
  const [promoOverlay, setPromoOverlay] = useState(22);
  const [promoTitleScale, setPromoTitleScale] = useState(100);
  const [promoSubtitleScale, setPromoSubtitleScale] = useState(100);
  const [promoCtaScale, setPromoCtaScale] = useState(100);
  const [promoUppercaseTitle, setPromoUppercaseTitle] = useState(false);
  const [promoFrame, setPromoFrame] = useState(true);
  const [promoLayout, setPromoLayout] = useState<PromoLayoutKey>('impact');
  const [promoFilter, setPromoFilter] = useState<PromoFilterKey>('none');
  const [promoGrain, setPromoGrain] = useState(16);
  const [promoVignette, setPromoVignette] = useState(28);
  const [promoAccentLevel, setPromoAccentLevel] = useState(42);
  const [promoFont, setPromoFont] = useState<PromoFontKey>('brand');
  const [promoTextEffect, setPromoTextEffect] = useState<PromoTextEffectKey>('shadow');
  const [promoBackgroundEffect, setPromoBackgroundEffect] =
    useState<PromoBackgroundEffectKey>('texture');
  const [promoTextAlign, setPromoTextAlign] = useState<PromoTextAlignKey>('left');
  const [promoAiTone, setPromoAiTone] = useState<PromoAiToneKey>('conversion');
  const [promoAiLoading, setPromoAiLoading] = useState(false);
  const [promoAiError, setPromoAiError] = useState('');
  const [promoEditorOpen, setPromoEditorOpen] = useState(false);
  const promoSheetRef = useRef<HTMLDivElement | null>(null);
  const promoSheetBodyRef = useRef<HTMLDivElement | null>(null);
  const hiddenUiElementsRef = useRef<
    Array<{ element: HTMLElement; value: string; priority: string }>
  >([]);
  const promoIntentHandledRef = useRef(false);
  const adminModeInitRef = useRef(false);
  const [promoImageUrl, setPromoImageUrl] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const promoPhotoImageRef = useRef<HTMLImageElement | null>(null);
  const promoPhotoObjectUrlRef = useRef('');
  const [promoPhotoUrl, setPromoPhotoUrl] = useState('');
  const [promoPhotoFit, setPromoPhotoFit] = useState<PromoPhotoFitKey>('cover');
  const [promoPhotoZoom, setPromoPhotoZoom] = useState(100);
  const [promoPhotoOffsetX, setPromoPhotoOffsetX] = useState(0);
  const [promoPhotoOffsetY, setPromoPhotoOffsetY] = useState(0);
  const [promoPhotoOpacity, setPromoPhotoOpacity] = useState(88);
  const [promoStickerType, setPromoStickerType] = useState<PromoStickerKey>('none');
  const [promoStickerX, setPromoStickerX] = useState(82);
  const [promoStickerY, setPromoStickerY] = useState(18);
  const [promoStickerSize, setPromoStickerSize] = useState(20);
  const [promoStickerOpacity, setPromoStickerOpacity] = useState(84);
  const [promoStickerRotation, setPromoStickerRotation] = useState(0);
  const [promoStickerLayer, setPromoStickerLayer] = useState<PromoStickerLayerKey>('back');
  const { data: adminRows, loading: adminLoading } = useCollectionData<UserRow>(
    ['users'],
    [firestoreHelpers.limit(80)]
  );
  const appInviteBase = process.env.NEXT_PUBLIC_APP_INVITE_URL || 'https://mhpersonaltrainer.com.br/invite';
  const personalCodeNumber = personalCode ? Number(personalCode) : NaN;
  const shouldQueryInvites = isPersonal && personalCode;
  const shouldQueryNumeric = shouldQueryInvites && !Number.isNaN(personalCodeNumber);
  const { data: inviteRowsString } = useCollectionData<UserRow>(
    shouldQueryInvites ? ['users'] : [],
    shouldQueryInvites ? [firestoreHelpers.where('codigoPersonal', '==', personalCode)] : []
  );
  const { data: inviteRowsNumber } = useCollectionData<UserRow>(
    shouldQueryNumeric ? ['users'] : [],
    shouldQueryNumeric ? [firestoreHelpers.where('codigoPersonal', '==', personalCodeNumber)] : []
  );
  const pageActions = isAdmin
    ? isAdminInstagramMode
      ? [
          { label: 'Voltar ao admin', href: '/admin' },
          { label: 'Gerenciar alunos', href: '/admin/manage-students' },
        ]
      : [{ label: 'Gerenciar alunos', href: '/admin/manage-students' }]
    : undefined;

  const studentCards = useMemo<StudentCard[]>(() => {
    if (isPersonal) {
      return dashboard.alunos.map((aluno) => ({
        id: aluno.id,
        name: aluno.nome || 'Aluno',
        email: aluno.email,
        photoUrl: aluno.photoUrl,
        personalPhotoUrl: aluno.personalPhotoUrl,
        status: aluno.status,
        createdAt: aluno.alunoDesde,
        lastActive: aluno.ultimoTreino,
        codigoAcademia: aluno.codigoAcademia,
        vinculadoPorAcademia: aluno.vinculadoPorAcademia,
      }));
    }
    if (isAdmin) {
      return adminRows.map((row) => ({
        id: row.id,
        name: row.displayName || row.email?.split('@')[0] || 'Usuario',
        email: row.email,
        role: row.role ? row.role.toLowerCase() : 'usuario',
        createdAt: row.createdTime?.toDate?.() || row.createdTime,
      }));
    }
    return [];
  }, [adminRows, dashboard.alunos, isAdmin, isPersonal]);

  const filteredCards = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return studentCards;
    return studentCards.filter((student) => {
      return (
        student.name.toLowerCase().includes(normalized) ||
        (student.email || '').toLowerCase().includes(normalized)
      );
    });
  }, [query, studentCards]);

  const studentsSummary = useMemo(() => {
    const summary = {
      total: studentCards.length,
      ativos: 0,
      inativos: 0,
      pendentes: 0,
      admins: 0,
      personals: 0,
      alunos: 0,
    };
    studentCards.forEach((student) => {
      const status = student.status?.toLowerCase();
      if (status === 'ativo') summary.ativos += 1;
      else if (status === 'inativo') summary.inativos += 1;
      else if (status) summary.pendentes += 1;

      const role = student.role?.toLowerCase();
      if (role === 'admin') summary.admins += 1;
      else if (role === 'personal' || role === 'professor') summary.personals += 1;
      else if (role) summary.alunos += 1;
      else summary.alunos += 1;
    });
    return summary;
  }, [studentCards]);

  const inviteStudents = useMemo(() => {
    if (!shouldQueryInvites) return [];
    const map = new Map<string, UserRow>();
    [...inviteRowsString, ...inviteRowsNumber].forEach((row) => {
      if (row.id === user?.uid) return;
      map.set(row.id, row);
    });
    return Array.from(map.values());
  }, [inviteRowsNumber, inviteRowsString, shouldQueryInvites, user?.uid]);

  const inviteMessage = useMemo(() => {
    if (isAdminInstagramMode) {
      return [
        promoTitle.trim(),
        promoSubtitle.trim(),
        promoCta.trim(),
      ]
        .filter(Boolean)
        .join('\n');
    }
    if (!inviteLink) return '';
    if (!personalCode) return '';
    return [
      'Vamos treinar juntos no MH Personal Trainer.',
      `Use meu codigo ${personalCode} para criar sua conta.`,
      inviteLink,
    ].join('\n');
  }, [inviteLink, isAdminInstagramMode, personalCode, promoCta, promoSubtitle, promoTitle]);

  const loading = isPersonal ? dashboard.loading : adminLoading;
  const hasAccess = isPersonal || isAdmin;

  useEffect(() => {
    if (!canUsePromoStudio || promoIntentHandledRef.current) return;
    const promoIntent = searchParams.get('promoEditor');
    if (promoIntent !== '1' && promoIntent !== 'true') return;

    const requestedFormat = (searchParams.get('promoFormat') || '').toLowerCase();
    if (requestedFormat === 'feed' || requestedFormat === 'story' || requestedFormat === 'square') {
      setPromoFormat(requestedFormat as PromoFormatKey);
    }
    setPromoEditorOpen(true);
    promoIntentHandledRef.current = true;

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete('promoEditor');
    nextParams.delete('promoFormat');
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `/students?${nextQuery}` : '/students');
  }, [canUsePromoStudio, router, searchParams]);

  useEffect(() => {
    if (!isAdminInstagramMode || adminModeInitRef.current) return;
    adminModeInitRef.current = true;
    setPromoTitle('Treino inteligente para uma evolucao real');
    setPromoSubtitle('Tecnologia, acompanhamento e rotina organizada para resultados consistentes.');
    setPromoCta('Descubra o ecossistema MH Personal Trainer');
    setPromoTextEffect('gradient');
    setPromoBackgroundEffect('mesh');
    setPromoOverlay(20);
    setPromoFrame(true);
    setPromoLayout('impact');
    setPromoFilter('cinematic');
    setPromoFont('brand');
    setPromoGrain(20);
    setPromoVignette(32);
    setPromoAccentLevel(46);
  }, [isAdminInstagramMode]);

  useEffect(() => {
    if (!isPersonal || !user?.uid) {
      setPersonalCode('');
      return;
    }
    let active = true;
    firestoreService.getCodigoPersonal(user.uid).then((code) => {
      if (!active) return;
      if (code) {
        setPersonalCode(String(code));
        return;
      }
      if (user?.codigoPersonal) {
        setPersonalCode(String(user.codigoPersonal));
        return;
      }
      setPersonalCode('');
    });
    return () => {
      active = false;
    };
  }, [isPersonal, user?.codigoPersonal, user?.uid]);

  useEffect(() => {
    if (isAdminInstagramMode) {
      setInviteLink('');
      return;
    }
    if (!isPersonal || !personalCode) {
      setInviteLink('');
      return;
    }
    setInviteLink(buildInviteLink(appInviteBase, personalCode));
  }, [appInviteBase, isAdminInstagramMode, isPersonal, personalCode]);

  useEffect(() => {
    if (!canUsePromoStudio || (isPersonal && !personalCode)) {
      setPromoImageUrl('');
      setPromoLoading(false);
      return;
    }
    if (typeof window === 'undefined') return;
    const promoCode = isPersonal ? personalCode : '';
    const promoLink = isPersonal ? inviteLink || appInviteBase : '';
    const promoName = isPersonal ? user?.displayName || '' : '';
    setPromoLoading(true);
    let active = true;
    const timer = window.setTimeout(() => {
      const nextImage = createPromotionalInviteImage({
        code: promoCode,
        link: promoLink,
        personalName: promoName,
        title:
          promoTitle.trim() ||
          (isAdminInstagramMode
            ? 'Treino inteligente para uma evolucao real'
            : 'Treine comigo no MH Personal Trainer'),
        subtitle:
          promoSubtitle.trim() ||
          (isAdminInstagramMode
            ? 'Tecnologia e acompanhamento para elevar seu resultado.'
            : 'Use meu codigo para entrar no app.'),
        cta:
          promoCta.trim() ||
          (isAdminInstagramMode ? 'Descubra o ecossistema MH Personal Trainer' : 'Use o codigo e comece hoje'),
        mode: isAdminInstagramMode ? 'general' : 'invite',
        brandLabel: isAdminInstagramMode ? adminBrandLabel : 'MH PERSONAL TRAINER',
        footerLabel: isAdminInstagramMode ? adminFooterLabel : '',
        typography: {
          titleScale: promoTitleScale,
          subtitleScale: promoSubtitleScale,
          ctaScale: promoCtaScale,
          uppercaseTitle: promoUppercaseTitle,
        },
        overlayOpacity: promoOverlay,
        showFrame: promoFrame,
        design: {
          layout: promoLayout,
          filter: promoFilter,
          grain: promoGrain,
          vignette: promoVignette,
          accentLevel: promoAccentLevel,
        },
        fontSet: resolvePromoFontSet(promoFont),
        format: promoFormat,
        textAlign: promoTextAlign,
        colors: {
          bgStart: promoBgStartColor,
          bgEnd: promoBgEndColor,
          accent: promoAccentColor,
        },
        effects: {
          angle: promoGradientAngle,
          glow: promoGlow,
          texture: promoTexture,
          text: promoTextEffect,
          background: promoBackgroundEffect,
        },
        photo: {
          image: promoPhotoImageRef.current,
          fit: promoPhotoFit,
          zoom: promoPhotoZoom,
          offsetX: promoPhotoOffsetX,
          offsetY: promoPhotoOffsetY,
          opacity: promoPhotoOpacity,
        },
        sticker: {
          type: promoStickerType,
          x: promoStickerX,
          y: promoStickerY,
          size: promoStickerSize,
          opacity: promoStickerOpacity,
          rotation: promoStickerRotation,
          layer: promoStickerLayer,
        },
      });
      if (!active) return;
      setPromoImageUrl(nextImage);
      setPromoLoading(false);
    }, 120);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [
    adminBrandLabel,
    adminFooterLabel,
    appInviteBase,
    canUsePromoStudio,
    inviteLink,
    isAdminInstagramMode,
    isPersonal,
    personalCode,
    promoAccentColor,
    promoBgEndColor,
    promoBgStartColor,
    promoCta,
    promoBackgroundEffect,
    promoFormat,
    promoGlow,
    promoGradientAngle,
    promoSubtitle,
    promoTextAlign,
    promoTitleScale,
    promoSubtitleScale,
    promoCtaScale,
    promoUppercaseTitle,
    promoOverlay,
    promoFrame,
    promoLayout,
    promoFilter,
    promoGrain,
    promoVignette,
    promoAccentLevel,
    promoFont,
    promoTextEffect,
    promoTexture,
    promoTitle,
    promoPhotoFit,
    promoPhotoZoom,
    promoPhotoOffsetX,
    promoPhotoOffsetY,
    promoPhotoOpacity,
    promoPhotoUrl,
    promoStickerType,
    promoStickerX,
    promoStickerY,
    promoStickerSize,
    promoStickerOpacity,
    promoStickerRotation,
    promoStickerLayer,
    user?.displayName,
  ]);

  const applyPromoThemeColors = (theme: PromoThemeKey) => {
    const palette = PROMO_THEME_COLORS[theme];
    setPromoBgStartColor(palette.bgStart);
    setPromoBgEndColor(palette.bgEnd);
    setPromoAccentColor(palette.accent);
  };

  const applyAdminPostPreset = (preset: AdminPostPresetKey) => {
    if (preset === 'venda') {
      setPromoTheme('energia');
      applyPromoThemeColors('energia');
      setPromoTitle('Transforme seus treinos com o MH Personal Trainer');
      setPromoSubtitle('Plataforma completa para evolucao real com acompanhamento diario.');
      setPromoCta('Comece hoje e acelere seus resultados');
      setPromoTextEffect('gradient');
      setPromoBackgroundEffect('burst');
      setPromoLayout('impact');
      setPromoFilter('warm');
      setPromoFont('athletic');
      setPromoGrain(12);
      setPromoVignette(34);
      setPromoAccentLevel(62);
      return;
    }
    if (preset === 'motivacao') {
      setPromoTheme('oceano');
      applyPromoThemeColors('oceano');
      setPromoTitle('Consistencia diaria gera resultados extraordinarios');
      setPromoSubtitle('Mantenha foco com rotina inteligente, suporte e metas claras.');
      setPromoCta('Ative sua melhor versao hoje');
      setPromoTextEffect('neon');
      setPromoBackgroundEffect('wave');
      setPromoLayout('center-stage');
      setPromoFilter('cold');
      setPromoFont('headline');
      setPromoGrain(20);
      setPromoVignette(38);
      setPromoAccentLevel(48);
      return;
    }
    if (preset === 'resultado') {
      setPromoTheme('grafite');
      applyPromoThemeColors('grafite');
      setPromoTitle('Resultados mensuraveis para alunos e personais');
      setPromoSubtitle('Dados, progresso e performance em um fluxo unico de acompanhamento.');
      setPromoCta('Escalone sua entrega com qualidade');
      setPromoTextEffect('lift');
      setPromoBackgroundEffect('mesh');
      setPromoLayout('split-right');
      setPromoFilter('cinematic');
      setPromoFont('editorial');
      setPromoGrain(28);
      setPromoVignette(44);
      setPromoAccentLevel(54);
      return;
    }
    setPromoTheme('oceano');
    applyPromoThemeColors('oceano');
    setPromoTitle('Comunidade forte, treino inteligente e evolucao continua');
    setPromoSubtitle('Conecte alunos, orientacao profissional e rotina organizada no mesmo app.');
    setPromoCta('Entre para a comunidade MH');
    setPromoTextEffect('shadow');
    setPromoBackgroundEffect('rings');
    setPromoLayout('minimal');
    setPromoFilter('none');
    setPromoFont('brand');
    setPromoGrain(18);
    setPromoVignette(26);
    setPromoAccentLevel(36);
  };

  const handleRandomizeAdminVisual = () => {
    const nextLayout: PromoLayoutKey[] = ['impact', 'center-stage', 'split-right', 'minimal'];
    const nextFilter: PromoFilterKey[] = ['none', 'cinematic', 'cold', 'warm', 'mono'];
    const nextFont: PromoFontKey[] = ['brand', 'clean', 'headline', 'editorial', 'athletic'];
    const nextBackground: PromoBackgroundEffectKey[] = ['texture', 'rings', 'dots', 'wave', 'mesh', 'burst'];
    const nextTextEffect: PromoTextEffectKey[] = ['clean', 'shadow', 'outline', 'neon', 'gradient', 'glass', 'lift'];
    const randomPick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];
    const randomRange = (min: number, max: number) =>
      Math.floor(Math.random() * (max - min + 1)) + min;

    setPromoLayout(randomPick(nextLayout));
    setPromoFilter(randomPick(nextFilter));
    setPromoFont(randomPick(nextFont));
    setPromoBackgroundEffect(randomPick(nextBackground));
    setPromoTextEffect(randomPick(nextTextEffect));
    setPromoGradientAngle(randomRange(8, 344));
    setPromoGlow(randomRange(22, 88));
    setPromoTexture(randomRange(18, 86));
    setPromoOverlay(randomRange(6, 44));
    setPromoGrain(randomRange(0, 46));
    setPromoVignette(randomRange(8, 62));
    setPromoAccentLevel(randomRange(16, 78));
    setPromoTitleScale(randomRange(86, 126));
    setPromoSubtitleScale(randomRange(84, 120));
    setPromoCtaScale(randomRange(86, 122));
    setPromoFrame(Math.random() > 0.35);
    setPromoUppercaseTitle(Math.random() > 0.6);
  };

  const clearPromoPhoto = () => {
    if (promoPhotoObjectUrlRef.current) {
      URL.revokeObjectURL(promoPhotoObjectUrlRef.current);
      promoPhotoObjectUrlRef.current = '';
    }
    promoPhotoImageRef.current = null;
    setPromoPhotoUrl('');
  };

  const handlePromoPhotoUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setPromoAiError('Formato invalido. Envie uma imagem JPG, PNG ou WEBP.');
      event.target.value = '';
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => {
      if (promoPhotoObjectUrlRef.current) {
        URL.revokeObjectURL(promoPhotoObjectUrlRef.current);
      }
      promoPhotoObjectUrlRef.current = objectUrl;
      promoPhotoImageRef.current = image;
      setPromoPhotoUrl(objectUrl);
      setPromoAiError('');
      setInviteFeedback('Foto aplicada no fundo do card.');
      window.setTimeout(() => setInviteFeedback(''), 2200);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setPromoAiError('Nao foi possivel ler essa imagem. Tente outra foto.');
    };
    image.src = objectUrl;
    event.target.value = '';
  };

  const handleGeneratePromoCopyWithAi = async () => {
    setPromoAiError('');
    setPromoAiLoading(true);
    try {
      const limits = PROMO_AI_COPY_LIMITS[promoFormat];
      let parsed: PromoAiCopy | null = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const prompt = buildPromoAiPrompt({
          personalName: user?.displayName || '',
          personalCode,
          inviteLink,
          mode: isAdminInstagramMode ? 'general' : 'invite',
          campaign: isAdminInstagramMode ? adminCampaignBrief : 'Convite para novos alunos',
          format: promoFormat,
          tone: promoAiTone,
          limits,
          strictMode: attempt > 0,
        });
        const raw = await generateText(prompt);
        const candidate = parsePromoAiCopy(raw);
        if (!candidate) continue;
        const normalized = normalizePromoAiCopy(candidate, limits);
        if (!isPromoAiCopySized(normalized, limits)) continue;
        parsed = normalized;
        break;
      }
      if (!parsed) {
        throw new Error('A IA retornou texto curto demais para esse formato. Tente gerar novamente.');
      }
      setPromoTitle(parsed.title);
      setPromoSubtitle(parsed.subtitle);
      setPromoCta(parsed.cta);
      setInviteFeedback('Texto gerado com IA.');
      window.setTimeout(() => setInviteFeedback(''), 2200);
    } catch (error: any) {
      setPromoAiError(error?.message || 'Erro ao gerar texto com IA.');
    } finally {
      setPromoAiLoading(false);
    }
  };

  const promoPreviewClass = `students-promo-preview is-${promoFormat}`;
  const promoFormatLabel = PROMO_FORMATS[promoFormat].label;
  const promoTextEffectLabel = PROMO_TEXT_EFFECT_LABELS[promoTextEffect];
  const promoBackgroundEffectLabel = PROMO_BACKGROUND_EFFECT_LABELS[promoBackgroundEffect];
  const promoTextAlignLabel = PROMO_TEXT_ALIGN_LABELS[promoTextAlign];
  const promoFontLabel = PROMO_FONT_LABELS[promoFont];

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const uiSelectors = ['.chat-fab', '.personal-bottom-nav', '.student-bottom-nav'];

    if (!promoEditorOpen) {
      document.body.classList.remove('students-sheet-open');
      document.documentElement.classList.remove('students-sheet-open');
      hiddenUiElementsRef.current.forEach(({ element, value, priority }) => {
        if (value) {
          element.style.setProperty('display', value, priority);
        } else {
          element.style.removeProperty('display');
        }
      });
      hiddenUiElementsRef.current = [];
      return;
    }
    const previousOverflow = document.body.style.overflow;
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPromoEditorOpen(false);
    };
    document.body.classList.add('students-sheet-open');
    document.documentElement.classList.add('students-sheet-open');
    hiddenUiElementsRef.current = uiSelectors.flatMap((selector) =>
      Array.from(document.querySelectorAll<HTMLElement>(selector)).map((element) => {
        const value = element.style.getPropertyValue('display');
        const priority = element.style.getPropertyPriority('display');
        element.style.setProperty('display', 'none', 'important');
        return { element, value, priority };
      })
    );
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.classList.remove('students-sheet-open');
      document.documentElement.classList.remove('students-sheet-open');
      hiddenUiElementsRef.current.forEach(({ element, value, priority }) => {
        if (value) {
          element.style.setProperty('display', value, priority);
        } else {
          element.style.removeProperty('display');
        }
      });
      hiddenUiElementsRef.current = [];
      window.removeEventListener('keydown', handleEsc);
    };
  }, [promoEditorOpen]);

  useEffect(() => {
    if (!promoEditorOpen) return;
    const resetScroll = () => {
      promoSheetBodyRef.current?.scrollTo({ top: 0, behavior: 'auto' });
      promoSheetRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    };
    resetScroll();
    const raf1 = window.requestAnimationFrame(resetScroll);
    const raf2 = window.requestAnimationFrame(() => window.requestAnimationFrame(resetScroll));
    const timer = window.setTimeout(resetScroll, 90);
    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
      window.clearTimeout(timer);
    };
  }, [promoEditorOpen]);

  useEffect(() => {
    return () => {
      if (promoPhotoObjectUrlRef.current) {
        URL.revokeObjectURL(promoPhotoObjectUrlRef.current);
      }
    };
  }, []);

  const renderPromoPreview = (extraClassName = '') => {
    const className = extraClassName ? `${promoPreviewClass} ${extraClassName}` : promoPreviewClass;
    return (
      <div className={className}>
        <div className="students-promo-preview-head">
          <span>{promoFormatLabel}</span>
          <span className="students-promo-status">
            {promoLoading ? 'Atualizando preview...' : 'Pronto para baixar'}
          </span>
        </div>
        {promoImageUrl ? (
          <img
            src={promoImageUrl}
            alt={
              isAdminInstagramMode
                ? 'Preview do post geral para Instagram'
                : 'Preview da arte promocional de convite'
            }
            style={{ aspectRatio: PROMO_FORMATS[promoFormat].previewAspect }}
          />
        ) : (
          <div className="students-promo-placeholder">
            <strong>Preview indisponivel</strong>
            <span>
              {isAdminInstagramMode
                ? `Ajuste o layout para gerar post ${promoFormatLabel.toLowerCase()}.`
                : `Defina seu codigo para gerar arte para ${promoFormatLabel.toLowerCase()}.`}
            </span>
          </div>
        )}
      </div>
    );
  };

  const handleOpenChat = (student: StudentCard) => {
    if (!user?.uid || typeof window === 'undefined') return;
    window.dispatchEvent(
      new CustomEvent('mh:open-chat', {
        detail: {
          userId: student.id,
          name: student.name,
          photoUrl: student.photoUrl,
        },
      })
    );
  };

  const handleCopyInvite = async (value: string, successMessage: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setInviteFeedback(successMessage);
      window.setTimeout(() => setInviteFeedback(''), 2200);
    } catch (_) {
      setInviteFeedback('Nao foi possivel copiar o link.');
      window.setTimeout(() => setInviteFeedback(''), 2200);
    }
  };

  const handleDownloadPromo = () => {
    if (!promoImageUrl || typeof document === 'undefined') return;
    const exportCode = isPersonal ? personalCode || '000' : 'admin-post';
    const link = document.createElement('a');
    link.href = promoImageUrl;
    link.download = `${isAdminInstagramMode ? 'mh-instagram-post' : 'mh-personal-convite'}-${exportCode}-${promoFormat}.png`;
    link.click();
    setInviteFeedback(`Arte ${promoFormatLabel.toLowerCase()} baixada!`);
    window.setTimeout(() => setInviteFeedback(''), 2200);
  };

  const handleCardKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, studentId: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      router.push(`/students/${studentId}`);
    }
  };

  const toggleActionMenu = (studentId: string) => {
    setOpenActionId((prev) => (prev === studentId ? null : studentId));
  };

  const handleToggleStatus = async (student: StudentCard) => {
    if (!isPersonal || !user?.uid) return;
    const isInactive = student.status?.toLowerCase() === 'inativo';
    if (!isInactive) {
      const confirmed = window.confirm('Deseja desativar este aluno? Ele nao acessara o app.');
      if (!confirmed) return;
    }
    setActionId(student.id);
    setActionError('');
    setActionMessage('');
    try {
      await firestoreService.updateStudentStatus(
        student.id,
        isInactive,
        !isInactive
          ? {
              actorRole: 'personal',
              personalId: user.uid,
              personalName: user.displayName,
            }
          : undefined
      );
      setActionMessage(isInactive ? 'Aluno ativado.' : 'Aluno desativado.');
    } catch (error: any) {
      setActionError(error?.message || 'Erro ao atualizar status.');
    } finally {
      setActionId('');
      window.setTimeout(() => setActionMessage(''), 2000);
    }
  };

  const handleRemoveStudent = async (student: StudentCard) => {
    if (!isPersonal || !user?.uid) return;
    const confirmed = window.confirm(
      'Deseja excluir este aluno da sua lista? A conta dele continuara ativa.'
    );
    if (!confirmed) return;
    setActionId(student.id);
    setActionError('');
    setActionMessage('');
    try {
      await firestoreService.removeStudentFromPersonal(user.uid, student.id);
      setActionMessage('Aluno removido da sua lista.');
    } catch (error: any) {
      setActionError(error?.message || 'Erro ao remover aluno.');
    } finally {
      setActionId('');
      window.setTimeout(() => setActionMessage(''), 2000);
    }
  };

  const renderStudentAvatar = (student: StudentCard) => {
    if (!isPersonal) {
      return (
        <div className="students-card-avatar">
          {student.photoUrl ? (
            <img src={student.photoUrl} alt={student.name} />
          ) : (
            <span>{student.name.charAt(0).toUpperCase()}</span>
          )}
        </div>
      );
    }

    return (
      <div className="students-card-avatar-stack">
        <div className="students-card-avatar is-personal">
          {student.personalPhotoUrl ? (
            <img src={student.personalPhotoUrl} alt={`${student.name} personalizado`} />
          ) : (
            <span>{student.name.charAt(0).toUpperCase()}</span>
          )}
        </div>
        <div className="students-card-avatar is-student">
          {student.photoUrl ? (
            <img src={student.photoUrl} alt={student.name} />
          ) : (
            <span>{student.name.charAt(0).toUpperCase()}</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <PageShell
      title={isAdminInstagramMode ? 'Instagram Studio' : 'Alunos'}
      description={
        isAdminInstagramMode
          ? 'Crie cards/posts oficiais com IA para publicar no Instagram.'
          : 'Gerencie alunos, status, treinos e comunicacao direta.'
      }
      actions={pageActions}
    >
      {!hasAccess && (
        <div className="card">
          <p className="subtle">Essa pagina esta disponivel apenas para personal e administradores.</p>
        </div>
      )}
      {hasAccess && (
        <>
          {canUsePromoStudio && (
            <div className={`students-invite${isAdminInstagramMode ? ' students-invite-admin-studio' : ''}`}>
              <div className="students-invite-main">
                <p className="pill">{isAdminInstagramMode ? 'Instagram studio' : 'Convite'}</p>
                <h3>{isAdminInstagramMode ? 'Crie posts para Instagram com IA' : 'Convide novos alunos'}</h3>
                <p className="subtle" style={{ marginTop: 6 }}>
                  {isAdminInstagramMode
                    ? 'Gere artes em feed, story ou quadrado, copie a legenda e publique direto.'
                    : 'Envie o link do app abaixo para o aluno criar a conta ja vinculado ao seu codigo.'}
                </p>
                {isAdminInstagramMode ? (
                  <div className="students-promo-fields" style={{ marginTop: 14, marginBottom: 4 }}>
                    <label>
                      Tema da campanha
                      <input
                        value={adminCampaignBrief}
                        onChange={(event) => setAdminCampaignBrief(event.target.value)}
                        placeholder="Ex: campanha institucional de performance"
                      />
                    </label>
                    <label>
                      Selo/Marca superior
                      <input
                        value={adminBrandLabel}
                        onChange={(event) => setAdminBrandLabel(event.target.value)}
                        placeholder="MH PERSONAL TRAINER"
                      />
                    </label>
                    <label>
                      Assinatura de rodape
                      <input
                        value={adminFooterLabel}
                        onChange={(event) => setAdminFooterLabel(event.target.value)}
                        placeholder="@mhpersonaltrainer"
                      />
                    </label>
                    <div className="students-promo-option-list" style={{ marginTop: 2 }}>
                      {(['venda', 'motivacao', 'resultado', 'comunidade'] as AdminPostPresetKey[]).map((preset) => (
                        <button key={preset} type="button" className="students-promo-option" onClick={() => applyAdminPostPreset(preset)}>
                          {preset === 'venda' ? 'Venda' : preset === 'motivacao' ? 'Motivacao' : preset === 'resultado' ? 'Resultado' : 'Comunidade'}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="students-invite-actions">
                    <div className="students-invite-row">
                      <input readOnly value={inviteLink || 'Link do app indisponivel.'} />
                    </div>
                    <div className="students-invite-buttons">
                      <button
                        className="button"
                        type="button"
                        onClick={() => handleCopyInvite(inviteLink, 'Link copiado!')}
                        disabled={!inviteLink}
                      >
                        Copiar link
                      </button>
                      <button
                        className="button secondary"
                        type="button"
                        onClick={() =>
                          handleCopyInvite(
                            `E ai, tudo certo? Quero te convidar a usar o MH Personal Trainer para treinar comigo. Use este link do app para criar sua conta: ${inviteLink}`,
                            'Mensagem copiada!'
                          )
                        }
                        disabled={!inviteLink}
                      >
                        Copiar mensagem
                      </button>
                    </div>
                  </div>
                )}
                {inviteFeedback ? <span className="students-invite-feedback">{inviteFeedback}</span> : null}
                <div className={`students-promo${isAdminInstagramMode ? ' students-promo-admin-studio' : ''}`}>
                  <div className="students-promo-copy">
                    <p className="students-promo-kicker">Arte promocional</p>
                    <h4>
                      {isAdminInstagramMode
                        ? 'Monte cards oficiais para campanhas do Instagram'
                        : 'Crie um card para compartilhar com seus alunos'}
                    </h4>
                    <p className="subtle">
                      {isAdminInstagramMode
                        ? 'Abra o editor completo (estilo Photoshop simplificado) para personalizar texto, fundo, efeitos e acabamento.'
                        : 'Abra o editor em bottom sheet para personalizar formato, texto, fundo, alinhamento e gerar copy com IA.'}
                    </p>
                    <div className="students-promo-tags">
                      <span className="students-promo-tag">{promoFormatLabel}</span>
                      <span className="students-promo-tag">{promoTextEffectLabel}</span>
                      <span className="students-promo-tag">{promoBackgroundEffectLabel}</span>
                      <span className="students-promo-tag">{promoTextAlignLabel}</span>
                      {promoPhotoUrl && <span className="students-promo-tag">Foto ativa</span>}
                      {promoStickerType !== 'none' && (
                        <span className="students-promo-tag">{PROMO_STICKER_LABELS[promoStickerType]}</span>
                      )}
                      {isAdminInstagramMode && <span className="students-promo-tag">{promoFontLabel}</span>}
                      {isAdminInstagramMode && <span className="students-promo-tag">{PROMO_LAYOUT_LABELS[promoLayout]}</span>}
                      {isAdminInstagramMode && <span className="students-promo-tag">{PROMO_FILTER_LABELS[promoFilter]}</span>}
                    </div>
                    <div className="students-promo-buttons">
                      <button className="button" type="button" onClick={() => setPromoEditorOpen(true)}>
                        Abrir editor completo
                      </button>
                      {isAdminInstagramMode && (
                        <button className="button secondary" type="button" onClick={handleRandomizeAdminVisual}>
                          Variacao automatica
                        </button>
                      )}
                      <button
                        className="button secondary"
                        type="button"
                        onClick={handleDownloadPromo}
                        disabled={!promoImageUrl || promoLoading}
                      >
                        {promoLoading ? 'Gerando arte...' : 'Baixar arte PNG'}
                      </button>
                      <button
                        className="button secondary"
                        type="button"
                        onClick={() => handleCopyInvite(inviteMessage, 'Legenda copiada!')}
                        disabled={!inviteMessage}
                      >
                        Copiar legenda
                      </button>
                    </div>
                  </div>
                  {renderPromoPreview()}
                </div>
                {promoEditorOpen ? (
                  <div
                    className={`students-sheet-backdrop${isAdminInstagramMode ? ' is-admin-studio' : ''}`}
                    onClick={() => setPromoEditorOpen(false)}
                  >
                    <div
                      className={`students-sheet${isAdminInstagramMode ? ' is-admin-studio' : ''}`}
                      ref={promoSheetRef}
                      role="dialog"
                      aria-modal="true"
                      aria-label="Editor de arte promocional"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="students-sheet-handle" />
                      <div className="students-sheet-header">
                        <div>
                          <p className="students-promo-kicker">{isAdminInstagramMode ? 'Studio pro' : 'Editor'}</p>
                          <h4>
                            {isAdminInstagramMode
                              ? 'Editor profissional de campanha'
                              : 'Personalize sua arte promocional'}
                          </h4>
                          {isAdminInstagramMode && (
                            <p className="subtle" style={{ marginTop: 4 }}>
                              Composicao visual avancada para posts institucionais.
                            </p>
                          )}
                        </div>
                        <button
                          className="students-sheet-close"
                          type="button"
                          onClick={() => setPromoEditorOpen(false)}
                        >
                          Fechar
                        </button>
                      </div>
                      <div className="students-sheet-body" ref={promoSheetBodyRef}>
                        <div className="students-sheet-grid">
                          <div className="students-promo-form">
                            <p className="students-promo-section-title">Formato</p>
                            <div className="students-promo-format-list">
                              {(['feed', 'story', 'square'] as PromoFormatKey[]).map((format) => (
                                <button
                                  key={format}
                                  type="button"
                                  className={`students-promo-format${promoFormat === format ? ' is-active' : ''}`}
                                  onClick={() => setPromoFormat(format)}
                                >
                                  <strong>{PROMO_FORMATS[format].label}</strong>
                                  <span>
                                    {PROMO_FORMATS[format].width}x{PROMO_FORMATS[format].height}
                                  </span>
                                </button>
                              ))}
                            </div>
                            <p className="students-promo-section-title">Texto</p>
                            <div className="students-promo-fields">
                              <label>
                                Titulo
                                <input
                                  value={promoTitle}
                                  onChange={(event) => setPromoTitle(event.target.value)}
                                  placeholder="Treine comigo no MH Personal Trainer"
                                />
                              </label>
                              <label>
                                Subtitulo
                                <input
                                  value={promoSubtitle}
                                  onChange={(event) => setPromoSubtitle(event.target.value)}
                                  placeholder="Use meu codigo para entrar no app"
                                />
                              </label>
                              <label>
                                Chamada final
                                <input
                                  value={promoCta}
                                  onChange={(event) => setPromoCta(event.target.value)}
                                  placeholder="Use o codigo e comece hoje"
                                />
                              </label>
                              {isAdminInstagramMode && (
                                <>
                                  <label>
                                    Tema da campanha
                                    <input
                                      value={adminCampaignBrief}
                                      onChange={(event) => setAdminCampaignBrief(event.target.value)}
                                      placeholder="Ex: institucional, engajamento, awareness"
                                    />
                                  </label>
                                  <label>
                                    Marca superior
                                    <input
                                      value={adminBrandLabel}
                                      onChange={(event) => setAdminBrandLabel(event.target.value)}
                                      placeholder="MH PERSONAL TRAINER"
                                    />
                                  </label>
                                  <label>
                                    Assinatura de rodape
                                    <input
                                      value={adminFooterLabel}
                                      onChange={(event) => setAdminFooterLabel(event.target.value)}
                                      placeholder="@mhpersonaltrainer"
                                    />
                                  </label>
                                </>
                              )}
                            </div>
                            <p className="students-promo-section-title">Foto de fundo</p>
                            <div className="students-promo-upload">
                              <label htmlFor="promo-photo-upload">Imagem principal</label>
                              <input
                                id="promo-photo-upload"
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                onChange={handlePromoPhotoUpload}
                              />
                              <div className="students-promo-buttons">
                                <button
                                  className="button secondary"
                                  type="button"
                                  onClick={clearPromoPhoto}
                                  disabled={!promoPhotoUrl}
                                >
                                  Remover foto
                                </button>
                              </div>
                            </div>
                            <p className="students-promo-section-title">Enquadramento da foto</p>
                            <div className="students-promo-option-list">
                              {(['cover', 'contain'] as PromoPhotoFitKey[]).map((fit) => (
                                <button
                                  key={fit}
                                  type="button"
                                  className={`students-promo-option${promoPhotoFit === fit ? ' is-active' : ''}`}
                                  onClick={() => setPromoPhotoFit(fit)}
                                >
                                  {PROMO_PHOTO_FIT_LABELS[fit]}
                                </button>
                              ))}
                            </div>
                            <div className="students-promo-range-grid">
                              <label className="students-promo-range">
                                <span>
                                  Zoom da foto <output>{promoPhotoZoom}%</output>
                                </span>
                                <input
                                  type="range"
                                  min={70}
                                  max={220}
                                  value={promoPhotoZoom}
                                  onChange={(event) => setPromoPhotoZoom(Number(event.target.value))}
                                />
                              </label>
                              <label className="students-promo-range">
                                <span>
                                  Posicao horizontal <output>{promoPhotoOffsetX}%</output>
                                </span>
                                <input
                                  type="range"
                                  min={-100}
                                  max={100}
                                  value={promoPhotoOffsetX}
                                  onChange={(event) => setPromoPhotoOffsetX(Number(event.target.value))}
                                />
                              </label>
                              <label className="students-promo-range">
                                <span>
                                  Posicao vertical <output>{promoPhotoOffsetY}%</output>
                                </span>
                                <input
                                  type="range"
                                  min={-100}
                                  max={100}
                                  value={promoPhotoOffsetY}
                                  onChange={(event) => setPromoPhotoOffsetY(Number(event.target.value))}
                                />
                              </label>
                              <label className="students-promo-range">
                                <span>
                                  Opacidade da foto <output>{promoPhotoOpacity}%</output>
                                </span>
                                <input
                                  type="range"
                                  min={0}
                                  max={100}
                                  value={promoPhotoOpacity}
                                  onChange={(event) => setPromoPhotoOpacity(Number(event.target.value))}
                                />
                              </label>
                            </div>
                            <p className="students-promo-section-title">Figurinhas e icones</p>
                            <div className="students-promo-option-list">
                              {(
                                ['none', 'mh-badge', 'spark', 'target', 'bolt'] as PromoStickerKey[]
                              ).map((sticker) => (
                                <button
                                  key={sticker}
                                  type="button"
                                  className={`students-promo-option${promoStickerType === sticker ? ' is-active' : ''}`}
                                  onClick={() => setPromoStickerType(sticker)}
                                >
                                  {PROMO_STICKER_LABELS[sticker]}
                                </button>
                              ))}
                            </div>
                            <div className="students-promo-option-list">
                              {(['back', 'front'] as PromoStickerLayerKey[]).map((layer) => (
                                <button
                                  key={layer}
                                  type="button"
                                  className={`students-promo-option${promoStickerLayer === layer ? ' is-active' : ''}`}
                                  onClick={() => setPromoStickerLayer(layer)}
                                >
                                  {PROMO_STICKER_LAYER_LABELS[layer]}
                                </button>
                              ))}
                            </div>
                            <div className="students-promo-range-grid">
                              <label className="students-promo-range">
                                <span>
                                  Posicao X sticker <output>{promoStickerX}%</output>
                                </span>
                                <input
                                  type="range"
                                  min={0}
                                  max={100}
                                  value={promoStickerX}
                                  onChange={(event) => setPromoStickerX(Number(event.target.value))}
                                />
                              </label>
                              <label className="students-promo-range">
                                <span>
                                  Posicao Y sticker <output>{promoStickerY}%</output>
                                </span>
                                <input
                                  type="range"
                                  min={0}
                                  max={100}
                                  value={promoStickerY}
                                  onChange={(event) => setPromoStickerY(Number(event.target.value))}
                                />
                              </label>
                              <label className="students-promo-range">
                                <span>
                                  Tamanho sticker <output>{promoStickerSize}%</output>
                                </span>
                                <input
                                  type="range"
                                  min={8}
                                  max={64}
                                  value={promoStickerSize}
                                  onChange={(event) => setPromoStickerSize(Number(event.target.value))}
                                />
                              </label>
                              <label className="students-promo-range">
                                <span>
                                  Rotacao sticker <output>{promoStickerRotation}deg</output>
                                </span>
                                <input
                                  type="range"
                                  min={-180}
                                  max={180}
                                  value={promoStickerRotation}
                                  onChange={(event) => setPromoStickerRotation(Number(event.target.value))}
                                />
                              </label>
                              <label className="students-promo-range">
                                <span>
                                  Opacidade sticker <output>{promoStickerOpacity}%</output>
                                </span>
                                <input
                                  type="range"
                                  min={0}
                                  max={100}
                                  value={promoStickerOpacity}
                                  onChange={(event) => setPromoStickerOpacity(Number(event.target.value))}
                                />
                              </label>
                            </div>
                            {isAdminInstagramMode && (
                              <>
                                <p className="students-promo-section-title">Presets rapidos</p>
                                <div className="students-promo-option-list">
                                  {(['venda', 'motivacao', 'resultado', 'comunidade'] as AdminPostPresetKey[]).map((preset) => (
                                    <button
                                      key={preset}
                                      type="button"
                                      className="students-promo-option"
                                      onClick={() => applyAdminPostPreset(preset)}
                                    >
                                      {preset === 'venda'
                                        ? 'Venda'
                                        : preset === 'motivacao'
                                        ? 'Motivacao'
                                        : preset === 'resultado'
                                        ? 'Resultado'
                                        : 'Comunidade'}
                                    </button>
                                  ))}
                                </div>
                                <p className="students-promo-section-title">Composicao</p>
                                <div className="students-promo-option-list">
                                  {(['impact', 'center-stage', 'split-right', 'minimal'] as PromoLayoutKey[]).map((layout) => (
                                    <button
                                      key={layout}
                                      type="button"
                                      className={`students-promo-option${promoLayout === layout ? ' is-active' : ''}`}
                                      onClick={() => setPromoLayout(layout)}
                                    >
                                      {PROMO_LAYOUT_LABELS[layout]}
                                    </button>
                                  ))}
                                </div>
                                <p className="students-promo-section-title">Filtro visual</p>
                                <div className="students-promo-option-list">
                                  {(['none', 'cinematic', 'cold', 'warm', 'mono'] as PromoFilterKey[]).map((filter) => (
                                    <button
                                      key={filter}
                                      type="button"
                                      className={`students-promo-option${promoFilter === filter ? ' is-active' : ''}`}
                                      onClick={() => setPromoFilter(filter)}
                                    >
                                      {PROMO_FILTER_LABELS[filter]}
                                    </button>
                                  ))}
                                </div>
                                <p className="students-promo-section-title">Fonte</p>
                                <div className="students-promo-option-list">
                                  {(['brand', 'clean', 'headline', 'editorial', 'athletic'] as PromoFontKey[]).map((font) => (
                                    <button
                                      key={font}
                                      type="button"
                                      data-font={font}
                                      className={`students-promo-option${promoFont === font ? ' is-active' : ''}`}
                                      onClick={() => setPromoFont(font)}
                                    >
                                      {PROMO_FONT_LABELS[font]}
                                    </button>
                                  ))}
                                </div>
                              </>
                            )}
                            <p className="students-promo-section-title">Copy com IA</p>
                            <div className="students-promo-ai">
                              <div className="students-promo-option-list">
                                {(['conversion', 'motivational', 'premium'] as PromoAiToneKey[]).map((tone) => (
                                  <button
                                    key={tone}
                                    type="button"
                                    className={`students-promo-option${promoAiTone === tone ? ' is-active' : ''}`}
                                    onClick={() => setPromoAiTone(tone)}
                                  >
                                    {PROMO_AI_TONE_LABELS[tone]}
                                  </button>
                                ))}
                              </div>
                              <div className="students-promo-buttons">
                                <button
                                  className="button secondary"
                                  type="button"
                                  onClick={handleGeneratePromoCopyWithAi}
                                  disabled={promoAiLoading}
                                >
                                  {promoAiLoading ? 'Gerando copy IA...' : 'Gerar texto com IA'}
                                </button>
                              </div>
                              <p className="students-promo-ai-note">
                                {isAdminInstagramMode
                                  ? 'Modo admin: IA liberada para gerar copy geral sem limite de assinatura.'
                                  : 'A geracao com IA usa 1 credito por solicitacao no plano gratuito.'}
                              </p>
                              {promoAiError ? <p className="students-promo-ai-error">{promoAiError}</p> : null}
                            </div>
                            <p className="students-promo-section-title">Alinhamento do texto</p>
                            <div className="students-promo-option-list">
                              {(['left', 'center', 'right'] as PromoTextAlignKey[]).map((align) => (
                                <button
                                  key={align}
                                  type="button"
                                  className={`students-promo-option${promoTextAlign === align ? ' is-active' : ''}`}
                                  onClick={() => setPromoTextAlign(align)}
                                >
                                  {PROMO_TEXT_ALIGN_LABELS[align]}
                                </button>
                              ))}
                            </div>
                            <p className="students-promo-section-title">Efeito de texto</p>
                            <div className="students-promo-option-list">
                              {(
                                [
                                  'clean',
                                  'shadow',
                                  'outline',
                                  'neon',
                                  'gradient',
                                  'glass',
                                  'lift',
                                ] as PromoTextEffectKey[]
                              ).map((effect) => (
                                <button
                                  key={effect}
                                  type="button"
                                  className={`students-promo-option${promoTextEffect === effect ? ' is-active' : ''}`}
                                  onClick={() => setPromoTextEffect(effect)}
                                >
                                  {PROMO_TEXT_EFFECT_LABELS[effect]}
                                </button>
                              ))}
                            </div>
                            <p className="students-promo-section-title">Tema e cores</p>
                            <div className="students-promo-themes">
                              {(['oceano', 'energia', 'grafite'] as PromoThemeKey[]).map((theme) => (
                                <button
                                  key={theme}
                                  type="button"
                                  className={`students-promo-theme${promoTheme === theme ? ' is-active' : ''}`}
                                  onClick={() => {
                                    setPromoTheme(theme);
                                    applyPromoThemeColors(theme);
                                  }}
                                >
                                  {PROMO_THEME_LABELS[theme]}
                                </button>
                              ))}
                            </div>
                            <div className="students-promo-color-grid">
                              <label className="students-promo-color-control">
                                Cor inicial
                                <span className="students-promo-color-row">
                                  <input
                                    type="color"
                                    value={promoBgStartColor}
                                    onChange={(event) => setPromoBgStartColor(event.target.value)}
                                  />
                                  <code>{promoBgStartColor.toUpperCase()}</code>
                                </span>
                              </label>
                              <label className="students-promo-color-control">
                                Cor final
                                <span className="students-promo-color-row">
                                  <input
                                    type="color"
                                    value={promoBgEndColor}
                                    onChange={(event) => setPromoBgEndColor(event.target.value)}
                                  />
                                  <code>{promoBgEndColor.toUpperCase()}</code>
                                </span>
                              </label>
                              <label className="students-promo-color-control">
                                Cor destaque
                                <span className="students-promo-color-row">
                                  <input
                                    type="color"
                                    value={promoAccentColor}
                                    onChange={(event) => setPromoAccentColor(event.target.value)}
                                  />
                                  <code>{promoAccentColor.toUpperCase()}</code>
                                </span>
                              </label>
                            </div>
                            <p className="students-promo-section-title">Efeito de fundo</p>
                            <div className="students-promo-option-list">
                              {(
                                ['texture', 'rings', 'dots', 'wave', 'mesh', 'burst'] as PromoBackgroundEffectKey[]
                              ).map((effect) => (
                                <button
                                  key={effect}
                                  type="button"
                                  className={`students-promo-option${promoBackgroundEffect === effect ? ' is-active' : ''}`}
                                  onClick={() => setPromoBackgroundEffect(effect)}
                                >
                                  {PROMO_BACKGROUND_EFFECT_LABELS[effect]}
                                </button>
                              ))}
                            </div>
                            <div className="students-promo-range-grid">
                              <label className="students-promo-range">
                                <span>
                                  Angulo do gradiente <output>{promoGradientAngle}deg</output>
                                </span>
                                <input
                                  type="range"
                                  min={0}
                                  max={360}
                                  value={promoGradientAngle}
                                  onChange={(event) => setPromoGradientAngle(Number(event.target.value))}
                                />
                              </label>
                              <label className="students-promo-range">
                                <span>
                                  Brilho (glow) <output>{promoGlow}%</output>
                                </span>
                                <input
                                  type="range"
                                  min={0}
                                  max={100}
                                  value={promoGlow}
                                  onChange={(event) => setPromoGlow(Number(event.target.value))}
                                />
                              </label>
                              <label className="students-promo-range">
                                <span>
                                  Intensidade fundo <output>{promoTexture}%</output>
                                </span>
                                <input
                                  type="range"
                                  min={0}
                                  max={100}
                                  value={promoTexture}
                                  onChange={(event) => setPromoTexture(Number(event.target.value))}
                                />
                              </label>
                              {isAdminInstagramMode && (
                                <>
                                  <label className="students-promo-range">
                                    <span>
                                      Escala do titulo <output>{promoTitleScale}%</output>
                                    </span>
                                    <input
                                      type="range"
                                      min={70}
                                      max={150}
                                      value={promoTitleScale}
                                      onChange={(event) => setPromoTitleScale(Number(event.target.value))}
                                    />
                                  </label>
                                  <label className="students-promo-range">
                                    <span>
                                      Escala do subtitulo <output>{promoSubtitleScale}%</output>
                                    </span>
                                    <input
                                      type="range"
                                      min={70}
                                      max={150}
                                      value={promoSubtitleScale}
                                      onChange={(event) => setPromoSubtitleScale(Number(event.target.value))}
                                    />
                                  </label>
                                  <label className="students-promo-range">
                                    <span>
                                      Escala da chamada <output>{promoCtaScale}%</output>
                                    </span>
                                    <input
                                      type="range"
                                      min={70}
                                      max={150}
                                      value={promoCtaScale}
                                      onChange={(event) => setPromoCtaScale(Number(event.target.value))}
                                    />
                                  </label>
                                  <label className="students-promo-range">
                                    <span>
                                      Overlay da arte <output>{promoOverlay}%</output>
                                    </span>
                                    <input
                                      type="range"
                                      min={0}
                                      max={80}
                                      value={promoOverlay}
                                      onChange={(event) => setPromoOverlay(Number(event.target.value))}
                                    />
                                  </label>
                                  <label className="students-promo-range">
                                    <span>
                                      Granulacao <output>{promoGrain}%</output>
                                    </span>
                                    <input
                                      type="range"
                                      min={0}
                                      max={100}
                                      value={promoGrain}
                                      onChange={(event) => setPromoGrain(Number(event.target.value))}
                                    />
                                  </label>
                                  <label className="students-promo-range">
                                    <span>
                                      Vinheta <output>{promoVignette}%</output>
                                    </span>
                                    <input
                                      type="range"
                                      min={0}
                                      max={100}
                                      value={promoVignette}
                                      onChange={(event) => setPromoVignette(Number(event.target.value))}
                                    />
                                  </label>
                                  <label className="students-promo-range">
                                    <span>
                                      Destaque de cor <output>{promoAccentLevel}%</output>
                                    </span>
                                    <input
                                      type="range"
                                      min={0}
                                      max={100}
                                      value={promoAccentLevel}
                                      onChange={(event) => setPromoAccentLevel(Number(event.target.value))}
                                    />
                                  </label>
                                </>
                              )}
                            </div>
                            {isAdminInstagramMode && (
                              <>
                                <p className="students-promo-section-title">Acabamento</p>
                                <div className="students-promo-option-list">
                                  <button
                                    type="button"
                                    className={`students-promo-option${promoUppercaseTitle ? ' is-active' : ''}`}
                                    onClick={() => setPromoUppercaseTitle((prev) => !prev)}
                                  >
                                    {promoUppercaseTitle ? 'Titulo em caixa alta' : 'Titulo normal'}
                                  </button>
                                  <button
                                    type="button"
                                    className={`students-promo-option${promoFrame ? ' is-active' : ''}`}
                                    onClick={() => setPromoFrame((prev) => !prev)}
                                  >
                                    {promoFrame ? 'Moldura ativa' : 'Moldura desativada'}
                                  </button>
                                </div>
                              </>
                            )}
                            <div className="students-promo-buttons">
                              <button
                                className="button"
                                type="button"
                                onClick={handleDownloadPromo}
                                disabled={!promoImageUrl || promoLoading}
                              >
                                {promoLoading ? 'Gerando arte...' : 'Baixar arte PNG'}
                              </button>
                              {isAdminInstagramMode && (
                                <button className="button secondary" type="button" onClick={handleRandomizeAdminVisual}>
                                  Gerar novo visual
                                </button>
                              )}
                              <button
                                className="button secondary"
                                type="button"
                                onClick={() => applyPromoThemeColors(promoTheme)}
                              >
                                Restaurar cores do tema
                              </button>
                            </div>
                          </div>
                          <div className={isAdminInstagramMode ? 'students-promo-stage' : ''}>
                            {renderPromoPreview('is-sheet')}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="students-invite-code">
                {isAdminInstagramMode ? (
                  <>
                    <span>Studio criativo</span>
                    <strong>Post geral</strong>
                    <div className="students-invite-metrics">
                      <span>Canal principal</span>
                      <strong>Instagram</strong>
                    </div>
                    <p className="subtle" style={{ marginTop: 10 }}>
                      Sem convite/link. Use essa area para posts gerais da marca.
                    </p>
                  </>
                ) : (
                  <>
                    <span>Seu codigo</span>
                    <strong>{personalCode || '--'}</strong>
                    <div className="students-invite-metrics">
                      <span>Entraram pelo link</span>
                      <strong>{personalCode ? inviteStudents.length : '--'}</strong>
                    </div>
                    {!personalCode && (
                      <Link href="/personal/change-code" className="students-invite-link">
                        Atualizar codigo
                      </Link>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
          {!isAdminInstagramMode && (
            <>
              <div className="portal-card students-overview">
            <div className="students-overview-head">
              <div className="students-overview-title">
                <p className="pill">Base de alunos</p>
                <h3>{isAdmin ? 'Visao geral de usuarios' : 'Seu ecossistema de alunos'}</h3>
                <p className="subtle">
                  {isAdmin
                    ? 'Acompanhe perfis, acessos e distribuicao do sistema.'
                    : 'Organize relacoes, treinos e conversas em um painel unico.'}
                </p>
              </div>
              <div className="students-search">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar aluno por nome ou email"
                />
                {query && (
                  <button type="button" className="students-clear" onClick={() => setQuery('')}>
                    Limpar
                  </button>
                )}
              </div>
            </div>
            <div className="students-overview-metrics">
              <div className="students-overview-metric">
                <span>Total</span>
                <strong>{studentsSummary.total}</strong>
                <small>{isAdmin ? 'usuarios' : 'alunos'}</small>
              </div>
              {isPersonal ? (
                <>
                  <div className="students-overview-metric is-positive">
                    <span>Ativos</span>
                    <strong>{studentsSummary.ativos}</strong>
                    <small>em acompanhamento</small>
                  </div>
                  <div className="students-overview-metric is-warning">
                    <span>Inativos</span>
                    <strong>{studentsSummary.inativos}</strong>
                    <small>precisam de retorno</small>
                  </div>
                </>
              ) : (
                <>
                  <div className="students-overview-metric">
                    <span>Personals</span>
                    <strong>{studentsSummary.personals}</strong>
                    <small>contas profissionais</small>
                  </div>
                  <div className="students-overview-metric">
                    <span>Alunos</span>
                    <strong>{studentsSummary.alunos}</strong>
                    <small>usuarios finais</small>
                  </div>
                </>
              )}
            </div>
          </div>
              {(actionMessage || actionError) && (
                <div className="students-action-feedback">
                  <span className={actionError ? 'is-error' : ''}>{actionError || actionMessage}</span>
                </div>
              )}
              {loading ? (
                <div className="card">
                  <p className="subtle">Carregando...</p>
                </div>
              ) : filteredCards.length ? (
                <div className="students-grid">
              {filteredCards.map((student) => {
                const roleLabel = student.role === 'usuario' ? 'aluno' : student.role;
                return (
                  <div
                    key={student.id}
                    className="students-card"
                    role="button"
                    tabIndex={0}
                    onClick={() => router.push(`/students/${student.id}`)}
                    onKeyDown={(event) => handleCardKeyDown(event, student.id)}
                  >
                    <div className="students-card-head">
                      {renderStudentAvatar(student)}
                      <div className="students-card-identity">
                        <div className="students-card-name-row">
                          <strong>{student.name}</strong>
                          {student.status && (
                            <span className={`students-status is-${student.status}`}>
                              {student.status}
                            </span>
                          )}
                          {roleLabel && (
                            <span className={`students-status is-${roleLabel}`}>
                              {roleLabel}
                            </span>
                          )}
                        </div>
                        <span className="students-card-email">
                          {student.email || 'Email nao informado'}
                        </span>
                      </div>
                    </div>
                    <div className="students-card-metrics">
                      <div>
                        <span>{isAdmin ? 'Criado em' : 'Desde'}</span>
                        <strong>{formatDate(student.createdAt)}</strong>
                      </div>
                      <div>
                        <span>{isAdmin ? 'Perfil' : 'Ultimo treino'}</span>
                        <strong>{isAdmin ? roleLabel || '-' : formatDate(student.lastActive)}</strong>
                      </div>
                      {student.codigoAcademia && (
                        <div>
                          <span>{student.vinculadoPorAcademia ? 'Academia' : 'Codigo academia'}</span>
                          <strong>{student.codigoAcademia}</strong>
                        </div>
                      )}
                    </div>
                    <div className="students-card-actions-row">
                      <div className="students-card-actions">
                        <Link
                          href={`/students/${student.id}`}
                          className="students-action"
                          onClick={(event) => {
                            event.stopPropagation();
                            setOpenActionId(null);
                          }}
                        >
                          Perfil
                        </Link>
                        {isPersonal && (
                          <>
                            <Link
                              href={`/workouts?studentId=${student.id}`}
                              className="students-action"
                              onClick={(event) => {
                                event.stopPropagation();
                                setOpenActionId(null);
                              }}
                            >
                              Treinos
                            </Link>
                            <button
                              type="button"
                              className="students-action is-primary"
                              onClick={(event) => {
                                event.stopPropagation();
                                setOpenActionId(null);
                                handleOpenChat(student);
                              }}
                            >
                              Chat
                            </button>
                          </>
                        )}
                      </div>
                      {isPersonal && (
                        <div
                          className="students-card-actions-menu"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <button
                            type="button"
                            className="students-action is-ghost"
                            onClick={() => toggleActionMenu(student.id)}
                          >
                            Acoes
                          </button>
                          {openActionId === student.id && (
                            <div className="students-card-popover">
                              <button
                                type="button"
                                className={`students-action is-compact ${
                                  student.status?.toLowerCase() === 'inativo' ? 'is-success' : 'is-warning'
                                }`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setOpenActionId(null);
                                  handleToggleStatus(student);
                                }}
                                disabled={actionId === student.id}
                              >
                                {actionId === student.id
                                  ? 'Salvando...'
                                  : student.status?.toLowerCase() === 'inativo'
                                  ? 'Ativar'
                                  : 'Desativar'}
                              </button>
                              <button
                                type="button"
                                className="students-action is-compact is-danger-link"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setOpenActionId(null);
                                  handleRemoveStudent(student);
                                }}
                                disabled={actionId === student.id}
                              >
                                Excluir
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
                </div>
              ) : (
                <div className="card">
                  <p className="subtle">Nenhum aluno encontrado.</p>
                </div>
              )}
            </>
          )}
        </>
      )}
    </PageShell>
  );
}

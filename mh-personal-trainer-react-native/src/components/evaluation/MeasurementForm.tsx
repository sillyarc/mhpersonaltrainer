import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { Input } from '../common/Input';
import { spacing, borderRadius } from '../../theme';
import { Circumferences, BodyComposition } from '../../types/evaluation';
import { calculateIMC, getIMCClassification, calculateBodyComposition } from '../../services/evaluations';

interface MeasurementFormProps {
  peso?: number;
  altura?: number;
  idade?: number;
  sexo?: 'masculino' | 'feminino';
  circunferencias?: Circumferences;
  onChangePeso?: (value: number) => void;
  onChangeAltura?: (value: number) => void;
  onChangeCircunferencias?: (value: Circumferences) => void;
  onBodyCompositionChange?: (composition: BodyComposition) => void;
  readOnly?: boolean;
}

const sanitizeNumericInput = (value: string) => value.replace(/[^0-9.,]/g, '');

const parseNumericInput = (value: string) => {
  const sanitized = sanitizeNumericInput(value);
  if (!sanitized) return 0;
  const normalized = sanitized.replace(',', '.');
  const parsed = parseFloat(normalized);
  return Number.isNaN(parsed) ? 0 : parsed;
};

export function MeasurementForm({
  peso = 0,
  altura = 0,
  idade = 30,
  sexo = 'masculino',
  circunferencias = {},
  onChangePeso,
  onChangeAltura,
  onChangeCircunferencias,
  onBodyCompositionChange,
  readOnly = false,
}: MeasurementFormProps) {
  const { colors } = useTheme();
  const [localPeso, setLocalPeso] = useState(peso.toString());
  const [localAltura, setLocalAltura] = useState(altura.toString());
  const [localCircunferencias, setLocalCircunferencias] = useState<Record<string, string>>({});

  useEffect(() => {
    setLocalPeso(peso.toString());
    setLocalAltura(altura.toString());
  }, [peso, altura]);

  useEffect(() => {
    const stringCircunferencias: Record<string, string> = {};
    Object.entries(circunferencias).forEach(([key, value]) => {
      stringCircunferencias[key] = value?.toString() || '';
    });
    setLocalCircunferencias(stringCircunferencias);
  }, [circunferencias]);

  const handlePesoChange = (value: string) => {
    const sanitized = sanitizeNumericInput(value);
    setLocalPeso(sanitized);
    const numValue = parseNumericInput(sanitized);
    onChangePeso?.(numValue);
    updateBodyComposition(numValue, parseNumericInput(localAltura));
  };

  const handleAlturaChange = (value: string) => {
    const sanitized = sanitizeNumericInput(value);
    setLocalAltura(sanitized);
    const numValue = parseNumericInput(sanitized);
    onChangeAltura?.(numValue);
    updateBodyComposition(parseNumericInput(localPeso), numValue);
  };

  const handleCircunferenciaChange = (key: keyof Circumferences, value: string) => {
    const sanitized = sanitizeNumericInput(value);
    const newCircunferencias = { ...localCircunferencias, [key]: sanitized };
    setLocalCircunferencias(newCircunferencias);
    
    const numericCircunferencias: Circumferences = {};
    Object.entries(newCircunferencias).forEach(([k, v]) => {
      const numValue = parseNumericInput(v);
      if (numValue > 0) {
        (numericCircunferencias as any)[k] = numValue;
      }
    });
    onChangeCircunferencias?.(numericCircunferencias);
  };

  const updateBodyComposition = (pesoValue: number, alturaValue: number) => {
    if (pesoValue > 0 && alturaValue > 0 && onBodyCompositionChange) {
      const composition = calculateBodyComposition(pesoValue, alturaValue, idade, sexo);
      onBodyCompositionChange(composition);
    }
  };

  const imc = calculateIMC(parseNumericInput(localPeso), parseNumericInput(localAltura));
  const imcInfo = getIMCClassification(imc);

  const circumferenciaFields: { key: keyof Circumferences; label: string }[] = [
    { key: 'pescoco', label: 'Pescoco' },
    { key: 'ombro', label: 'Ombro' },
    { key: 'torax', label: 'Torax' },
    { key: 'cintura', label: 'Cintura' },
    { key: 'abdominal', label: 'Abdomen' },
    { key: 'quadril', label: 'Quadril' },
    { key: 'bracoDireito', label: 'Braco Direito' },
    { key: 'bracoEsquerdo', label: 'Braco Esquerdo' },
    { key: 'antebracoDireito', label: 'Antebraco Direito' },
    { key: 'antebracoEsquerdo', label: 'Antebraco Esquerdo' },
    { key: 'punhoDireito', label: 'Punho Direito' },
    { key: 'punhoEsquerdo', label: 'Punho Esquerdo' },
    { key: 'coxaDireita', label: 'Coxa Direita' },
    { key: 'coxaEsquerda', label: 'Coxa Esquerda' },
    { key: 'panturrilhaDireita', label: 'Panturrilha Direita' },
    { key: 'panturrilhaEsquerda', label: 'Panturrilha Esquerda' },
  ];

  return (
    <View style={styles.container}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        Medidas Basicas
      </Text>
      
      <View style={styles.row}>
        <View style={styles.field}>
          <Input
            label="Peso (kg)"
            placeholder="70"
            value={localPeso}
            onChangeText={handlePesoChange}
            keyboardType="decimal-pad"
            disabled={readOnly}
          />
        </View>
        <View style={styles.field}>
          <Input
            label="Altura (cm)"
            placeholder="170"
            value={localAltura}
            onChangeText={handleAlturaChange}
            keyboardType="decimal-pad"
            disabled={readOnly}
          />
        </View>
      </View>

      {imc > 0 && (
        <View style={[styles.imcCard, { backgroundColor: colors.surface }]}>
          <View style={styles.imcHeader}>
            <Text style={[styles.imcLabel, { color: colors.textSecondary }]}>IMC</Text>
            <Text style={[styles.imcValue, { color: colors.text }]}>{imc}</Text>
          </View>
          <View style={[styles.imcBadge, { backgroundColor: imcInfo.color + '20' }]}>
            <Text style={[styles.imcClassification, { color: imcInfo.color }]}>
              {imcInfo.classification}
            </Text>
          </View>
        </View>
      )}

      <Text style={[styles.sectionTitle, { color: colors.text, marginTop: spacing.xl }]}>
        Circunferencias (cm)
      </Text>

      {circumferenciaFields.map((field, index) => {
        const isEven = index % 2 === 0;
        const nextField = circumferenciaFields[index + 1];
        
        if (!isEven) return null;
        
        return (
          <View key={field.key} style={styles.row}>
            <View style={styles.field}>
              <Input
                label={field.label}
                placeholder="0"
                value={localCircunferencias[field.key] || ''}
                onChangeText={(value) => handleCircunferenciaChange(field.key, value)}
                keyboardType="decimal-pad"
                disabled={readOnly}
              />
            </View>
            {nextField && (
              <View style={styles.field}>
                <Input
                  label={nextField.label}
                  placeholder="0"
                  value={localCircunferencias[nextField.key] || ''}
                  onChangeText={(value) => handleCircunferenciaChange(nextField.key, value)}
                  keyboardType="decimal-pad"
                  disabled={readOnly}
                />
              </View>
            )}
            {!nextField && <View style={styles.field} />}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  field: {
    flex: 1,
  },
  imcCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.base,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
  },
  imcHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  imcLabel: {
    fontSize: 14,
  },
  imcValue: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  imcBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  imcClassification: {
    fontSize: 12,
    fontWeight: '600',
  },
});

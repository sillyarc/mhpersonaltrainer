import React, { useState } from 'react';
import {
  Modal,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useTheme } from '../../hooks/useTheme';
import { spacing, borderRadius } from '../../theme';
import { Input } from './Input';
import { Button } from './Button';
import { formatDateString } from '../../utils/date';

interface DateInputProps {
  label?: string;
  placeholder?: string;
  value?: Date | null;
  onChange: (date: Date) => void;
  minimumDate?: Date;
  maximumDate?: Date;
  disabled?: boolean;
}

export function DateInput({
  label,
  placeholder = 'DD/MM/AAAA',
  value,
  onChange,
  minimumDate,
  maximumDate,
  disabled = false,
}: DateInputProps) {
  const { colors, isDark } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(value ?? new Date());

  const formattedValue = formatDateString(value ?? null);

  const openPicker = () => {
    if (disabled) return;
    setTempDate(value ?? new Date());
    setIsOpen(true);
  };

  const handleAndroidChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    setIsOpen(false);
    if (event.type === 'set' && selectedDate) {
      onChange(selectedDate);
    }
  };

  const handleIosChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    if (selectedDate) {
      setTempDate(selectedDate);
    }
  };

  const handleConfirm = () => {
    onChange(tempDate);
    setIsOpen(false);
  };

  return (
    <>
      <Input
        label={label}
        placeholder={placeholder}
        value={formattedValue}
        onChangeText={() => {}}
        icon="calendar-outline"
        readOnly
        disabled={disabled}
        onPressIn={openPicker}
      />

      {isOpen && Platform.OS === 'android' && (
        <DateTimePicker
          value={value ?? new Date()}
          mode="date"
          display="default"
          onChange={handleAndroidChange}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
        />
      )}

      {isOpen && Platform.OS === 'ios' && (
        <Modal
          animationType="fade"
          transparent
          visible
          onRequestClose={() => setIsOpen(false)}
        >
          <View style={styles.backdrop}>
            <View style={[styles.modal, { backgroundColor: colors.card }]}>
              <DateTimePicker
                value={tempDate}
                mode="date"
                display="spinner"
                onChange={handleIosChange}
                minimumDate={minimumDate}
                maximumDate={maximumDate}
                themeVariant={isDark ? 'dark' : 'light'}
                textColor={colors.text}
              />
              <View style={styles.actions}>
                <Button
                  title="Cancelar"
                  variant="outline"
                  size="small"
                  onPress={() => setIsOpen(false)}
                  style={styles.actionButton}
                />
                <Button
                  title="Confirmar"
                  size="small"
                  onPress={handleConfirm}
                  style={styles.actionButton}
                />
              </View>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: spacing.base,
  },
  modal: {
    borderRadius: borderRadius.lg,
    padding: spacing.base,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
});

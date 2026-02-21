import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { getDateKey } from '../../utils/date';
import { spacing, borderRadius } from '../../theme';

interface CalendarDayProps {
  date: Date;
  isSelected: boolean;
  isToday: boolean;
  hasAppointments: boolean;
  appointmentCount?: number;
  onPress: () => void;
  disabled?: boolean;
}

export function CalendarDay({
  date,
  isSelected,
  isToday,
  hasAppointments,
  appointmentCount = 0,
  onPress,
  disabled = false,
}: CalendarDayProps) {
  const { colors } = useTheme();

  const dayNumber = date.getDate();
  const dayName = date.toLocaleDateString('pt-BR', { weekday: 'short' }).substring(0, 3);

  const getBackgroundColor = () => {
    if (isSelected) return colors.primary;
    if (isToday) return colors.primary + '20';
    return 'transparent';
  };

  const getTextColor = () => {
    if (disabled) return colors.textMuted;
    if (isSelected) return '#ffffff';
    if (isToday) return colors.primary;
    return colors.text;
  };

  return (
    <TouchableOpacity
      style={[
        styles.container,
        { backgroundColor: getBackgroundColor() },
        isSelected && styles.selected,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <Text style={[styles.dayName, { color: getTextColor() }]}>{dayName}</Text>
      <Text style={[styles.dayNumber, { color: getTextColor() }]}>{dayNumber}</Text>
      
      {hasAppointments && (
        <View style={styles.dotsContainer}>
          {appointmentCount <= 3 ? (
            Array.from({ length: Math.min(appointmentCount, 3) }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  {
                    backgroundColor: isSelected ? '#ffffff' : colors.primary,
                  },
                ]}
              />
            ))
          ) : (
            <View
              style={[
                styles.countBadge,
                { backgroundColor: isSelected ? '#ffffff' : colors.primary },
              ]}
            >
              <Text
                style={[
                  styles.countText,
                  { color: isSelected ? colors.primary : '#ffffff' },
                ]}
              >
                {appointmentCount}
              </Text>
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

interface CalendarWeekViewProps {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  appointmentCounts?: Record<string, number>;
}

export function CalendarWeekView({
  selectedDate,
  onSelectDate,
  appointmentCounts = {},
}: CalendarWeekViewProps) {
  const { colors } = useTheme();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const getWeekDays = () => {
    const days: Date[] = [];
    const currentDay = new Date(selectedDate);
    const dayOfWeek = currentDay.getDay();
    
    currentDay.setDate(currentDay.getDate() - dayOfWeek);
    
    for (let i = 0; i < 7; i++) {
      days.push(new Date(currentDay));
      currentDay.setDate(currentDay.getDate() + 1);
    }
    
    return days;
  };

  const weekDays = getWeekDays();

  const isSameDay = (date1: Date, date2: Date) => {
    return (
      date1.getDate() === date2.getDate() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getFullYear() === date2.getFullYear()
    );
  };

  return (
    <View style={[styles.weekContainer, { backgroundColor: colors.surface }]}>
      {weekDays.map((day) => {
        const dateKey = getDateKey(day);
        const count = appointmentCounts[dateKey] || 0;
        
        return (
          <CalendarDay
            key={dateKey}
            date={day}
            isSelected={isSameDay(day, selectedDate)}
            isToday={isSameDay(day, today)}
            hasAppointments={count > 0}
            appointmentCount={count}
            onPress={() => onSelectDate(day)}
          />
        );
      })}
    </View>
  );
}

interface CalendarMonthViewProps {
  selectedDate: Date;
  currentMonth: Date;
  onSelectDate: (date: Date) => void;
  appointmentCounts?: Record<string, number>;
}

export function CalendarMonthView({
  selectedDate,
  currentMonth,
  onSelectDate,
  appointmentCounts = {},
}: CalendarMonthViewProps) {
  const { colors } = useTheme();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const getMonthDays = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    const days: (Date | null)[] = [];
    
    const startPadding = firstDay.getDay();
    for (let i = 0; i < startPadding; i++) {
      days.push(null);
    }
    
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(new Date(year, month, i));
    }
    
    return days;
  };

  const monthDays = getMonthDays();
  const weekDayHeaders = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  const isSameDay = (date1: Date, date2: Date) => {
    return (
      date1.getDate() === date2.getDate() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getFullYear() === date2.getFullYear()
    );
  };

  return (
    <View style={[styles.monthContainer, { backgroundColor: colors.surface }]}>
      <View style={styles.weekDayHeaders}>
        {weekDayHeaders.map((day) => (
          <Text key={day} style={[styles.weekDayHeader, { color: colors.textSecondary }]}>
            {day}
          </Text>
        ))}
      </View>
      
      <View style={styles.daysGrid}>
        {monthDays.map((day, index) => {
          if (!day) {
            return <View key={`empty-${index}`} style={styles.emptyDay} />;
          }
          
          const dateKey = getDateKey(day);
          const count = appointmentCounts[dateKey] || 0;
          
          return (
            <View key={dateKey} style={styles.dayCell}>
              <CalendarDay
                date={day}
                isSelected={isSameDay(day, selectedDate)}
                isToday={isSameDay(day, today)}
                hasAppointments={count > 0}
                appointmentCount={count}
                onPress={() => onSelectDate(day)}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    minWidth: 44,
  },
  selected: {
    shadowColor: '#4361ee',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  dayName: {
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  dayNumber: {
    fontSize: 18,
    fontWeight: '600',
  },
  dotsContainer: {
    flexDirection: 'row',
    marginTop: spacing.xs,
    gap: 3,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  countBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  countText: {
    fontSize: 10,
    fontWeight: '600',
  },
  weekContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.lg,
  },
  monthContainer: {
    padding: spacing.base,
    borderRadius: borderRadius.lg,
  },
  weekDayHeaders: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: spacing.sm,
  },
  weekDayHeader: {
    fontSize: 12,
    fontWeight: '500',
    width: '14.28%',
    textAlign: 'center',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  emptyDay: {
    width: '14.28%',
    height: 44,
  },
});

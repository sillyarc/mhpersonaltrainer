import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
  Platform,
} from 'react-native';
import { useAlertStore, AlertButton } from '../../store/alertStore';
import { useTheme } from '../../hooks/useTheme';
import { spacing, borderRadius } from '../../theme';

const isAndroid = Platform.OS === 'android';

export function AppAlertHost() {
  const { colors } = useTheme();
  const { visible, title, message, buttons, options, hide } = useAlertStore();

  if (!isAndroid || !visible) {
    return null;
  }

  const cancelable = options?.cancelable !== false;
  const actions = buttons?.length ? buttons : [{ text: 'OK', style: 'default' }];
  const cancelActions = actions.filter((button) => button.style === 'cancel');
  const mainActions = actions.filter((button) => button.style !== 'cancel');
  const useStackedLayout = mainActions.length > 3 || actions.length > 4;

  const handleClose = () => {
    hide();
  };

  const handlePress = (button: AlertButton) => {
    hide();
    if (button.onPress) {
      button.onPress();
    }
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={cancelable ? handleClose : undefined}
    >
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <TouchableWithoutFeedback onPress={cancelable ? handleClose : undefined}>
          <View style={styles.backdrop}>
            <TouchableWithoutFeedback>
              <View style={[styles.dialog, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.title, { color: colors.text }]}>
                  {title}
                </Text>
                {message ? (
                  <ScrollView style={styles.messageWrapper} contentContainerStyle={styles.messageContent}>
                    <Text style={[styles.message, { color: colors.textSecondary }]}>
                      {message}
                    </Text>
                  </ScrollView>
                ) : null}
                <View style={[styles.actions, useStackedLayout ? styles.actionsStacked : undefined]}>
                  {mainActions.map((button, index) => {
                    const label = button.text || 'OK';
                    const isDestructive = button.style === 'destructive';
                    const backgroundColor = isDestructive ? colors.error : colors.primary;
                    const borderColor = 'transparent';
                    return (
                      <TouchableOpacity
                        key={`${label}-${index}`}
                        style={[
                          styles.button,
                          useStackedLayout ? styles.buttonFull : undefined,
                          { backgroundColor, borderColor },
                          !useStackedLayout && mainActions.length === 1 ? styles.singleButton : undefined,
                        ]}
                        onPress={() => handlePress(button)}
                      >
                        <Text
                          style={[
                            styles.buttonText,
                            useStackedLayout ? styles.buttonTextStacked : undefined,
                            { color: '#fff' },
                          ]}
                        >
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  {cancelActions.length > 0
                    ? cancelActions.map((button, index) => {
                        const label = button.text || 'Cancelar';
                        return (
                          <TouchableOpacity
                            key={`cancel-${label}-${index}`}
                            style={[
                              styles.button,
                              useStackedLayout ? styles.buttonFull : undefined,
                              { backgroundColor: colors.surface, borderColor: colors.border },
                            ]}
                            onPress={() => handlePress(button)}
                          >
                            <Text
                              style={[
                                styles.buttonText,
                                useStackedLayout ? styles.buttonTextStacked : undefined,
                                { color: colors.text },
                              ]}
                            >
                              {label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })
                    : null}
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  backdrop: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialog: {
    width: '100%',
    maxWidth: 420,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderWidth: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  messageWrapper: {
    maxHeight: 200,
    marginTop: spacing.sm,
  },
  messageContent: {
    paddingBottom: spacing.sm,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionsStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  button: {
    minWidth: 92,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonFull: {
    width: '100%',
  },
  singleButton: {
    minWidth: 140,
  },
  buttonText: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  buttonTextStacked: {
    textTransform: 'none',
    fontSize: 14,
  },
});

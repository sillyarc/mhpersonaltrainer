import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
} from 'react-native';
import { showAlert } from '@utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { collection, getDocs, orderBy, query, limit } from 'firebase/firestore';
import { db } from '../../src/services/firebase';
import { Card, Loading } from '../../src/components/common';
import { useTheme } from '../../src/hooks/useTheme';
import { spacing, borderRadius } from '../../src/theme';

type RoleFilter = 'all' | 'admin' | 'personal' | 'aluno';
type AdminUserRole = Exclude<RoleFilter, 'all'>;

interface AdminUserItem {
  id: string;
  name: string;
  email: string;
  role: AdminUserRole;
  codigoPersonal?: number | string;
  assinatura?: boolean;
  acessoSuspenso?: boolean;
  createdAt?: Date;
}

export default function AdminUsersScreen() {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [queryText, setQueryText] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const usersQuery = query(
        collection(db, 'users'),
        orderBy('created_time', 'desc'),
        limit(200)
      );
      const snapshot = await getDocs(usersQuery);
      const loaded = snapshot.docs.map((doc) => {
        const data = doc.data();
        const role: AdminUserRole = data.admin
          ? 'admin'
          : data.professorAccount
          ? 'personal'
          : 'aluno';
        return {
          id: doc.id,
          name: data.display_name || 'Usuario',
          email: data.email || '',
          role,
          codigoPersonal: data.codigoPersonal,
          assinatura: data.assinatura,
          acessoSuspenso: data.acessoSuspenso,
          createdAt: data.created_time?.toDate(),
        };
      });
      setUsers(loaded);
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = useMemo(() => {
    const normalized = queryText.trim().toLowerCase();
    return users.filter((user) => {
      const matchRole = roleFilter === 'all' || user.role === roleFilter;
      const matchText =
        !normalized ||
        user.name.toLowerCase().includes(normalized) ||
        user.email.toLowerCase().includes(normalized);
      return matchRole && matchText;
    });
  }, [users, roleFilter, queryText]);

  const handleViewProfile = (item: AdminUserItem) => {
    if (item.role === 'aluno') {
      router.push(`/admin/student/${item.id}` as any);
      return;
    }

    if (item.role === 'personal') {
      const codigoPersonal = String(item.codigoPersonal || '').trim();
      router.push(
        codigoPersonal
          ? ({
              pathname: '/personal/profile',
              params: { code: codigoPersonal },
            } as any)
          : ({
              pathname: '/personal/profile',
              params: { uid: item.id },
            } as any)
      );
      return;
    }

    showAlert(
      'Perfil indisponivel',
      'Ainda nao existe uma tela de visualizacao para perfis admin.'
    );
  };

  const renderUser = ({ item }: { item: AdminUserItem }) => (
    <Card style={styles.userCard} onPress={() => handleViewProfile(item)}>
      <View style={styles.userRow}>
        <View style={styles.userInfo}>
          <Text style={[styles.userName, { color: colors.text }]}>{item.name}</Text>
          <Text style={[styles.userEmail, { color: colors.textSecondary }]}>{item.email}</Text>
        </View>
        <View style={styles.badges}>
          <View style={[styles.badge, { backgroundColor: colors.surface }]}>
            <Text style={[styles.badgeText, { color: colors.textSecondary }]}>{item.role}</Text>
          </View>
          {item.acessoSuspenso && (
            <View style={[styles.badge, { backgroundColor: colors.error + '20' }]}>
              <Text style={[styles.badgeText, { color: colors.error }]}>suspenso</Text>
            </View>
          )}
        </View>
      </View>
      <View style={styles.profileActionRow}>
        <Ionicons name="open-outline" size={14} color={colors.primary} />
        <Text style={[styles.profileActionText, { color: colors.primary }]}>Ver perfil</Text>
      </View>
    </Card>
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Loading />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Todos os usuarios</Text>
        <TouchableOpacity onPress={loadUsers}>
          <Ionicons name="refresh" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <View style={[styles.searchBox, { backgroundColor: colors.surface }]}>
          <Ionicons name="search" size={18} color={colors.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Buscar usuarios..."
            placeholderTextColor={colors.textSecondary}
            value={queryText}
            onChangeText={setQueryText}
          />
          {queryText.length > 0 && (
            <TouchableOpacity onPress={() => setQueryText('')}>
              <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.filtersRow}>
        {(['all', 'admin', 'personal', 'aluno'] as RoleFilter[]).map((filter) => (
          <TouchableOpacity
            key={filter}
            style={[
              styles.filterChip,
              {
                backgroundColor: roleFilter === filter ? colors.primary : colors.surface,
              },
            ]}
            onPress={() => setRoleFilter(filter)}
          >
            <Text
              style={[
                styles.filterText,
                { color: roleFilter === filter ? '#fff' : colors.textSecondary },
              ]}
            >
              {filter === 'all' ? 'todos' : filter}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {filteredUsers.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="people-outline" size={56} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Nenhum usuario encontrado.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredUsers}
          renderItem={renderUser}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.base,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  searchContainer: {
    paddingHorizontal: spacing.base,
    marginBottom: spacing.sm,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
  },
  filtersRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    marginBottom: spacing.base,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  filterText: {
    fontSize: 12,
    textTransform: 'capitalize',
  },
  list: {
    padding: spacing.base,
    paddingBottom: spacing['4xl'],
    gap: spacing.sm,
  },
  userCard: {
    marginBottom: spacing.sm,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 15,
    fontWeight: '600',
  },
  userEmail: {
    fontSize: 12,
    marginTop: spacing.xs,
  },
  badges: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  profileActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  profileActionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  badgeText: {
    fontSize: 11,
    textTransform: 'capitalize',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  emptyText: {
    fontSize: 14,
    marginTop: spacing.md,
    textAlign: 'center',
  },
});

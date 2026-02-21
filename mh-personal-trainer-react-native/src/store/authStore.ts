import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, UserRole, AuthState } from '../types/user';

interface AuthStore extends AuthState {
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  setRole: (role: UserRole | null) => void;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      role: null,

      setUser: (user) => {
        let role: UserRole | null = null;
        if (user) {
          if (user.admin) {
            role = 'admin';
          } else if (user.professorAccount) {
            role = 'professor';
          } else {
            role = 'aluno';
          }
        }
        set({ 
          user, 
          isAuthenticated: !!user,
          role,
          isLoading: false 
        });
      },

      setLoading: (isLoading) => set({ isLoading }),

      setRole: (role) => set({ role }),

      logout: () => set({ 
        user: null, 
        isAuthenticated: false, 
        role: null,
        isLoading: false 
      }),

      updateUser: (updates) => {
        const currentUser = get().user;
        if (currentUser) {
          set({ user: { ...currentUser, ...updates } });
        }
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ 
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        role: state.role,
      }),
    }
  )
);

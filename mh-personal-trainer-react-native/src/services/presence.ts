import type { AppStateStatus } from 'react-native';
import { Platform } from 'react-native';
import {
  onDisconnect,
  onValue,
  ref,
  serverTimestamp,
  set,
  type Unsubscribe,
} from 'firebase/database';
import type { User } from '../types/user';
import { getFirebaseDatabase } from './firebase';
import { recordMonitoringError } from './monitoring';

type PresenceUser = Pick<User, 'uid' | 'displayName' | 'admin' | 'professorAccount'>;
type PresenceState = 'online' | 'away' | 'background' | 'offline';

let currentUser: PresenceUser | null = null;
let connectionUnsubscribe: Unsubscribe | null = null;

const resolveRole = (user?: PresenceUser | null) => {
  if (!user) return 'guest';
  if (user.admin) return 'admin';
  if (user.professorAccount) return 'professor';
  return 'aluno';
};

const buildPresencePayload = (user: PresenceUser, state: PresenceState) => ({
  uid: user.uid,
  displayName: user.displayName || 'Usuario',
  role: resolveRole(user),
  state,
  platform: Platform.OS,
  app: 'mh-personal-trainer-react-native',
  last_changed: serverTimestamp(),
});

const setPresencePayload = async (user: PresenceUser, state: PresenceState) => {
  const database = getFirebaseDatabase();
  await set(ref(database, `status/${user.uid}`), buildPresencePayload(user, state));
};

export async function attachPresence(user: PresenceUser): Promise<void> {
  if (!user?.uid) {
    return;
  }

  if (currentUser?.uid && currentUser.uid !== user.uid) {
    await detachPresence();
  }

  currentUser = user;
  connectionUnsubscribe?.();

  const database = getFirebaseDatabase();
  const statusRef = ref(database, `status/${user.uid}`);
  const connectedRef = ref(database, '.info/connected');
  const onlinePayload = buildPresencePayload(user, 'online');
  const offlinePayload = buildPresencePayload(user, 'offline');

  connectionUnsubscribe = onValue(connectedRef, async (snapshot) => {
    if (snapshot.val() !== true) {
      return;
    }

    try {
      await onDisconnect(statusRef).set(offlinePayload);
      await set(statusRef, onlinePayload);
    } catch (error) {
      await recordMonitoringError(error, {
        area: 'presence_attach',
        attributes: { uid: user.uid, platform: Platform.OS },
      });
    }
  });
}

export async function updatePresenceAppState(nextState: AppStateStatus): Promise<void> {
  if (!currentUser?.uid) {
    return;
  }

  const mappedState: PresenceState =
    nextState === 'active'
      ? 'online'
      : nextState === 'background'
        ? 'background'
        : 'away';

  try {
    await setPresencePayload(currentUser, mappedState);
  } catch (error) {
    await recordMonitoringError(error, {
      area: 'presence_app_state',
      attributes: { uid: currentUser.uid, app_state: mappedState },
    });
  }
}

export async function detachPresence(): Promise<void> {
  const previousUser = currentUser;
  currentUser = null;

  connectionUnsubscribe?.();
  connectionUnsubscribe = null;

  if (!previousUser?.uid) {
    return;
  }

  const database = getFirebaseDatabase();
  const statusRef = ref(database, `status/${previousUser.uid}`);

  try {
    await onDisconnect(statusRef).cancel();
    await set(statusRef, buildPresencePayload(previousUser, 'offline'));
  } catch (error) {
    await recordMonitoringError(error, {
      area: 'presence_detach',
      attributes: { uid: previousUser.uid },
    });
  }
}

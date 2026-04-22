'use client';

import { onDisconnect, onValue, ref, serverTimestamp, set, type Unsubscribe } from 'firebase/database';
import type { User, UserRole } from '../types/user';
import { getFirebaseDatabase } from './firebase';
import { logWebMonitoringError } from './monitoring';

type PresenceUser = Pick<User, 'uid' | 'displayName'>;
type PresenceState = 'online' | 'away' | 'offline';

let currentPresence: { user: PresenceUser; role: UserRole | null } | null = null;
let connectionUnsubscribe: Unsubscribe | null = null;

const buildPresencePayload = (
  user: PresenceUser,
  role: UserRole | null,
  state: PresenceState
) => ({
  uid: user.uid,
  displayName: user.displayName || 'Usuario',
  role: role || 'aluno',
  state,
  platform: 'web',
  app: 'mh-personal-trainer-web',
  last_changed: serverTimestamp(),
});

export async function attachWebPresence(
  user: PresenceUser,
  role: UserRole | null
): Promise<void> {
  if (!user?.uid) {
    return;
  }

  if (currentPresence?.user.uid && currentPresence.user.uid !== user.uid) {
    await detachWebPresence();
  }

  currentPresence = { user, role };
  connectionUnsubscribe?.();

  const database = getFirebaseDatabase();
  const statusRef = ref(database, `status/${user.uid}`);
  const connectedRef = ref(database, '.info/connected');
  const onlinePayload = buildPresencePayload(user, role, 'online');
  const offlinePayload = buildPresencePayload(user, role, 'offline');

  connectionUnsubscribe = onValue(connectedRef, async (snapshot) => {
    if (snapshot.val() !== true) {
      return;
    }

    try {
      await onDisconnect(statusRef).set(offlinePayload);
      await set(statusRef, onlinePayload);
    } catch (error) {
      logWebMonitoringError('presence_attach', error, { uid: user.uid });
    }
  });
}

export async function detachWebPresence(): Promise<void> {
  const previousPresence = currentPresence;
  currentPresence = null;

  connectionUnsubscribe?.();
  connectionUnsubscribe = null;

  if (!previousPresence?.user.uid) {
    return;
  }

  const database = getFirebaseDatabase();
  const statusRef = ref(database, `status/${previousPresence.user.uid}`);

  try {
    await onDisconnect(statusRef).cancel();
    await set(
      statusRef,
      buildPresencePayload(previousPresence.user, previousPresence.role, 'offline')
    );
  } catch (error) {
    logWebMonitoringError('presence_detach', error, {
      uid: previousPresence.user.uid,
    });
  }
}

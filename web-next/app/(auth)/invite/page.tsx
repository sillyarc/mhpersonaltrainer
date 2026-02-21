import { Suspense } from 'react';
import InvitePage from './ClientPage';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <InvitePage />
    </Suspense>
  );
}

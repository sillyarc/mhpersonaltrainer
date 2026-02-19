import { Suspense } from 'react';
import RegisterPersonalPage from './ClientPage';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <RegisterPersonalPage />
    </Suspense>
  );
}

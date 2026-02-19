import { Suspense } from 'react';
import LoginPage from './ClientPage';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <LoginPage />
    </Suspense>
  );
}

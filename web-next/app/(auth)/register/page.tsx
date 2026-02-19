import { Suspense } from 'react';
import RegisterPage from './ClientPage';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <RegisterPage />
    </Suspense>
  );
}

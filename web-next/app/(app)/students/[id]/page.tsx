import StudentDetailPage from './ClientPage';

export const dynamicParams = process.env.NODE_ENV !== 'production';

export async function generateStaticParams() {
  return [{ id: 'placeholder' }];
}

export default function Page({ params }: { params: { id: string } }) {
  return <StudentDetailPage params={params} />;
}

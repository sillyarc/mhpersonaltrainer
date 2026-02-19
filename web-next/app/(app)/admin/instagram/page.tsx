import { redirect } from 'next/navigation';

export default function AdminInstagramPage() {
  redirect('/students?adminStudio=1');
}

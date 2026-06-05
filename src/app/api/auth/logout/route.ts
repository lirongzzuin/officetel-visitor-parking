import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { ok } from '@/lib/api';

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (token) {
    const supabase = createServiceClient();
    await supabase.auth.admin.signOut(token, 'local');
  }
  return ok({ message: '로그아웃 완료' });
}

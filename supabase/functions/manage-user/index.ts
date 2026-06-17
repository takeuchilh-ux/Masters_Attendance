import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // リクエストユーザーの認証確認
    const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: '認証が必要です' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 本部権限チェック
    const { data: caller } = await supabaseAdmin
      .schema('masuta').from('staff')
      .select('role').eq('email', user.email).single();
    if (caller?.role !== 'admin') {
      return new Response(JSON.stringify({ error: '本部権限が必要です' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { action } = body;

    // ── アカウント作成 ──────────────────────────────────
    if (action === 'create_user') {
      const { email, password, name, office_id, role } = body;

      const { data: newUser, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error) throw error;

      // staff レコード作成（既存なら email を上書き）
      await supabaseAdmin.schema('masuta').from('staff').upsert({
        name,
        email,
        office_id: office_id || null,
        role,
        is_active: true,
      }, { onConflict: 'email', ignoreDuplicates: false });

      return new Response(JSON.stringify({ success: true, user_id: newUser.user?.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── パスワード変更 ──────────────────────────────────
    if (action === 'change_password') {
      const { target_email, new_password } = body;

      // 対象ユーザーの auth.user を email で検索
      const { data: users } = await supabaseAdmin.auth.admin.listUsers();
      const target = users?.users?.find((u) => u.email === target_email);
      if (!target) throw new Error('対象ユーザーが見つかりません');

      const { error } = await supabaseAdmin.auth.admin.updateUserById(target.id, {
        password: new_password,
      });
      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── メールアドレス変更 ──────────────────────────────
    if (action === 'change_email') {
      const { target_email, new_email } = body;

      const { data: users } = await supabaseAdmin.auth.admin.listUsers();
      const target = users?.users?.find((u) => u.email === target_email);
      if (!target) throw new Error('対象ユーザーが見つかりません');

      const { error } = await supabaseAdmin.auth.admin.updateUserById(target.id, { email: new_email });
      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── アカウント削除 ──────────────────────────────────
    if (action === 'delete_user') {
      const { target_email } = body;

      const { data: users } = await supabaseAdmin.auth.admin.listUsers();
      const target = users?.users?.find((u) => u.email === target_email);
      if (!target) throw new Error('対象ユーザーが見つかりません');

      const { error } = await supabaseAdmin.auth.admin.deleteUser(target.id);
      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: '不明なアクションです' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

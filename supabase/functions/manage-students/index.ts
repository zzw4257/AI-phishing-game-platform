Deno.serve(async (req) => {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
        'Access-Control-Max-Age': '86400',
        'Access-Control-Allow-Credentials': 'false'
    };

    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 200, headers: corsHeaders });
    }

    try {
        const { action, students } = await req.json();
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

        if (!supabaseUrl || !serviceRoleKey) {
            throw new Error('Missing Supabase configuration');
        }

        if (action === 'add_students') {
            // 批量添加学生
            const usersToAdd = students.map((s: any) => ({
                student_id: s.student_id,
                name: s.name,
                role: 'unassigned',
                virtual_email: `${s.student_id}@zju.test.cn`
            }));

            const addResponse = await fetch(`${supabaseUrl}/rest/v1/users`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify(usersToAdd)
            });

            if (!addResponse.ok) {
                const error = await addResponse.text();
                throw new Error(`Failed to add students: ${error}`);
            }

            const addedUsers = await addResponse.json();

            return new Response(JSON.stringify({ 
                data: { success: true, users: addedUsers } 
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        if (action === 'assign_roles') {
            // 获取所有未分配角色的用户
            const usersResponse = await fetch(
                `${supabaseUrl}/rest/v1/users?role=eq.unassigned&select=*`,
                {
                    headers: {
                        'Authorization': `Bearer ${serviceRoleKey}`,
                        'apikey': serviceRoleKey
                    }
                }
            );

            if (!usersResponse.ok) {
                throw new Error('Failed to fetch users');
            }

            const users = await usersResponse.json();
            const totalUsers = users.length;

            if (totalUsers === 0) {
                throw new Error('No users to assign roles');
            }

            // 按照 3:5:2 的比例分配角色 (A:B:C)
            // A组钓鱼者30%, B组普通人50%, C组监管者20%
            const aCount = Math.floor(totalUsers * 0.3);
            const bCount = Math.floor(totalUsers * 0.5);
            const cCount = totalUsers - aCount - bCount;

            // 随机打乱用户顺序
            const shuffled = users.sort(() => Math.random() - 0.5);

            const updates = [];
            
            for (let i = 0; i < totalUsers; i++) {
                let role = 'B';
                let virtualEmail = `${shuffled[i].student_id}@zju.test.cn`;
                
                if (i < aCount) {
                    role = 'A';
                } else if (i >= aCount + bCount) {
                    role = 'C';
                    virtualEmail = `${shuffled[i].student_id}@zju.gov.cn`;
                }

                updates.push({
                    id: shuffled[i].id,
                    role: role,
                    virtual_email: virtualEmail
                });
            }

            // 批量更新用户角色
            for (const update of updates) {
                await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${update.id}`, {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${serviceRoleKey}`,
                        'apikey': serviceRoleKey,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        role: update.role,
                        virtual_email: update.virtual_email
                    })
                });
            }

            // 为每个用户初始化统计数据
            const statsToCreate = updates.map(u => ({
                user_id: u.id,
                emails_sent: 0,
                emails_clicked: 0,
                emails_received: 0,
                emails_read: 0,
                suspicious_marked: 0,
                score: 0
            }));

            await fetch(`${supabaseUrl}/rest/v1/statistics`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(statsToCreate)
            });

            return new Response(JSON.stringify({ 
                data: { 
                    success: true, 
                    assigned: {
                        A: aCount,
                        B: bCount,
                        C: cCount
                    }
                } 
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        throw new Error('Invalid action');

    } catch (error) {
        console.error('Error:', error);
        return new Response(JSON.stringify({
            error: {
                code: 'OPERATION_FAILED',
                message: error.message
            }
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});

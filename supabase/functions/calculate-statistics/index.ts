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
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

        if (!supabaseUrl || !serviceRoleKey) {
            throw new Error('Missing Supabase configuration');
        }

        // 获取所有用户
        const usersResponse = await fetch(
            `${supabaseUrl}/rest/v1/users?select=*`,
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

        // 获取所有统计数据
        const statsResponse = await fetch(
            `${supabaseUrl}/rest/v1/statistics?select=*`,
            {
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey
                }
            }
        );

        if (!statsResponse.ok) {
            throw new Error('Failed to fetch statistics');
        }

        const allStats = await statsResponse.json();

        // 计算每个用户的评分
        for (const user of users) {
            const userStats = allStats.find((s: any) => s.user_id === user.id);
            if (!userStats) continue;

            let score = 0;

            if (user.role === 'A') {
                // A组: 恶意链接点击数 × 权重(10)
                score = userStats.emails_clicked * 10;
            } else if (user.role === 'B') {
                // B组: 发送邮件被阅读数 × 0.6 + 阅读他人邮件数 × 0.4
                score = userStats.emails_clicked * 0.6 + userStats.emails_read * 0.4;
            } else if (user.role === 'C') {
                // C组: 标记可疑邮件准确率 × 权重(100)
                // 准确率 = 正确标记的恶意邮件数 / 总标记数
                if (userStats.suspicious_marked > 0) {
                    // 获取该用户标记的所有邮件
                    const markedEmailsResponse = await fetch(
                        `${supabaseUrl}/rest/v1/emails?marked_by_id=eq.${user.id}&is_suspicious_marked=eq.true&select=*`,
                        {
                            headers: {
                                'Authorization': `Bearer ${serviceRoleKey}`,
                                'apikey': serviceRoleKey
                            }
                        }
                    );
                    
                    if (markedEmailsResponse.ok) {
                        const markedEmails = await markedEmailsResponse.json();
                        const correctMarks = markedEmails.filter((e: any) => e.is_malicious).length;
                        const accuracy = correctMarks / userStats.suspicious_marked;
                        score = accuracy * 100; // 准确率转换为0-100分
                    }
                } else {
                    score = 0;
                }
            }

            // 更新评分
            await fetch(`${supabaseUrl}/rest/v1/statistics?user_id=eq.${user.id}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    score: score,
                    calculated_at: new Date().toISOString()
                })
            });
        }

        // 计算A组和B组的总体胜率
        const emailsResponse = await fetch(
            `${supabaseUrl}/rest/v1/emails?select=*`,
            {
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey
                }
            }
        );

        if (!emailsResponse.ok) {
            throw new Error('Failed to fetch emails');
        }

        const emails = await emailsResponse.json();

        // A组胜率: 恶意链接点击率
        const maliciousEmails = emails.filter((e: any) => e.is_malicious);
        const clickedMalicious = maliciousEmails.filter((e: any) => e.is_clicked);
        const aGroupScore = maliciousEmails.length > 0 
            ? (clickedMalicious.length / maliciousEmails.length) 
            : 0;

        // B组胜率: 有效阅读率
        const normalEmails = emails.filter((e: any) => !e.is_malicious);
        const effectivelyRead = normalEmails.filter((e: any) => e.is_read && e.read_duration >= 3);
        const bGroupScore = normalEmails.length > 0 
            ? (effectivelyRead.length / normalEmails.length) 
            : 0;

        // 更新游戏状态
        const gameStatusResponse = await fetch(
            `${supabaseUrl}/rest/v1/game_status?select=*&order=created_at.desc&limit=1`,
            {
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey
                }
            }
        );

        if (gameStatusResponse.ok) {
            const gameStatuses = await gameStatusResponse.json();
            if (gameStatuses.length > 0) {
                const gameStatus = gameStatuses[0];
                
                let winnerGroup = null;
                if (aGroupScore > 0.6) {
                    winnerGroup = 'A';
                } else if (bGroupScore > 0.6) {
                    winnerGroup = 'B';
                }

                await fetch(`${supabaseUrl}/rest/v1/game_status?id=eq.${gameStatus.id}`, {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${serviceRoleKey}`,
                        'apikey': serviceRoleKey,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        a_group_score: aGroupScore,
                        b_group_score: bGroupScore,
                        winner_group: winnerGroup,
                        updated_at: new Date().toISOString()
                    })
                });
            }
        }

        return new Response(JSON.stringify({ 
            data: { 
                success: true,
                a_group_score: aGroupScore,
                b_group_score: bGroupScore,
                a_group_win: aGroupScore > 0.6,
                b_group_win: bGroupScore > 0.6
            } 
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Error:', error);
        return new Response(JSON.stringify({
            error: {
                code: 'CALCULATE_FAILED',
                message: error.message
            }
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});

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
        const { sender_id, recipient_ids, subject, content, template_id, is_malicious, is_warning } = await req.json();
        
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

        if (!supabaseUrl || !serviceRoleKey) {
            throw new Error('Missing Supabase configuration');
        }

        // 获取发件人信息
        const senderResponse = await fetch(
            `${supabaseUrl}/rest/v1/users?id=eq.${sender_id}&select=*`,
            {
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey
                }
            }
        );

        if (!senderResponse.ok) {
            throw new Error('Failed to fetch sender info');
        }

        const senderData = await senderResponse.json();
        if (!senderData || senderData.length === 0) {
            throw new Error('Sender not found');
        }

        const sender = senderData[0];

        // 获取收件人信息
        const recipientsResponse = await fetch(
            `${supabaseUrl}/rest/v1/users?id=in.(${recipient_ids.join(',')})&select=*`,
            {
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey
                }
            }
        );

        if (!recipientsResponse.ok) {
            throw new Error('Failed to fetch recipients info');
        }

        const recipients = await recipientsResponse.json();

        // 验证发送权限
        for (const recipient of recipients) {
            if (sender.role === 'A') {
                // A组只能发送给B组和C组
                if (recipient.role !== 'B' && recipient.role !== 'C') {
                    throw new Error('A组只能向B组和C组发送邮件');
                }
            } else if (sender.role === 'B') {
                // B组只能发送给A组
                if (recipient.role !== 'A') {
                    throw new Error('B组只能向A组发送邮件');
                }
            } else if (sender.role === 'C') {
                // C组只能发送警告邮件给A组和B组
                if (!is_warning) {
                    throw new Error('C组只能发送警告邮件');
                }
                if (recipient.role !== 'A' && recipient.role !== 'B') {
                    throw new Error('C组只能向A组和B组发送警告邮件');
                }
            }
            // admin没有限制
        }

        // 检查发件人已发送邮件数量
        const sentCountResponse = await fetch(
            `${supabaseUrl}/rest/v1/emails?sender_id=eq.${sender_id}&select=id`,
            {
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey
                }
            }
        );

        if (!sentCountResponse.ok) {
            throw new Error('Failed to check sent count');
        }

        const sentEmails = await sentCountResponse.json();
        
        if (sentEmails.length >= 5) {
            throw new Error('已达到发送上限(5封)');
        }

        // 创建邮件记录
        const emailsToCreate = recipient_ids.map((recipient_id: string) => ({
            sender_id,
            recipient_id,
            subject,
            content,
            template_id: template_id || null,
            is_malicious: is_malicious || false,
            is_clicked: false,
            is_read: false,
            is_suspicious_marked: false
        }));

        const createResponse = await fetch(`${supabaseUrl}/rest/v1/emails`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify(emailsToCreate)
        });

        if (!createResponse.ok) {
            const error = await createResponse.text();
            throw new Error(`Failed to send emails: ${error}`);
        }

        const createdEmails = await createResponse.json();

        // 更新发件人统计
        const senderStatsResponse = await fetch(
            `${supabaseUrl}/rest/v1/statistics?user_id=eq.${sender_id}`,
            {
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey
                }
            }
        );

        if (senderStatsResponse.ok) {
            const senderStats = await senderStatsResponse.json();
            if (senderStats.length > 0) {
                await fetch(`${supabaseUrl}/rest/v1/statistics?user_id=eq.${sender_id}`, {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${serviceRoleKey}`,
                        'apikey': serviceRoleKey,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        emails_sent: senderStats[0].emails_sent + recipient_ids.length
                    })
                });
            }
        }

        // 更新收件人统计
        for (const recipient_id of recipient_ids) {
            const recipientStatsResponse = await fetch(
                `${supabaseUrl}/rest/v1/statistics?user_id=eq.${recipient_id}`,
                {
                    headers: {
                        'Authorization': `Bearer ${serviceRoleKey}`,
                        'apikey': serviceRoleKey
                    }
                }
            );

            if (recipientStatsResponse.ok) {
                const recipientStats = await recipientStatsResponse.json();
                if (recipientStats.length > 0) {
                    await fetch(`${supabaseUrl}/rest/v1/statistics?user_id=eq.${recipient_id}`, {
                        method: 'PATCH',
                        headers: {
                            'Authorization': `Bearer ${serviceRoleKey}`,
                            'apikey': serviceRoleKey,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            emails_received: recipientStats[0].emails_received + 1
                        })
                    });
                }
            }
        }

        return new Response(JSON.stringify({ 
            data: { 
                success: true, 
                emails: createdEmails,
                remaining: 5 - (sentEmails.length + recipient_ids.length)
            } 
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Error:', error);
        return new Response(JSON.stringify({
            error: {
                code: 'SEND_EMAIL_FAILED',
                message: error.message
            }
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});

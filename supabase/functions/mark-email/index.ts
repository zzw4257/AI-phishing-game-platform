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
        const { email_id, action, user_id, read_duration } = await req.json();
        
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

        if (!supabaseUrl || !serviceRoleKey) {
            throw new Error('Missing Supabase configuration');
        }

        const updateData: any = {};
        
        if (action === 'click') {
            updateData.is_clicked = true;
            updateData.clicked_at = new Date().toISOString();
        } else if (action === 'read') {
            updateData.is_read = true;
            updateData.read_at = new Date().toISOString();
            if (read_duration) {
                updateData.read_duration = read_duration;
            }
        } else if (action === 'mark_suspicious') {
            updateData.is_suspicious_marked = true;
            updateData.marked_by_id = user_id;
        }

        // 更新邮件状态
        const updateResponse = await fetch(`${supabaseUrl}/rest/v1/emails?id=eq.${email_id}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify(updateData)
        });

        if (!updateResponse.ok) {
            const error = await updateResponse.text();
            throw new Error(`Failed to update email: ${error}`);
        }

        const updatedEmail = await updateResponse.json();

        // 获取邮件详情用于更新统计
        const emailResponse = await fetch(
            `${supabaseUrl}/rest/v1/emails?id=eq.${email_id}&select=*`,
            {
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey
                }
            }
        );

        if (emailResponse.ok) {
            const emails = await emailResponse.json();
            if (emails.length > 0) {
                const email = emails[0];

                // 更新相关用户统计
                if (action === 'click' && email.is_malicious) {
                    // A组恶意链接被点击，更新发送者统计
                    const senderStatsResponse = await fetch(
                        `${supabaseUrl}/rest/v1/statistics?user_id=eq.${email.sender_id}`,
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
                            await fetch(`${supabaseUrl}/rest/v1/statistics?user_id=eq.${email.sender_id}`, {
                                method: 'PATCH',
                                headers: {
                                    'Authorization': `Bearer ${serviceRoleKey}`,
                                    'apikey': serviceRoleKey,
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    emails_clicked: senderStats[0].emails_clicked + 1
                                })
                            });
                        }
                    }
                } else if (action === 'read' && !email.is_malicious && read_duration && read_duration >= 3) {
                    // B组邮件被有效阅读(>3秒)，更新发送者和接收者统计
                    const senderStatsResponse = await fetch(
                        `${supabaseUrl}/rest/v1/statistics?user_id=eq.${email.sender_id}`,
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
                            await fetch(`${supabaseUrl}/rest/v1/statistics?user_id=eq.${email.sender_id}`, {
                                method: 'PATCH',
                                headers: {
                                    'Authorization': `Bearer ${serviceRoleKey}`,
                                    'apikey': serviceRoleKey,
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    emails_clicked: senderStats[0].emails_clicked + 1
                                })
                            });
                        }
                    }

                    const recipientStatsResponse = await fetch(
                        `${supabaseUrl}/rest/v1/statistics?user_id=eq.${email.recipient_id}`,
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
                            await fetch(`${supabaseUrl}/rest/v1/statistics?user_id=eq.${email.recipient_id}`, {
                                method: 'PATCH',
                                headers: {
                                    'Authorization': `Bearer ${serviceRoleKey}`,
                                    'apikey': serviceRoleKey,
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    emails_read: recipientStats[0].emails_read + 1
                                })
                            });
                        }
                    }
                } else if (action === 'mark_suspicious') {
                    // C组标记可疑邮件
                    const markerStatsResponse = await fetch(
                        `${supabaseUrl}/rest/v1/statistics?user_id=eq.${user_id}`,
                        {
                            headers: {
                                'Authorization': `Bearer ${serviceRoleKey}`,
                                'apikey': serviceRoleKey
                            }
                        }
                    );

                    if (markerStatsResponse.ok) {
                        const markerStats = await markerStatsResponse.json();
                        if (markerStats.length > 0) {
                            await fetch(`${supabaseUrl}/rest/v1/statistics?user_id=eq.${user_id}`, {
                                method: 'PATCH',
                                headers: {
                                    'Authorization': `Bearer ${serviceRoleKey}`,
                                    'apikey': serviceRoleKey,
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    suspicious_marked: markerStats[0].suspicious_marked + 1
                                })
                            });
                        }
                    }
                }
            }
        }

        return new Response(JSON.stringify({ 
            data: { 
                success: true, 
                email: updatedEmail 
            } 
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Error:', error);
        return new Response(JSON.stringify({
            error: {
                code: 'MARK_EMAIL_FAILED',
                message: error.message
            }
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});

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
        const requestData = await req.json();
        const { 
            user_id, 
            email_id, 
            record_type,
            // A组钓鱼设计字段
            phishing_type,
            design_thoughts,
            target_audience,
            expected_result,
            actual_reflection,
            // C组监管记录字段
            identification_basis,
            decision_process,
            warning_content,
            effect_evaluation
        } = requestData;
        
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

        if (!supabaseUrl || !serviceRoleKey) {
            throw new Error('Missing Supabase configuration');
        }

        // 创建设计记录
        const recordData: any = {
            user_id,
            email_id: email_id || null,
            record_type
        };

        if (record_type === 'phishing_design') {
            recordData.phishing_type = phishing_type;
            recordData.design_thoughts = design_thoughts;
            recordData.target_audience = target_audience;
            recordData.expected_result = expected_result;
            recordData.actual_reflection = actual_reflection;
        } else if (record_type === 'supervision') {
            recordData.identification_basis = identification_basis;
            recordData.decision_process = decision_process;
            recordData.warning_content = warning_content;
            recordData.effect_evaluation = effect_evaluation;
        }

        const createResponse = await fetch(`${supabaseUrl}/rest/v1/email_design_records`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify(recordData)
        });

        if (!createResponse.ok) {
            const error = await createResponse.text();
            throw new Error(`Failed to save design record: ${error}`);
        }

        const createdRecord = await createResponse.json();

        return new Response(JSON.stringify({ 
            data: { 
                success: true, 
                record: createdRecord 
            } 
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Error:', error);
        return new Response(JSON.stringify({
            error: {
                code: 'SAVE_RECORD_FAILED',
                message: error.message
            }
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});

'use strict';
const { send, methodNotAllowed, readJson, handleError, HttpError } = require('../../lib/server/http');
const { requireUser, requirePro, dbRequest } = require('../../lib/server/supabase');
const { getCredential, generateText, PROVIDERS } = require('../../lib/server/integrations');
module.exports = async function handler(req,res){
  if(req.method!=='POST') return methodNotAllowed(res,['POST']);
  try {
    const user=await requireUser(req); const subscription=await requirePro(user);
    const {message,snapshot}=readJson(req);
    if(typeof message!=='string'||!message.trim()||message.length>2000) throw new HttpError(400,'메시지는 1~2,000자로 입력하세요.');
    const rows=await dbRequest(`api_credentials?user_id=eq.${encodeURIComponent(user.id)}&select=provider&order=updated_at.desc&limit=1`);
    const provider=Array.isArray(rows)?rows[0]?.provider:null;
    if(!provider||!PROVIDERS[provider]) throw new HttpError(400,'먼저 OpenAI, Anthropic 또는 Gemini API를 연결하세요.');
    const credential=await getCredential(user,provider);
    const isMaster=subscription.plan==='master';
    const max=isMaster?10000:String(subscription.plan||'').startsWith('max_')?500:100;
    const month=new Date().toISOString().slice(0,7);
    const quota=await dbRequest('rpc/consume_ai_quota',{method:'POST',body:{p_user_id:user.id,p_month:month,p_limit:max}});
    const used=Number(quota); if(!used) throw new HttpError(429,`이번 달 AI 대화 한도(${max}회)에 도달했습니다.`);
    const safe={subjects:Array.isArray(snapshot?.subjects)?snapshot.subjects.slice(0,20):[],sessions:Array.isArray(snapshot?.sessions)?snapshot.sessions.slice(-30):[],tasks:Array.isArray(snapshot?.tasks)?snapshot.tasks.slice(0,15):[],memory:Array.isArray(snapshot?.memory)?snapshot.memory.slice(-30):[]};
    const raw=await generateText(credential,
      '너는 조용하고 사려 깊은 개인 학습 비서다. 사용자가 요청하지 않은 훈계나 과도한 동기부여를 하지 않는다. 기록에 없는 사실을 추정해 단정하지 않는다. 학습 패턴을 설명할 때 관찰된 기록과 가설을 분리한다. 답변은 한국어로 간결하고 실행 가능하게 작성한다. 마지막에 자동 저장할 가치가 있는 안정적인 학습 선호나 목표가 명확히 드러났을 때만 [MEMORY: ...] 한 줄을 추가한다. 일시적인 감정이나 민감한 개인정보는 메모리로 저장하지 않는다.',
      `개인 학습 맥락(사용자가 저장한 기록): ${JSON.stringify(safe)}\n\n사용자 메시지: ${message}`,
      { maxTokens: 650, temperature: 0.35 }
    );
    const match=raw.match(/\[MEMORY:\s*(.*?)\s*\]/s); const reply=raw.replace(/\[MEMORY:\s*.*?\s*\]/s,'').trim();
    return send(res,200,{reply,memoryNote:match?match[1].slice(0,300):null,provider,used,limit:max});
  } catch(error){return handleError(res,error)}
};

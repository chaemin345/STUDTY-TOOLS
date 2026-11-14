'use strict';
const { send, methodNotAllowed, readJson, handleError, HttpError } = require('../../lib/server/http');
const { requireUser, requirePro, dbRequest } = require('../../lib/server/supabase');
const { getCredential, generateText, PROVIDERS } = require('../../lib/server/integrations');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  try {
    const user = await requireUser(req);
    const subscription = await requirePro(user);
    const { snapshot } = readJson(req);
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) throw new HttpError(400, '분석 데이터가 올바르지 않습니다.');
    const sessions = Array.isArray(snapshot.sessions) ? snapshot.sessions.slice(-120) : [];
    if (!sessions.length) throw new HttpError(400, '분석할 학습 기록이 없습니다.');
    const plan = String(subscription.plan || 'monthly');
    const isMaster = plan === 'master';
    const isMax = isMaster || plan.startsWith('max_');
    const limit = isMaster ? 10000 : isMax ? 500 : 100;
    const rows = await dbRequest(`api_credentials?user_id=eq.${encodeURIComponent(user.id)}&select=provider&order=updated_at.desc&limit=1`);
    const provider = Array.isArray(rows) ? rows[0]?.provider : null;
    if (!provider || !PROVIDERS[provider]) throw new HttpError(400, '먼저 OpenAI, Anthropic 또는 Gemini API를 연결하세요.');
    const credential = await getCredential(user, provider);
    const month = new Date().toISOString().slice(0, 7);
    const quota = await dbRequest('rpc/consume_ai_quota', { method: 'POST', body: { p_user_id: user.id, p_month: month, p_limit: limit } });
    const used = Number(quota);
    if (!used) throw new HttpError(429, `이번 달 AI 사용 한도(${limit}회)에 도달했습니다.`);
    const safe = {
      examName: String(snapshot.examName || '목표 시험').slice(0, 50),
      examDate: String(snapshot.examDate || '').slice(0, 10),
      dailyGoal: Math.max(10, Math.min(1440, Number(snapshot.dailyGoal) || 180)),
      subjects: Array.isArray(snapshot.subjects) ? snapshot.subjects.filter(x => typeof x === 'string').slice(0, 20) : [],
      sessions: sessions.map(x => ({ date: String(x.date || '').slice(0, 10), subject: String(x.subject || '기타').slice(0, 30), minutes: Math.max(0, Math.min(1440, Number(x.minutes) || 0)), kind: String(x.kind || '').slice(0, 20) })),
      tasks: Array.isArray(snapshot.tasks) ? snapshot.tasks.slice(-80).map(x => ({ title: String(x.title || '').slice(0, 100), subject: String(x.subject || '').slice(0, 30), date: String(x.date || '').slice(0, 10), done: !!x.done, priority: String(x.priority || 'normal') })) : [],
      memory: Array.isArray(snapshot.memory) ? snapshot.memory.filter(x => typeof x === 'string').slice(-30).map(x => x.slice(0, 500)) : [],
    };
    const tierLabel = isMaster ? 'MASTER' : isMax ? 'PRO MAX' : 'PRO';
    const analysisLevel = isMax ? '다단계 심층 분석' : '구조화 분석';
    const analysisInstructions = isMax
      ? `다음 5개 분석 단계를 순서대로 수행하고 결과만 제시하라: (1) 데이터 품질·표본 수·누락/편향 점검, (2) 날짜·과목·세션 길이별 추세와 반복 패턴 비교, (3) 관찰 사실과 가능한 원인 가설을 분리하고 대안 설명·교란요인 검토, (4) 각 가설의 신뢰도를 높음/중간/낮음으로 표시하고 근거 데이터 명시, (5) 다음 7일에 실행할 검증 실험과 측정 지표 제안. 인과관계를 데이터만으로 확정하지 말고, 데이터가 부족하면 결론을 유보하라. 총 1,600자 이내.`
      : `다음 3개 항목으로 구조화해 분석하라: (1) 기록에서 직접 확인되는 핵심 관찰 3개 이내, (2) 가능한 원인 또는 개선 가설 2개 이내(추정임을 표시), (3) 다음 7일에 시도할 구체적 행동 3개 이내. 표본 수가 적으면 한계를 명시하고 인과관계를 단정하지 말라. 총 900자 이내.`;
    const analysis = await generateText(credential,
      `너는 근거 중심 학습 데이터 분석가다. 사용자의 기록에 없는 수치나 사건을 만들지 않는다. 숨겨진 사고과정이나 비공개 추론을 공개하지 말고, 검증 가능한 관찰·근거·결론만 요약한다. ${analysisInstructions}`,
      `다음은 사용자가 명시적으로 분석을 요청한 학습 데이터다.\n${JSON.stringify(safe)}`,
      { maxTokens: isMax ? 1800 : 1000, temperature: 0.25 }
    );
    return send(res, 200, { analysis: analysis.slice(0, 10000), provider, tierLabel, analysisLevel, used, limit });
  } catch (error) { return handleError(res, error); }
};

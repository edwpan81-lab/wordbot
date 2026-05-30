import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, TextInput } from 'react-native';

const API = 'https://wordbot-1-w9il.onrender.com';

export default function App() {
  const [screen, setScreen] = useState('select');
  const [user, setUser] = useState(null);
  const [quiz, setQuiz] = useState(null);
  const [testId, setTestId] = useState(null);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState({});
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);
  const [allStats, setAllStats] = useState([]);
  const [newWord, setNewWord] = useState('');
  const [message, setMessage] = useState('');
  const [multiWords, setMultiWords] = useState([]);
  const [multiSelections, setMultiSelections] = useState([]);
  const [editStatus, setEditStatus] = useState('');
  const [editWord, setEditWord] = useState(null);
  const [editMeaning, setEditMeaning] = useState('');
  const [editCnMeaning, setEditCnMeaning] = useState('');
  const [editContext, setEditContext] = useState('');
  const [editDistractors, setEditDistractors] = useState('');
  const [searchWord, setSearchWord] = useState('');
  const [historyData, setHistoryData] = useState(null);
  const [historyKey, setHistoryKey] = useState(0);

  useEffect(() => {
    if (screen === 'history' && user && !historyData) {
      const url = `${API}/api/history/${user}`;
      fetch(url)
        .then(r => r.json())
        .then(d => setHistoryData(d))
        .catch(e => setHistoryData({ history: [], error: e.message }));
    }
  }, [screen, user]);

  const searchWordAction = async () => {
    const w = searchWord.trim().toLowerCase();
    if (!w) { setMessage('请输入要查询的单词'); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/word?userId=${user}&word=${encodeURIComponent(w)}`);
      const data = await res.json();
      if (data.word) {
        setEditWord(data.word);
        setEditMeaning(data.meaning || '');
        setEditCnMeaning(data.cnMeaning || '');
        setEditContext(data.context || '');
        setEditDistractors(data.distractors || '');
        setEditStatus(data.status || 'Pending');
        setScreen('editWord');
      } else {
        setMessage('单词不存在，可以直接录入');
        setNewWord(w);
        setScreen('addWord');
      }
    } catch (e) { setMessage('查询失败'); }
    setLoading(false);
  };

  const saveWord = async () => {
    if (!editWord) return;
    setLoading(true);
    try {
      await fetch(`${API}/api/word`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user,
          word: editWord,
          meaning: editMeaning,
          cnMeaning: editCnMeaning,
          context: editContext,
          distractors: editDistractors,
          status: editStatus
        })
      });
      setMessage('保存成功');
      setEditWord(null);
      setScreen('actions');
    } catch (e) { setMessage('保存失败'); }
    setLoading(false);
  };

  const removeWord = async () => {
    if (!editWord) return;
    setLoading(true);
    try {
      await fetch(`${API}/api/word?userId=${user}&word=${encodeURIComponent(editWord)}`, { method: 'DELETE' });
      setMessage(`已删除 ${editWord}`);
      setEditWord(null);
      setScreen('actions');
    } catch (e) { setMessage('删除失败'); }
    setLoading(false);
  };

  const chooseUser = async (u) => {
    setUser(u);
    setScreen('actions');
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/stats/${u}`);
      const data = await res.json();
      setStats(data);
    } catch (e) { console.log('获取统计失败', e); }
    setLoading(false);
  };

  const startTest = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/quiz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user })
      });
      const data = await res.json();
      if (data.error) { setMessage(data.error); setLoading(false); return; }
      setQuiz(data.questions);
      setTestId(data.testId);
      setCurrent(0);
      setAnswers({});
      setResults(null);
      setScreen('quiz');
    } catch (e) { setMessage('无法连接服务器'); }
    setLoading(false);
  };

  const submitTest = async () => {
    console.log(`submitTest: user="${user}", testId="${testId}"`);
    if (!testId) return;
    setLoading(true);
    const ans = quiz.map((_, i) => answers[i] !== undefined ? answers[i] : null);
    try {
      const res = await fetch(`${API}/api/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user, testId, answers: ans })
      });
      const data = await res.json();
      setResults(data);
      setScreen('results');
    } catch { setMessage('提交失败'); }
    setLoading(false);
  };

  const submitWord = async () => {
    const w = newWord.trim();
    if (!w) { setMessage('请输入单词'); return; }
    if (!user) { setMessage('请先选择用户'); return; }
    const words = w.split(/[,，]/).map(x => x.trim()).filter(x => x);
    if (words.length === 0) { setMessage('请输入至少一个单词'); return; }
    for (const word of words) {
      if (!/^[a-zA-Z]+$/.test(word)) { setMessage(`单词 "${word}" 包含非法字符`); return; }
    }
    setLoading(true);
    setMessage('提交中...');
    try {
      const res = await fetch(`${API}/api/admin/addWords`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUser: user, words })
      });
      const data = await res.json();
      if (data.error) { setMessage(data.error); }
      else {
        setMultiWords(words);
        setMultiSelections(words.map(() => false));
        setScreen('multi');
      }
    } catch (e) { setMessage('提交失败: ' + e.message); }
    setLoading(false);
  };

  const confirmMulti = async () => {
    const selected = multiWords.filter((_, i) => multiSelections[i]);
    console.log('确认多义', selected);
    if (selected.length > 0) {
      setLoading(true);
      try {
        console.log('调用API');
        await fetch(`${API}/api/admin/updateMulti`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetUser: user, words: selected })
        });
      } catch (e) { console.log('更新多义词失败', e); }
      setLoading(false);
    }
    setMessage(`已录入 ${multiWords.length} 个单词`);
    setNewWord('');
    setMultiWords([]);
    setScreen('addWord');
  };

  const showDashboard = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/admin/stats`);
      const data = await res.json();
      setAllStats(data.stats || []);
      setScreen('dashboard');
    } catch { setAllStats([]); setScreen('dashboard'); }
    setLoading(false);
  };

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color="#0071E3" /><Text style={{marginTop: 20, fontSize: 15, color: '#86868B'}}>加载中...</Text></View>;

  if (screen === 'results' && results) return (
    <ScrollView style={s.container}>
      <Text style={s.bigTitle}>批改结果</Text>
      {results.error ? (
        <Text style={s.message}>{results.error}</Text>
      ) : (
        <>
          <Text style={s.score}>{results.correct || 0} / {results.total || 0}</Text>
          <Text style={s.accuracy}>{results.accuracy || '0%'}</Text>
          {results.results?.map((r, i) => (
            <View key={i} style={[s.card, r.correct ? s.greenCard : s.redCard]}>
              <Text>第{i+1}题: {r.correct ? '✓ 正确' : `你的答案：${r.your || '未答'}；正确答案：${r.answer}`}</Text>
            </View>
          ))}
        </>
      )}
      <TouchableOpacity style={s.btn} onPress={() => { setQuiz(null); setResults(null); setScreen('actions'); }}>
        <Text style={s.btnText}>继续学习</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  if (screen === 'quiz' && quiz) {
    const q = quiz[current];
    const total = quiz.length;
    const typeName = q.type === 1 ? '语境填空' : q.type === 2 ? '英英释义' : q.type === 3 ? '中英释义' : '未知';
    return (
      <ScrollView style={s.container}>
        <Text style={s.title}>第 {current + 1} / {total} 题</Text>
        <Text style={s.typeLabel}>{typeName}</Text>
        <View style={s.card}>
          <Text style={s.context}>{q.context}</Text>
        </View>
        <Text style={s.hint}>选出正确的答案</Text>
        {q.options.map((opt, i) => (
          <TouchableOpacity key={i} style={[s.option, answers[current] === i && s.selected]} onPress={() => setAnswers(a => ({...a, [current]: i}))}>
            <Text style={s.optionText}>{opt}</Text>
          </TouchableOpacity>
        ))}
        <View style={s.nav}>
          {current > 0 && <TouchableOpacity style={s.prevBtn} onPress={() => setCurrent(c => c - 1)}><Text style={s.navText}>上一题</Text></TouchableOpacity>}
          {current < total - 1 ? <TouchableOpacity style={s.nextBtn} onPress={() => setCurrent(c => c + 1)}><Text style={s.navText}>下一题</Text></TouchableOpacity> : <TouchableOpacity style={s.submitBtn} onPress={submitTest}><Text style={s.navText}>提交</Text></TouchableOpacity>}
        </View>
      </ScrollView>
    );
  }

  if (screen === 'multi') return (
    <ScrollView style={s.container}>
      <Text style={s.title}>多义词确认</Text>
      <Text style={s.subtitle}>请勾选哪些是多义词（默认不勾选）：</Text>
      {multiWords.map((word, i) => (
        <View key={i} style={s.multiItem}>
          <TouchableOpacity style={s.checkbox} onPress={() => {
            const newSel = [...multiSelections];
            newSel[i] = !newSel[i];
            setMultiSelections(newSel);
          }}>
            {multiSelections[i] ? <Text style={s.checkmark}>✓</Text> : <Text style={s.checkEmpty}>-</Text>}
          </TouchableOpacity>
          <Text style={s.multiWord}>{word}</Text>
        </View>
      ))}
      <View style={s.btnRow}>
        <TouchableOpacity style={s.grayBtn} onPress={() => { setNewWord(''); setMultiWords([]); setScreen('addWord'); }}>
          <Text style={s.btnText}>跳过</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.greenBtn} onPress={confirmMulti}>
          <Text style={s.btnText}>确认</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  if (screen === 'editWord') return (
    <ScrollView style={s.container}>
      <Text style={s.title}>编辑单词</Text>
      <Text style={s.bigText}>{editWord}</Text>
      <Text style={s.label}>状态</Text>
      <View style={s.statusRow}>
        <TouchableOpacity style={[s.statusBtn, editStatus === 'Pending' ? s.statusActive : null]} onPress={() => setEditStatus('Pending')}>
          <Text style={[s.statusText, editStatus === 'Pending' ? s.statusTextActive : null]}>待复习</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.statusBtn, editStatus === 'optF5P0W3O' ? s.statusActive : null]} onPress={() => setEditStatus('optF5P0W3O')}>
          <Text style={[s.statusText, editStatus === 'optF5P0W3O' ? s.statusTextActive : null]}>已掌握</Text>
        </TouchableOpacity>
      </View>
      <Text style={s.label}>英文释义</Text>
      <TextInput style={s.input} value={editMeaning} onChangeText={setEditMeaning} multiline />
      <Text style={s.label}>中文释义</Text>
      <TextInput style={s.input} value={editCnMeaning} onChangeText={setEditCnMeaning} multiline />
      <Text style={s.label}>例句</Text>
      <TextInput style={s.input} value={editContext} onChangeText={setEditContext} multiline />
      <Text style={s.label}>干扰词（逗号分隔）</Text>
      <TextInput style={s.input} value={editDistractors} onChangeText={setEditDistractors} />
      <View style={s.btnRow}>
        <TouchableOpacity style={s.redBtn} onPress={removeWord}><Text style={s.btnText}>删除</Text></TouchableOpacity>
        <TouchableOpacity style={s.grayBtn} onPress={() => { setEditWord(null); setScreen('actions'); }}><Text style={s.btnText}>取消</Text></TouchableOpacity>
        <TouchableOpacity style={s.greenBtn} onPress={saveWord}><Text style={s.btnText}>保存</Text></TouchableOpacity>
      </View>
    </ScrollView>
  );

  if (screen === 'addWord') return (
    <ScrollView style={s.container}>
      <Text style={s.title}>录入单词 - {user}</Text>
      <TextInput style={s.input} value={newWord} onChangeText={setNewWord} placeholder="apple, banana, orange" />
      <Text style={s.hint}>释义、例句自动生成</Text>
      {message ? <Text style={s.message}>{message}</Text> : null}
      <TouchableOpacity style={s.greenBtn} onPress={submitWord}><Text style={s.btnText}>提交</Text></TouchableOpacity>
      <TouchableOpacity style={s.grayBtn} onPress={() => { setNewWord(''); setMessage(''); setScreen('actions'); }}><Text style={s.btnText}>返回</Text></TouchableOpacity>
    </ScrollView>
  );

  if (screen === 'dashboard') return (
    <ScrollView style={s.container}>
      <Text style={s.title}>用户统计看板</Text>
      {allStats.map((item, i) => (
        <View key={i} style={s.card}>
          <Text style={s.bigText}>{item.user}</Text>
          <Text>总单词: {item.totalWords}</Text>
          <Text style={s.green}>已掌握: {item.masteredWords}</Text>
          <Text style={s.orange}>待复习: {item.pendingWords}</Text>
          <Text>正确率: {item.accuracyRate}</Text>
        </View>
      ))}
      <TouchableOpacity style={s.grayBtn} onPress={() => { setHistoryData(null); setScreen('actions'); }}><Text style={s.btnText}>返回</Text></TouchableOpacity>
    </ScrollView>
  );

  if (screen === 'actions') return (
    <ScrollView style={s.container}>
      <Text style={s.title}>{user}</Text>
      {message ? <Text style={s.message}>{message}</Text> : null}
      <TouchableOpacity style={s.greenBtn} onPress={startTest}><Text style={s.btnText}>开始测试</Text></TouchableOpacity>
      <TouchableOpacity style={s.orangeBtn} onPress={() => { setNewWord(''); setMessage(''); setScreen('addWord'); }}><Text style={s.btnText}>录入单词</Text></TouchableOpacity>
      <TouchableOpacity style={s.blueBtn} onPress={() => setScreen('searchWord')}><Text style={s.btnText}>查询/编辑单词</Text></TouchableOpacity>
      <TouchableOpacity style={s.btn} onPress={showDashboard}><Text style={s.btnText}>看板</Text></TouchableOpacity>
      <TouchableOpacity style={s.blueBtn} onPress={() => { setScreen('history'); }}><Text style={s.btnText}>历史记录</Text></TouchableOpacity>
      <TouchableOpacity style={s.grayBtn} onPress={() => { setUser(null); setScreen('select'); }}><Text style={s.btnText}>返回</Text></TouchableOpacity>
    </ScrollView>
  );

  if (screen === 'searchWord') return (
    <ScrollView style={s.container}>
      <Text style={s.title}>查询单词</Text>
      <TextInput style={s.input} value={searchWord} onChangeText={setSearchWord} placeholder="输入要查询的单词" />
      {message ? <Text style={s.message}>{message}</Text> : null}
      <TouchableOpacity style={s.greenBtn} onPress={searchWordAction}><Text style={s.btnText}>查询</Text></TouchableOpacity>
      <TouchableOpacity style={s.grayBtn} onPress={() => { setSearchWord(''); setMessage(''); setScreen('actions'); }}><Text style={s.btnText}>返回</Text></TouchableOpacity>
    </ScrollView>
  );

  if (screen === 'history') {
    return (
      <ScrollView style={s.container}>
        <Text style={s.title}>历史记录</Text>
        {historyData === null && <Text>加载中...</Text>}
        {historyData?.error && <Text style={s.message}>错误: {historyData.error}</Text>}
        {historyData && !historyData.error && historyData.history?.length === 0 && <Text>暂无记录</Text>}
        {historyData?.history?.map((t, i) => (
          <View key={i} style={s.card}>
            <Text style={s.boldText}>{new Date(t.time).toLocaleString()}</Text>
            <Text>{t.correct}/{t.total} ({Math.round(t.correct/t.total*100)}%)</Text>
            {t.questions.map((q, j) => (
              <View key={j}>
                <Text style={q.isCorrect ? {color:'green'} : {color:'red'}}>
                  {j+1}. {q.question} {q.type===1?'(语境)':q.type===2?'(英英)':q.type===3?'(中英)':''}
                </Text>
                <Text style={{color:'#666', fontSize:12}}>
                  目标: {q.word} | {q.isCorrect ? '✓ 正确' : `✗ (答:${q.yourAnswer} 对:${q.correctAnswer})`}
                </Text>
              </View>
            ))}
          </View>
        ))}
        <TouchableOpacity style={s.grayBtn} onPress={() => setScreen('actions')}><Text style={s.btnText}>返回</Text></TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={s.container}>
      <Text style={s.title}>单词机器人</Text>
      <View style={s.cardBtn}>
        <TouchableOpacity style={s.cardBtnInner} onPress={() => chooseUser('yusi')}><Text style={s.cardBtnText}>yusi</Text><Text style={s.cardBtnSub}>开始学习</Text></TouchableOpacity>
      </View>
      <View style={s.cardBtn}>
        <TouchableOpacity style={s.cardBtnInner} onPress={() => chooseUser('qiuqiu')}><Text style={s.cardBtnText}>qiuqiu</Text><Text style={s.cardBtnSub}>继续学习</Text></TouchableOpacity>
      </View>
      <View style={s.cardBtn}>
        <TouchableOpacity style={s.cardBtnInner} onPress={showDashboard}><Text style={s.cardBtnText}>看板</Text><Text style={s.cardBtnSub}>查看统计</Text></TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  // 首页卡片按钮
  cardBtn: { marginBottom: 16 },
  cardBtnInner: { 
    backgroundColor: '#FFFFFF', 
    padding: 28, 
    borderRadius: 20, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 4 }, 
    shadowOpacity: 0.1, 
    shadowRadius: 16, 
    elevation: 4,
    alignItems: 'center',
  },
  cardBtnText: { fontSize: 28, fontWeight: '700', color: '#2C3E50', marginBottom: 8 },
  cardBtnSub: { fontSize: 14, color: '#7F8C8D' },
  
  // 护眼柔和背景
  container: { flex: 1, padding: 24, backgroundColor: '#F8FAFC' },
  center: { flex: 1, padding: 24, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center' },
  
  // 标题 - 清晰醒目
  title: { fontSize: 36, fontWeight: '700', textAlign: 'center', marginBottom: 16, color: '#2C3E50', letterSpacing: -1 },
  bigTitle: { fontSize: 28, fontWeight: '700', textAlign: 'center', marginVertical: 32, color: '#2C3E50' },
  typeLabel: { fontSize: 14, color: '#4A90E2', textAlign: 'center', marginBottom: 16, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  subtitle: { fontSize: 15, color: '#7F8C8D', marginBottom: 28 },
  bigText: { fontSize: 24, fontWeight: '700', color: '#2C3E50', marginBottom: 12 },
  boldText: { fontSize: 17, fontWeight: '600', color: '#2C3E50' },
  label: { fontSize: 13, color: '#4A90E2', marginBottom: 8, fontWeight: '600' },
  hint: { fontSize: 12, color: '#95A5A6', marginBottom: 16 },
  context: { fontSize: 18, color: '#34495E', lineHeight: 30, fontStyle: 'italic' },
  
  // 消息
  message: { textAlign: 'center', color: '#E74C3C', marginVertical: 16, fontSize: 15 },
  
  // 分数结果
  score: { fontSize: 72, fontWeight: '200', textAlign: 'center', color: '#4A90E2', letterSpacing: -3 },
  accuracy: { fontSize: 20, textAlign: 'center', color: '#7F8C8D', marginBottom: 28 },
  
  // 卡片 - 大圆角+柔和阴影
  card: { 
    backgroundColor: '#FFFFFF', 
    padding: 24, 
    borderRadius: 20, 
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 4,
  },
  greenCard: { 
    backgroundColor: '#FFFFFF', 
    padding: 24, 
    borderRadius: 20, 
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 4,
  },
  redCard: { 
    backgroundColor: '#FFFFFF', 
    padding: 24, 
    borderRadius: 20, 
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 4,
  },
  
  // 按钮 - 圆角扁平+柔和色
  btn: { backgroundColor: '#4A90E2', paddingVertical: 14, paddingHorizontal: 28, borderRadius: 22, marginVertical: 8, opacity: 0.9 },
  greenBtn: { backgroundColor: '#50C878', paddingVertical: 14, paddingHorizontal: 28, borderRadius: 22, marginVertical: 8, opacity: 0.9 },
  orangeBtn: { backgroundColor: '#F39C12', paddingVertical: 14, paddingHorizontal: 28, borderRadius: 22, marginVertical: 8, opacity: 0.9 },
  grayBtn: { backgroundColor: '#95A5A6', paddingVertical: 14, paddingHorizontal: 28, borderRadius: 22, marginVertical: 8, opacity: 0.9 },
  blueBtn: { backgroundColor: '#3498DB', paddingVertical: 14, paddingHorizontal: 28, borderRadius: 22, marginVertical: 8, opacity: 0.9 },
  redBtn: { backgroundColor: '#E74C3C', paddingVertical: 14, paddingHorizontal: 28, borderRadius: 22, marginVertical: 8, opacity: 0.9 },
  btnText: { color: '#FFFFFF', fontSize: 16, textAlign: 'center', fontWeight: '600' },
  btnRow: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 14 },
  
  // 状态按钮
  statusRow: { flexDirection: 'row', marginBottom: 20 },
  statusBtn: { flex: 1, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, borderWidth: 2, borderColor: '#E0E0E0', alignItems: 'center', backgroundColor: '#FFFFFF' },
  statusActive: { borderColor: '#50C878', backgroundColor: '#E8F8F5' },
  statusText: { fontSize: 14, color: '#7F8C8D', fontWeight: '500' },
  statusTextActive: { color: '#50C878', fontWeight: '700' },
  
  // 输入框
  input: { backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#E0E0E0', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 18, fontSize: 16, marginVertical: 12, color: '#2C3E50' },
  
  // 选项
  option: { backgroundColor: '#FFFFFF', paddingVertical: 18, paddingHorizontal: 20, borderRadius: 18, marginBottom: 12, borderWidth: 2, borderColor: '#E8E8E8', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2 },
  selected: { borderColor: '#4A90E2', backgroundColor: '#EBF5FF' },
  optionText: { fontSize: 16, color: '#2C3E50', fontWeight: '500' },
  
  // 导航
  nav: { flexDirection: 'row', justifyContent: 'center', marginTop: 20, gap: 14 },
  prevBtn: { backgroundColor: '#95A5A6', paddingVertical: 12, paddingHorizontal: 22, borderRadius: 20, opacity: 0.9 },
  nextBtn: { backgroundColor: '#4A90E2', paddingVertical: 12, paddingHorizontal: 22, borderRadius: 20, opacity: 0.9 },
  submitBtn: { backgroundColor: '#50C878', paddingVertical: 12, paddingHorizontal: 22, borderRadius: 20, opacity: 0.9 },
  navText: { color: '#FFFFFF', textAlign: 'center', fontWeight: '600', fontSize: 15 },
  
  // 统计颜色
  green: { color: '#50C878', fontSize: 15, fontWeight: '600' },
  orange: { color: '#F39C12', fontSize: 15, fontWeight: '600' },
  
  // 多选
  multiItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 18, backgroundColor: '#FFFFFF', borderRadius: 14, marginBottom: 10, borderWidth: 1.5, borderColor: '#E8E8E8' },
  checkbox: { width: 26, height: 26, borderWidth: 2.5, borderColor: '#4A90E2', borderRadius: 7, marginRight: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF' },
  checkmark: { color: '#4A90E2', fontSize: 16, fontWeight: '700' },
  checkEmpty: { color: '#D0D0D0', fontSize: 16 },
  multiWord: { fontSize: 16, color: '#2C3E50', fontWeight: '500' },
});

// 修复 Status 字段脏数据
// 规则：
//   Status = "optXjbXS2F" 字符串 → Pending
//   Status = "optF5P0W3O" 字符串 → Mastered
//   Status = undefined → Pending
require('dotenv').config();
const { getToken } = require('./feishu');

const WORD_TABLE = { appToken: 'BWhIb2hjaaDQHdsNhWRcPluBncg', tableId: 'tblyMh69dws6ty6n' };

function request(method, path, body, token) {
    const https = require('https');
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : null;
        const headers = { 'Content-Type': 'application/json' };
        if (data) headers['Content-Length'] = Buffer.byteLength(data);
        if (token) headers['Authorization'] = 'Bearer ' + token;
        const req = https.request({ hostname: 'open.feishu.cn', path, method, headers }, (res) => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
                catch { resolve({}); }
            });
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

const PENDING = 'Pending';
const MASTERED = 'Mastered';
const LEGACY_PENDING = 'optXjbXS2F';
const LEGACY_MASTERED = 'optF5P0W3O';

async function main() {
    const token = await getToken();

    // 拉取所有 record（分页）
    const allRecords = [];
    let pageToken = null;
    do {
        const url = `/open-apis/bitable/v1/apps/${WORD_TABLE.appToken}/tables/${WORD_TABLE.tableId}/records?page_size=500${pageToken ? '&page_token=' + pageToken : ''}`;
        const recordsRes = await request('GET', url, null, token);
        const items = recordsRes.data?.items || [];
        allRecords.push(...items);
        pageToken = recordsRes.data?.page_token || null;
    } while (pageToken);
    console.log(`共 ${allRecords.length} 条记录\n`);

    const toFix = [];
    for (const r of allRecords) {
        const status = r.fields?.Status;
        if (status === LEGACY_PENDING) toFix.push({ rid: r.record_id, word: r.fields?.Word, from: LEGACY_PENDING, to: PENDING });
        else if (status === LEGACY_MASTERED) toFix.push({ rid: r.record_id, word: r.fields?.Word, from: LEGACY_MASTERED, to: MASTERED });
        else if (status === undefined || status === null) toFix.push({ rid: r.record_id, word: r.fields?.Word, from: 'undefined', to: PENDING });
    }

    console.log(`需修复 ${toFix.length} 条:`);
    const fromCount = {};
    for (const f of toFix) {
        fromCount[f.from] = (fromCount[f.from] || 0) + 1;
    }
    for (const [k, v] of Object.entries(fromCount)) {
        console.log(`  ${k}: ${v} 条`);
    }

    if (toFix.length === 0) {
        console.log('无需修复');
        return;
    }

    // 执行修复
    let success = 0, fail = 0;
    for (const f of toFix) {
        try {
            const url = `/open-apis/bitable/v1/apps/${WORD_TABLE.appToken}/tables/${WORD_TABLE.tableId}/records/${f.rid}`;
            const res = await request('PUT', url, { fields: { Status: f.to } }, token);
            if (res.code === 0) {
                success++;
                console.log(`  ✓ ${f.rid} (${f.word}): ${f.from} → ${f.to}`);
            } else {
                fail++;
                console.log(`  ✗ ${f.rid} (${f.word}): ${res.msg}`);
            }
            await new Promise(r => setTimeout(r, 300));
        } catch (e) {
            fail++;
            console.log(`  ✗ ${f.rid}: ${e.message}`);
        }
    }

    console.log(`\n修复完成: 成功 ${success}, 失败 ${fail}`);
}

main().catch(console.error);

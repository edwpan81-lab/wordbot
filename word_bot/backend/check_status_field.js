// 检查 Status 字段定义和当前实际值
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

async function main() {
    const token = await getToken();

    // 1. 查字段定义
    const fieldsRes = await request('GET', `/open-apis/bitable/v1/apps/${WORD_TABLE.appToken}/tables/${WORD_TABLE.tableId}/fields`, null, token);
    const statusField = fieldsRes.data?.items?.find(f => f.field_name === 'Status');
    console.log('Status 字段定义:');
    console.log(JSON.stringify(statusField, null, 2));

    // 2. 查所有 record 的 Status 实际值（分页）
    const allRecords = [];
    let pageToken = null;
    do {
        const url = `/open-apis/bitable/v1/apps/${WORD_TABLE.appToken}/tables/${WORD_TABLE.tableId}/records?page_size=500${pageToken ? '&page_token=' + pageToken : ''}`;
        const recordsRes = await request('GET', url, null, token);
        const items = recordsRes.data?.items || [];
        allRecords.push(...items);
        pageToken = recordsRes.data?.page_token || null;
    } while (pageToken);
    console.log(`\n共 ${allRecords.length} 条记录，Status 字段值分布:`);
    const statusMap = {};
    for (const r of allRecords) {
        const status = r.fields?.Status;
        const key = typeof status === 'object' ? JSON.stringify(status) : (status === undefined || status === null ? 'undefined' : String(status));
        if (!statusMap[key]) statusMap[key] = { count: 0, sample: status };
        statusMap[key].count++;
    }
    for (const [k, v] of Object.entries(statusMap)) {
        console.log(`  ${k}: ${v.count} 条`);
        const sampleStr = v.sample === undefined || v.sample === null ? 'null' : (typeof v.sample === 'string' ? v.sample : JSON.stringify(v.sample));
        console.log(`    示例: ${sampleStr.substring(0, 200)}`);
    }
}

main().catch(console.error);

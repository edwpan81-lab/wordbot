require('dotenv').config();
const https = require('https');
const { getToken } = require('./feishu');

const TEST_TABLE = { appToken: 'FyyPb1urFacfn7sGSjpca2UwnHe', tableId: 'tbl6Nx0kJWjr7qQZ' };

function request(method, path, body, token) {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : null;
        const headers = { 'Content-Type': 'application/json' };
        if (data) headers['Content-Length'] = Buffer.byteLength(data);
        if (token) headers.Authorization = 'Bearer ' + token;
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
    const listPath = `/open-apis/bitable/v1/apps/${TEST_TABLE.appToken}/tables/${TEST_TABLE.tableId}/fields?page_size=100`;
    const fieldsRes = await request('GET', listPath, null, token);
    const fields = fieldsRes.data?.items || [];
    const exists = fields.some(f => f.field_name === 'options');
    if (exists) {
        console.log('options 字段已存在');
        return;
    }

    const createPath = `/open-apis/bitable/v1/apps/${TEST_TABLE.appToken}/tables/${TEST_TABLE.tableId}/fields`;
    const createRes = await request('POST', createPath, { field_name: 'options', type: 1 }, token);
    if (createRes.code !== 0) {
        throw new Error(`创建 options 字段失败: ${createRes.msg || JSON.stringify(createRes)}`);
    }
    console.log('options 字段创建成功');
}

main().catch(e => {
    console.error(e.message);
    process.exit(1);
});

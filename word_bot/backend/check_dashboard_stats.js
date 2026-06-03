require('dotenv').config();
const { getRecords } = require('./feishu');

const WORD_TABLE = { appToken: 'BWhIb2hjaaDQHdsNhWRcPluBncg', tableId: 'tblyMh69dws6ty6n' };

function getFieldValue(value) {
    if (value === undefined || value === null) return '';
    if (Array.isArray(value)) return value.length > 0 ? getFieldValue(value[0]) : '';
    if (typeof value === 'object') {
        if (value.text !== undefined) return String(value.text);
        if (value.name !== undefined) return String(value.name);
        if (value.value !== undefined) return String(value.value);
        if (value.id !== undefined) return String(value.id);
        return JSON.stringify(value);
    }
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed) || (parsed && typeof parsed === 'object')) {
                return getFieldValue(parsed);
            }
        } catch (e) {}
        return value;
    }
    return String(value);
}

function normalizeStatus(status) {
    const value = getFieldValue(status).trim();
    const lower = value.toLowerCase();
    if (lower === 'mastered' || value === 'optF5P0W3O' || value === '已掌握') return 'Mastered';
    if (lower === 'pending' || value === 'optXjbXS2F' || value === '待复习') return 'Pending';
    return 'Pending';
}

async function main() {
    const records = await getRecords(WORD_TABLE);
    const byUser = {};
    for (const record of records) {
        const user = getFieldValue(record.fields.user) || '(empty)';
        const status = normalizeStatus(record.fields.Status);
        if (!byUser[user]) byUser[user] = { total: 0, mastered: 0, pending: 0, raw: {} };
        byUser[user].total++;
        if (status === 'Mastered') byUser[user].mastered++;
        else byUser[user].pending++;
        const raw = getFieldValue(record.fields.Status) || '(empty)';
        byUser[user].raw[raw] = (byUser[user].raw[raw] || 0) + 1;
    }
    console.log(JSON.stringify(byUser, null, 2));
}

main().catch(err => {
    console.error(err.message);
    process.exit(1);
});

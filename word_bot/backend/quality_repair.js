require('dotenv').config();

const {
    getRecords,
    updateRecord,
    generateQualityContext,
    generateDistractorsWithContext,
    generateSafeDistractorsWithContext,
    evaluateQuizContent,
    evaluateSafeDistractors,
    evaluateAndRepairMeaning,
    isContextUsableForWord,
    cleanDistractors
} = require('./feishu');

const WORD_TABLE = { appToken: 'BWhIb2hjaaDQHdsNhWRcPluBncg', tableId: 'tblyMh69dws6ty6n' };

function getArg(name, defaultValue = null) {
    const prefix = `--${name}=`;
    const arg = process.argv.find(a => a.startsWith(prefix));
    return arg ? arg.slice(prefix.length) : defaultValue;
}

function hasFlag(name) {
    return process.argv.includes(`--${name}`);
}

function fieldValue(value) {
    if (value === undefined || value === null) return '';
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return fieldValue(value[0]);
    if (typeof value === 'object') return value.text || value.name || value.value || '';
    return String(value);
}

function parseDistractors(value) {
    return fieldValue(value)
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
}

function auditContext(word, context) {
    const reasons = [];
    const text = fieldValue(context).trim();
    if (!text) reasons.push('context_missing');
    if (/^the word ".+" is used in context\.$/i.test(text)) reasons.push('context_generic');
    if (text && !isContextUsableForWord(word, text)) reasons.push('context_no_target');
    return reasons;
}

function auditDistractors(word, distractors) {
    const reasons = [];
    const cleaned = cleanDistractors(word, distractors);
    if (distractors.length < 3) reasons.push('distractors_missing');
    if (cleaned.length < Math.min(distractors.length, 3)) reasons.push('distractors_bad_shape');
    if (new Set(distractors.map(d => d.toLowerCase())).size !== distractors.length) reasons.push('distractors_duplicate');
    return { reasons, cleaned };
}

function shouldHandle(record, options) {
    const user = fieldValue(record.fields.user);
    const word = fieldValue(record.fields.Word);
    if (!word) return false;
    if (options.user && user !== options.user) return false;
    if (options.recordId && record.record_id !== options.recordId) return false;
    return true;
}

async function generateReviewedDistractors(word, context, meaning, pos, oldDistractors, reasons, maxAttempts = 3) {
    let feedback = reasons.join('; ');
    let lastGenerated = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const generated = await generateDistractorsWithContext(word, context, meaning, pos, feedback);
        if (!generated || generated.length < 3) {
            feedback = `${feedback}; attempt ${attempt} returned too few candidates`;
            continue;
        }

        lastGenerated = generated;
        const review = await evaluateQuizContent(word, context, meaning, pos, generated);
        if (review && review.distractorsOk) {
            return { distractors: generated, review, accepted: true };
        }

        const reviewReasons = review?.reasons?.join('; ') || 'review failed';
        const bad = review?.badDistractors?.join(', ') || generated.join(', ');
        feedback = `${feedback}; rejected candidates: ${bad}; reason: ${reviewReasons}`;
    }

    const fallback = await generateSafeDistractorsWithContext(word, context, meaning, pos, feedback);
    if (fallback && fallback.length >= 3) {
        const review = await evaluateSafeDistractors(word, context, meaning, pos, fallback);
        if (review && review.distractorsOk) {
            return { distractors: fallback, review, accepted: true, fallback: true };
        }
        feedback = `${feedback}; safe fallback rejected: ${fallback.join(', ')}; reason: ${review?.reasons?.join('; ') || 'review failed'}`;
    }

    return { distractors: lastGenerated || oldDistractors, review: null, accepted: false };
}

async function repairRecord(record, options) {
    const fields = record.fields;
    const word = fieldValue(fields.Word);
    const meaning = fieldValue(fields.Meaning);
    const pos = fieldValue(fields.POS);
    const cnMeaning = fieldValue(fields.CN_Meaning);
    const context = fieldValue(fields.Context);
    const oldDistractors = parseDistractors(fields.Distractors);

    const contextReasons = auditContext(word, context);
    const distAudit = auditDistractors(word, oldDistractors);
    const reasons = [...contextReasons, ...distAudit.reasons];
    let nextMeaning = meaning;
    let nextPos = pos;
    let nextCNMeaning = cnMeaning;

    if (options.reviewAI && !options.skipMeaningReview) {
        const meaningReview = await evaluateAndRepairMeaning(word, meaning, pos, cnMeaning);
        if (meaningReview) {
            if (options.showReview) {
                reasons.push(`ai_review_meaning_ok=${meaningReview.meaningOk}`);
            }
            if (!meaningReview.meaningOk && meaningReview.correctedMeaning) {
                reasons.push('ai_meaning_mismatch');
                if (meaningReview.reason) reasons.push(`ai_meaning: ${meaningReview.reason}`);
                nextMeaning = meaningReview.correctedMeaning;
                nextPos = meaningReview.correctedPos || pos;
                nextCNMeaning = meaningReview.correctedCNMeaning || cnMeaning;
            }
        } else {
            reasons.push('ai_meaning_review_failed');
        }
    }

    if (options.reviewAI && contextReasons.length === 0 && distAudit.reasons.length === 0) {
        const review = await evaluateQuizContent(word, context, nextMeaning, nextPos, oldDistractors);
        if (review) {
            if (!review.contextOk) reasons.push('ai_context_quality_low');
            if (!review.distractorsOk) reasons.push('ai_distractors_quality_low');
            for (const reason of review.reasons) reasons.push(`ai: ${reason}`);
            if (review.badDistractors.length > 0) reasons.push(`bad_distractors: ${review.badDistractors.join(', ')}`);
            if (options.showReview) {
                reasons.push(`ai_review_context_ok=${review.contextOk}`);
                reasons.push(`ai_review_distractors_ok=${review.distractorsOk}`);
            }
        } else {
            reasons.push('ai_review_failed');
        }
    }

    const meaningChanged = nextMeaning !== meaning || nextPos !== pos || nextCNMeaning !== cnMeaning;
    const needsContext = options.force || meaningChanged || (!options.distractorsOnly && reasons.some(r => r === 'context_missing' || r === 'context_generic' || r === 'context_no_target' || r === 'ai_context_quality_low'));
    const needsDistractors = options.force || meaningChanged || (!options.contextOnly && (reasons.some(r => r.startsWith('distractors_') || r === 'ai_distractors_quality_low') || needsContext));

    if (!needsContext && !needsDistractors) {
        return { skipped: true, word, reasons };
    }

    let nextContext = context;
    let nextDistractors = oldDistractors;

    if (needsContext) {
        const generated = await generateQualityContext(word, nextMeaning, nextPos);
        if (generated) nextContext = generated;
        else reasons.push('context_generate_failed');
    }

    if (needsDistractors && isContextUsableForWord(word, nextContext)) {
        if (options.reviewAI) {
            const generated = await generateReviewedDistractors(word, nextContext, nextMeaning, nextPos, oldDistractors, reasons);
            if (generated.accepted) {
                nextDistractors = generated.distractors;
                if (generated.fallback) reasons.push('used_safe_distractors_fallback');
            }
            else reasons.push('distractors_review_after_generation_failed');
        } else {
            const generated = await generateDistractorsWithContext(word, nextContext, nextMeaning, nextPos);
            if (generated && generated.length >= 3) nextDistractors = generated;
            else reasons.push('distractors_generate_failed');
        }
    }

    if (options.reviewAI && (nextContext !== context || nextDistractors.join(',') !== oldDistractors.join(','))) {
        const finalReview = await evaluateQuizContent(word, nextContext, nextMeaning, nextPos, nextDistractors);
        const usedSafeFallback = reasons.includes('used_safe_distractors_fallback');
        const finalSafeReview = usedSafeFallback ? await evaluateSafeDistractors(word, nextContext, nextMeaning, nextPos, nextDistractors) : null;
        const distractorsOk = usedSafeFallback ? Boolean(finalSafeReview?.distractorsOk) : Boolean(finalReview?.distractorsOk);
        if (!finalReview || !finalReview.contextOk || !distractorsOk) {
            reasons.push('final_review_failed');
            if (!finalReview?.contextOk) nextContext = context;
            if (!distractorsOk) nextDistractors = oldDistractors;
        }
    }

    const updateFields = {};
    if (nextMeaning && nextMeaning !== meaning) updateFields.Meaning = nextMeaning;
    if (nextPos && nextPos !== pos) updateFields.POS = nextPos;
    if (nextCNMeaning && nextCNMeaning !== cnMeaning) updateFields.CN_Meaning = nextCNMeaning;
    if (nextContext && nextContext !== context) updateFields.Context = nextContext;
    if (nextDistractors.join(',') !== oldDistractors.join(',')) updateFields.Distractors = nextDistractors.join(',');

    if (options.apply && Object.keys(updateFields).length > 0) {
        await updateRecord(WORD_TABLE, record.record_id, updateFields);
    }

    return {
        skipped: false,
        word,
        recordId: record.record_id,
        reasons,
        before: { meaning, pos, cnMeaning, context, distractors: oldDistractors },
        after: { meaning: nextMeaning, pos: nextPos, cnMeaning: nextCNMeaning, context: nextContext, distractors: nextDistractors },
        updated: Object.keys(updateFields),
        applied: options.apply
    };
}

async function main() {
    const options = {
        apply: hasFlag('apply'),
        force: hasFlag('force'),
        contextOnly: hasFlag('context-only'),
        distractorsOnly: hasFlag('distractors-only'),
        reviewAI: hasFlag('review-ai'),
        showReview: hasFlag('show-review'),
        skipMeaningReview: hasFlag('skip-meaning-review'),
        user: getArg('user'),
        recordId: getArg('record'),
        limit: Number(getArg('limit', '20')),
        offset: Number(getArg('offset', '0')),
        delay: Number(getArg('delay', '1200'))
    };

    console.log(`=== 词库质量${options.apply ? '修复' : '审计预览'} ===`);
    console.log(`AI_PROVIDER=${process.env.AI_PROVIDER || (process.env.DEEPSEEK_API_KEY ? 'deepseek' : (process.env.OPENAI_API_KEY ? 'openai' : 'minimax'))}`);
    console.log(`OPENAI_MODEL=${process.env.OPENAI_MODEL || 'gpt-4.1-mini'}, DEEPSEEK_MODEL=${process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash'}`);
    console.log(`apply=${options.apply}, reviewAI=${options.reviewAI}, user=${options.user || 'ALL'}, limit=${options.limit}, offset=${options.offset}\n`);

    const records = (await getRecords(WORD_TABLE))
        .filter(r => shouldHandle(r, options))
        .slice(options.offset, options.offset + options.limit);

    const stats = { checked: 0, skipped: 0, changed: 0, failed: 0 };

    for (const record of records) {
        stats.checked++;
        try {
            const result = await repairRecord(record, options);
            if (result.skipped) {
                stats.skipped++;
                const reasonText = result.reasons.length > 0 ? ` | ${[...new Set(result.reasons)].join(', ')}` : '';
                console.log(`[跳过] ${result.word}${reasonText}`);
            } else {
                if (result.updated.length > 0) stats.changed++;
                console.log(`\n[${result.applied ? '已写入' : '预览'}] ${result.word} (${result.recordId})`);
                console.log(`原因: ${[...new Set(result.reasons)].join(', ') || 'force'}`);
                if (result.updated.includes('Meaning')) {
                    console.log(`Meaning: ${result.before.meaning || '(空)'}`);
                    console.log(`    ->   ${result.after.meaning}`);
                }
                if (result.updated.includes('POS')) {
                    console.log(`POS: ${result.before.pos || '(空)'}`);
                    console.log(` ->  ${result.after.pos}`);
                }
                if (result.updated.includes('CN_Meaning')) {
                    console.log(`CN_Meaning: ${result.before.cnMeaning || '(空)'}`);
                    console.log(`       ->   ${result.after.cnMeaning}`);
                }
                if (result.updated.includes('Context')) {
                    console.log(`Context: ${result.before.context || '(空)'}`);
                    console.log(`   ->   ${result.after.context}`);
                }
                if (result.updated.includes('Distractors')) {
                    console.log(`Distractors: ${result.before.distractors.join(', ') || '(空)'}`);
                    console.log(`        ->   ${result.after.distractors.join(', ')}`);
                }
                if (result.updated.length === 0) {
                    console.log('未生成可写入的新内容');
                }
            }
        } catch (e) {
            stats.failed++;
            console.log(`[失败] ${fieldValue(record.fields.Word)}: ${e.message}`);
        }

        await new Promise(r => setTimeout(r, options.delay));
    }

    console.log('\n=== 完成 ===');
    console.log(`检查: ${stats.checked}, 跳过: ${stats.skipped}, 可更新/已更新: ${stats.changed}, 失败: ${stats.failed}`);
    if (!options.apply) console.log('当前是 dry-run，确认结果后加 --apply 才会写入飞书。');
}

main().then(() => process.exit(0)).catch(e => {
    console.error('错误:', e);
    process.exit(1);
});

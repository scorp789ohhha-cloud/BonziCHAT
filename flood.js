// Flood / bot protection module
// Tracks per-IP connection rate, per-user message rate,
// duplicate-message detection (resilient to bypass tricks),
// cosmetic-command throttling, and a strike->ban system.

const Ban = require('./ban.js');

// ----- tunables --------------------------------------------------------
const CONN_WINDOW_MS    = 10 * 1000;
const CONN_MAX          = 5;          // max new connections per IP per window
const TALK_WINDOW_MS    = 8 * 1000;
const TALK_MAX          = 5;          // max messages per user per window
const TALK_LONG_MS      = 20 * 1000;
const TALK_LONG_MAX     = 10;         // longer window cap
const DUP_WINDOW_MS     = 30 * 1000;
const DUP_MAX           = 2;          // same normalized text per window
const COSMETIC_WINDOW_MS= 15 * 1000;
const COSMETIC_MAX      = 4;          // color/hat/name changes per window
const UPLOAD_WINDOW_MS  = 60 * 1000;
const UPLOAD_MAX        = 5;          // uploads per IP per minute

const STRIKE_WINDOW_MS  = 5 * 60 * 1000;
const STRIKE_MAX        = 5;          // strikes in window -> auto-ban
const AUTO_BAN_MINUTES  = 10;
// -----------------------------------------------------------------------

const connTimes     = new Map(); // ip -> [timestamps]
const talkTimes     = new Map(); // guid -> [timestamps]
const dupHistory    = new Map(); // guid -> Map<normText, [timestamps]>
const cosmeticTimes = new Map(); // guid -> [timestamps]
const uploadTimes   = new Map(); // ip -> [timestamps]
const strikes       = new Map(); // ip -> [timestamps]

function pruneOlder(arr, cutoff) {
    while (arr.length && arr[0] < cutoff) arr.shift();
}

function pushAndCount(map, key, now, windowMs) {
    let arr = map.get(key);
    if (!arr) { arr = []; map.set(key, arr); }
    pruneOlder(arr, now - windowMs);
    arr.push(now);
    return arr.length;
}

// Strip zero-width/invisible/whitespace-bypass chars and normalize trailing
// junk that bots use to make every message "unique".
function normalizeText(text) {
    if (typeof text !== 'string') return '';
    let s = text;
    // zero-width / invisible chars
    s = s.replace(/[\u200B-\u200F\u2028-\u202F\u205F-\u206F\u2060-\u2064\uFEFF\u180E\u2800]/g, '');
    // collapse all unicode whitespace to single space
    s = s.replace(/\s+/g, ' ').trim();
    // strip trailing repeated punctuation/dashes/numbers used as bypass tail
    s = s.replace(/[\s\-_.,!?+0-9]+$/g, '');
    return s.toLowerCase();
}

function recordStrike(ip, reason) {
    if (!ip) return false;
    const now = Date.now();
    const count = pushAndCount(strikes, ip, now, STRIKE_WINDOW_MS);
    if (count >= STRIKE_MAX) {
        try {
            Ban.addBan(ip, AUTO_BAN_MINUTES, 'Auto-ban: ' + (reason || 'flood'));
        } catch (e) {}
        strikes.delete(ip);
        return true; // banned
    }
    return false;
}

// ----- public API ------------------------------------------------------

// returns { allow, reason }
exports.checkConnection = function (ip) {
    if (!ip) return { allow: true };
    const now = Date.now();
    const count = pushAndCount(connTimes, ip, now, CONN_WINDOW_MS);
    if (count > CONN_MAX) {
        recordStrike(ip, 'connection flood');
        return { allow: false, reason: 'Too many connections from your IP. Slow down.' };
    }
    return { allow: true };
};

// returns { allow, reason, banned }
exports.checkTalk = function (guid, ip, rawText) {
    const now = Date.now();
    const norm = normalizeText(rawText);

    // Reject messages that are empty after stripping bypass chars.
    if (norm.length === 0 && rawText && rawText.length > 0) {
        const banned = recordStrike(ip, 'invisible-char spam');
        return { allow: false, reason: 'empty', banned };
    }

    const shortCount = pushAndCount(talkTimes, guid, now, TALK_WINDOW_MS);
    if (shortCount > TALK_MAX) {
        const banned = recordStrike(ip, 'talk rate');
        return { allow: false, reason: 'rate', banned };
    }
    // long window check (use same array - it holds at most TALK_LONG_MS worth)
    const arr = talkTimes.get(guid);
    pruneOlder(arr, now - TALK_LONG_MS);
    if (arr.length > TALK_LONG_MAX) {
        const banned = recordStrike(ip, 'talk sustained');
        return { allow: false, reason: 'rate', banned };
    }

    // Duplicate detection on normalized text
    let perUser = dupHistory.get(guid);
    if (!perUser) { perUser = new Map(); dupHistory.set(guid, perUser); }
    let dupArr = perUser.get(norm);
    if (!dupArr) { dupArr = []; perUser.set(norm, dupArr); }
    pruneOlder(dupArr, now - DUP_WINDOW_MS);
    dupArr.push(now);
    if (dupArr.length > DUP_MAX) {
        const banned = recordStrike(ip, 'duplicate spam');
        return { allow: false, reason: 'duplicate', banned };
    }
    // GC: drop empty buckets occasionally
    if (perUser.size > 50) {
        for (const [k, v] of perUser) {
            pruneOlder(v, now - DUP_WINDOW_MS);
            if (v.length === 0) perUser.delete(k);
        }
    }
    return { allow: true };
};

// returns { allow, reason, banned }
exports.checkCosmetic = function (guid, ip) {
    const now = Date.now();
    const count = pushAndCount(cosmeticTimes, guid, now, COSMETIC_WINDOW_MS);
    if (count > COSMETIC_MAX) {
        const banned = recordStrike(ip, 'cosmetic spam');
        return { allow: false, reason: 'rate', banned };
    }
    return { allow: true };
};

// returns { allow, reason }
exports.checkUpload = function (ip) {
    if (!ip) return { allow: true };
    const now = Date.now();
    const count = pushAndCount(uploadTimes, ip, now, UPLOAD_WINDOW_MS);
    if (count > UPLOAD_MAX) {
        recordStrike(ip, 'upload flood');
        return { allow: false, reason: 'Too many uploads. Wait a minute.' };
    }
    return { allow: true };
};

// Cleanup on user disconnect to free per-guid state
exports.forgetUser = function (guid) {
    talkTimes.delete(guid);
    dupHistory.delete(guid);
    cosmeticTimes.delete(guid);
};

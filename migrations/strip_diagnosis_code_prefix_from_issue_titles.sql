-- Strips the legacy "[CODE] " diagnosis-code prefix from issue titles.
--
-- Auto-created issues used to be titled like:
--
--     [I-001] Direction reversal
--     [DR_001] Some diagnosis label
--
-- The issues list now always renders a coloured diagnosis-code badge
-- alongside the title, so duplicating the code in the title itself was
-- redundant noise. The runner no longer adds this prefix; this
-- migration normalises the historical titles to match.
--
-- Idempotent: running again is a no-op once titles are clean. The
-- regex matches a leading `[...]` token followed by whitespace, where
-- the bracketed content contains no spaces or closing brackets — this
-- is loose enough to cover both `I-001` and `DR_001` style codes
-- without accidentally clobbering titles that legitimately start with
-- a bracketed phrase like "[Discussion] …".

UPDATE issues
SET title = regexp_replace(title, '^\[[^\s\]]+\]\s+', '')
WHERE title ~ '^\[[^\s\]]+\]\s+';

-- KEYS[1]=tokens KEYS[2]=last_refill
-- ARGV: limit(capacity), window_ms, now_ms
local capacity = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local refill = capacity / window
local tokens = tonumber(redis.call('GET', KEYS[1]))
local last = tonumber(redis.call('GET', KEYS[2]))
if not tokens then tokens = capacity end
if not last then last = now end
local delta = math.max(0, now - last)
tokens = math.min(capacity, tokens + delta * refill)
if tokens < 1 then
  local need = 1 - tokens
  local retry = math.ceil(need / refill)
  local full = math.ceil(capacity / refill)
  return {0, 0, capacity, now + full, retry}
end
tokens = tokens - 1
redis.call('SET', KEYS[1], tostring(tokens))
redis.call('SET', KEYS[2], tostring(now))
redis.call('PEXPIRE', KEYS[1], window * 3)
redis.call('PEXPIRE', KEYS[2], window * 3)
local remaining = math.floor(tokens)
local full = math.ceil((capacity - tokens) / refill)
return {1, remaining, capacity, now + full, 0}

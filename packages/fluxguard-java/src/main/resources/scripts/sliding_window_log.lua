-- KEYS[1] = zset key
-- ARGV: limit, window_ms, now_ms, member unique id
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local member = ARGV[4]
local cutoff = now - window
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', cutoff)
local count = redis.call('ZCARD', KEYS[1])
if count >= limit then
  local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  local ts = tonumber(oldest[2])
  local reset = ts + window
  return {0, 0, limit, reset, reset - now}
end
redis.call('ZADD', KEYS[1], now, member)
redis.call('PEXPIRE', KEYS[1], window * 2)
local newCount = count + 1
local reset = now + window
return {1, limit - newCount, limit, reset, 0}

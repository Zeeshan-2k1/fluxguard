-- KEYS[1]=prev KEYS[2]=curr
-- ARGV: limit, window_ms, now_ms
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local prev = tonumber(redis.call('GET', KEYS[1])) or 0
local curr = tonumber(redis.call('GET', KEYS[2])) or 0
local elapsed = now % window
local weight = 1 - (elapsed / window)
local estimated = math.floor(prev * weight) + curr
if estimated >= limit then
  local currStart = now - elapsed
  local reset = currStart + window
  return {0, estimated, limit, reset, reset - now}
end
redis.call('INCR', KEYS[2])
redis.call('PEXPIRE', KEYS[2], window * 2)
redis.call('PEXPIRE', KEYS[1], window * 2)
local nextEst = estimated + 1
local currStart = now - elapsed
local reset = currStart + window
return {1, limit - nextEst, limit, reset, 0}
